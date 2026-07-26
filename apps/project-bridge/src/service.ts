import path from "node:path";
import {
  createReactFrameworkAdapter,
  createReactSourceBindingAdapter,
} from "@afrodite/adapter-react";
import {
  createSolidFrameworkAdapter,
  createSolidSourceBindingAdapter,
} from "@afrodite/adapter-solid";
import { SourceBindingAdapterRegistry } from "@afrodite/binding-core";
import {
  FrameworkAdapterRegistry,
  createPatchPreview,
  type FrameworkOperation,
  type PatchPreview,
  type SourcePatchPlan,
} from "@afrodite/framework-core";
import type {
  BindingDiscoveryRequest,
  BindingDiscoveryResult,
  BindingMarkerPlanRequest,
  BindingPatchPlanView,
  BridgeApplyResult,
  BridgeHealthResponse,
  BridgeOperation,
  BridgePatchPlanView,
  BridgeSourceSnapshot,
} from "@afrodite/protocol";
import {
  FileSystemSourceRepository,
  ProcessVerificationRunner,
  VerifiedWriteService,
  createPatchApproval,
  type SourceRepository,
  type VerificationRunner,
} from "@afrodite/verified-write";
import { createUnifiedDiff } from "@afrodite/verified-write/diff";

interface StoredPlan {
  readonly plan: SourcePatchPlan;
  readonly preview: PatchPreview;
  readonly createdAt: number;
}

export interface ProjectBridgeServiceOptions {
  readonly projectRoot: string;
  readonly repository?: SourceRepository;
  readonly verificationRunner?: VerificationRunner;
  readonly planTtlMs?: number;
  readonly now?: () => number;
}

export class ProjectBridgeServiceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ProjectBridgeServiceError";
    this.code = code;
  }
}

export class ProjectBridgeService {
  readonly #projectRoot: string;
  readonly #repository: SourceRepository;
  readonly #writeService: VerifiedWriteService;
  readonly #registry = new FrameworkAdapterRegistry();
  readonly #bindingRegistry = new SourceBindingAdapterRegistry();
  readonly #plans = new Map<string, StoredPlan>();
  readonly #planTtlMs: number;
  readonly #now: () => number;

  constructor(options: ProjectBridgeServiceOptions) {
    this.#projectRoot = path.resolve(options.projectRoot);
    this.#repository = options.repository ?? new FileSystemSourceRepository(this.#projectRoot);
    const runner = options.verificationRunner ?? new ProcessVerificationRunner({
      projectRoot: this.#projectRoot,
    });
    this.#writeService = new VerifiedWriteService(this.#repository, runner);
    this.#planTtlMs = options.planTtlMs ?? 10 * 60_000;
    this.#now = options.now ?? Date.now;

    this.#registry.register(createSolidFrameworkAdapter());
    this.#registry.register(createReactFrameworkAdapter());
    this.#bindingRegistry.register(createSolidSourceBindingAdapter());
    this.#bindingRegistry.register(createReactSourceBindingAdapter());
  }

  health(): BridgeHealthResponse {
    return {
      ok: true,
      bridgeVersion: 1,
      projectName: path.basename(this.#projectRoot),
      adapters: this.#registry.list().map((adapter) => ({
        frameworkId: adapter.descriptor.frameworkId,
        adapterId: adapter.descriptor.adapterId,
        displayName: adapter.descriptor.displayName,
        capabilities: { ...adapter.descriptor.capabilities },
      })),
    };
  }

  async readSource(repositoryPath: string): Promise<BridgeSourceSnapshot> {
    const source = await this.#repository.read(repositoryPath);
    return {
      repositoryPath: source.repositoryPath,
      content: source.content,
      version: source.version,
    };
  }

  async discoverBindings(
    request: BindingDiscoveryRequest,
  ): Promise<BindingDiscoveryResult> {
    const adapter = this.#bindingRegistry.get(request.adapterId);
    if (!adapter) {
      throw new ProjectBridgeServiceError(
        "BINDING_ADAPTER_NOT_FOUND",
        `No source binding adapter is registered as ${request.adapterId}.`,
      );
    }

    const source = await this.#repository.read(request.repositoryPath);
    const result = adapter.discoverCandidates(request, source);
    return {
      frameworkId: result.frameworkId,
      adapterId: result.adapterId,
      repositoryPath: result.repositoryPath,
      sourceVersion: result.sourceVersion,
      candidates: result.candidates.map((candidate) => ({
        ...candidate,
        diagnostics: candidate.diagnostics.map((diagnostic) => ({ ...diagnostic })),
      })),
      diagnostics: result.diagnostics.map((diagnostic) => ({ ...diagnostic })),
    };
  }

  async planBinding(
    request: BindingMarkerPlanRequest,
  ): Promise<BindingPatchPlanView> {
    this.#pruneExpiredPlans();
    const adapter = this.#bindingRegistry.get(request.adapterId);
    if (!adapter) {
      throw new ProjectBridgeServiceError(
        "BINDING_ADAPTER_NOT_FOUND",
        `No source binding adapter is registered as ${request.adapterId}.`,
      );
    }

    const source = await this.#repository.read(request.repositoryPath);
    const result = adapter.planStableMarker(request, source);
    const preview = createPatchPreview(result.plan, source);
    const blocking = preview.diagnostics.some((diagnostic) => diagnostic.severity === "error");

    if (result.sourceWriteRequired && !blocking && preview.changed) {
      this.#plans.set(result.plan.planId, {
        plan: result.plan,
        preview,
        createdAt: this.#now(),
      });
    }

    return {
      planId: result.plan.planId,
      repositoryPath: result.plan.repositoryPath,
      sourceVersion: result.plan.sourceVersion,
      changed: preview.changed,
      diff: createUnifiedDiff(preview),
      diagnostics: preview.diagnostics.map((diagnostic) => ({ ...diagnostic })),
      verification: result.plan.verification.map((step) => ({ ...step })),
      sourceWriteRequired: result.sourceWriteRequired,
      proposedBinding: { ...result.proposedBinding },
    };
  }

  async planPatch(operation: BridgeOperation): Promise<BridgePatchPlanView> {
    this.#pruneExpiredPlans();
    const adapter = this.#registry.resolveForBinding(operation.binding);
    if (!adapter) {
      throw new ProjectBridgeServiceError(
        "ADAPTER_NOT_FOUND",
        "No registered framework adapter matches the selected source binding.",
      );
    }
    if (!adapter.descriptor.capabilities.sourcePatching || !adapter.planPatch) {
      throw new ProjectBridgeServiceError(
        "SOURCE_PATCHING_UNAVAILABLE",
        `${adapter.descriptor.displayName} does not provide source patch planning.`,
      );
    }

    const source = await this.#repository.read(operation.binding.repositoryPath);
    const plan = adapter.planPatch(operation as FrameworkOperation, source);
    const preview = createPatchPreview(plan, source);
    const blocking = preview.diagnostics.some((diagnostic) => diagnostic.severity === "error");

    if (!blocking && preview.changed) {
      this.#plans.set(plan.planId, {
        plan,
        preview,
        createdAt: this.#now(),
      });
    }

    return {
      planId: plan.planId,
      repositoryPath: plan.repositoryPath,
      sourceVersion: plan.sourceVersion,
      changed: preview.changed,
      diff: createUnifiedDiff(preview),
      diagnostics: preview.diagnostics.map((diagnostic) => ({ ...diagnostic })),
      verification: plan.verification.map((step) => ({ ...step })),
    };
  }

  async applyPatch(
    planId: string,
    sourceVersion: string,
    approvedBy?: string,
  ): Promise<BridgeApplyResult> {
    this.#pruneExpiredPlans();
    const stored = this.#plans.get(planId);
    if (!stored) {
      throw new ProjectBridgeServiceError(
        "PLAN_NOT_FOUND",
        "The patch plan is missing, blocked, expired, or was already applied. Create a new plan.",
      );
    }
    if (stored.preview.sourceVersion !== sourceVersion) {
      throw new ProjectBridgeServiceError(
        "APPROVAL_SOURCE_VERSION_MISMATCH",
        "The approval does not match the exact source version shown in the diff.",
      );
    }

    const approval = createPatchApproval(stored.preview, approvedBy);
    const result = await this.#writeService.apply(stored.plan, approval);
    this.#plans.delete(planId);

    return {
      status: result.status,
      planId: result.planId,
      beforeVersion: result.before.version,
      ...(result.after ? { afterVersion: result.after.version } : {}),
      ...(result.restored ? { restoredVersion: result.restored.version } : {}),
      diagnostics: result.diagnostics.map((diagnostic) => ({ ...diagnostic })),
      verification: result.verification.map((execution) => ({
        step: { ...execution.step },
        ok: execution.ok,
        ...(execution.exitCode === undefined ? {} : { exitCode: execution.exitCode }),
        stdout: execution.stdout,
        stderr: execution.stderr,
      })),
    };
  }

  #pruneExpiredPlans(): void {
    const threshold = this.#now() - this.#planTtlMs;
    for (const [planId, stored] of this.#plans) {
      if (stored.createdAt < threshold) this.#plans.delete(planId);
    }
  }
}
