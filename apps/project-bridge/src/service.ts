import path from "node:path";
import {
  createReactFrameworkAdapter,
  createReactScreenImportAdapter,
  createReactSourceBindingAdapter,
} from "@afrodite/adapter-react";
import {
  createSolidFrameworkAdapter,
  createSolidScreenImportAdapter,
  createSolidSourceBindingAdapter,
} from "@afrodite/adapter-solid";
import { SourceBindingAdapterRegistry } from "@afrodite/binding-core";
import {
  FrameworkAdapterRegistry,
  createPatchPreview,
  type FrameworkOperation,
  type PatchPreview,
  type SourcePatchPlan,
  type SourceSnapshot,
} from "@afrodite/framework-core";
import { ScreenImportAdapterRegistry } from "@afrodite/import-core";
import {
  importScreenGraph,
  type ScreenImportGraphRequest,
} from "@afrodite/import-core/graph";
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
  BridgeStyleOperation,
  BridgeTransactionApplyResult,
  BridgeTransactionOperation,
  BridgeTransactionPlanView,
  BridgeTransactionSourceApproval,
  BridgeVariantOperation,
  ScreenImportRequest,
  ScreenImportResult,
} from "@afrodite/protocol";
import {
  createDefaultStyleStrategyRegistry,
  resolveStyleSourcePath,
  type StylePatchOperation,
} from "@afrodite/style-core";
import {
  createDefaultVariantStrategyRegistry,
  resolveVariantSourcePath,
  type VariantPatchOperation,
} from "@afrodite/variants-core";
import {
  FileSystemSourceRepository,
  ProcessVerificationRunner,
  VerifiedMultiFileTransactionService,
  VerifiedWriteService,
  createMultiFileTransactionPlan,
  createPatchApproval,
  type MultiFileTransactionApproval,
  type MultiFileTransactionPlan,
  type MultiFileTransactionPreview,
  type SourceRepository,
  type VerificationExecution,
  type VerificationRunner,
} from "@afrodite/verified-write";
import { createUnifiedDiff } from "@afrodite/verified-write/diff";

interface StoredPlan {
  readonly plan: SourcePatchPlan;
  readonly preview: PatchPreview;
  readonly createdAt: number;
}

interface StoredTransaction {
  readonly plan: MultiFileTransactionPlan;
  readonly preview: MultiFileTransactionPreview;
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
  readonly #transactionService: VerifiedMultiFileTransactionService;
  readonly #registry = new FrameworkAdapterRegistry();
  readonly #bindingRegistry = new SourceBindingAdapterRegistry();
  readonly #importRegistry = new ScreenImportAdapterRegistry();
  readonly #styleRegistry = createDefaultStyleStrategyRegistry();
  readonly #variantRegistry = createDefaultVariantStrategyRegistry();
  readonly #plans = new Map<string, StoredPlan>();
  readonly #transactions = new Map<string, StoredTransaction>();
  readonly #planTtlMs: number;
  readonly #now: () => number;

  constructor(options: ProjectBridgeServiceOptions) {
    this.#projectRoot = path.resolve(options.projectRoot);
    this.#repository = options.repository ?? new FileSystemSourceRepository(this.#projectRoot);
    const runner = options.verificationRunner ?? new ProcessVerificationRunner({
      projectRoot: this.#projectRoot,
    });
    this.#writeService = new VerifiedWriteService(this.#repository, runner);
    this.#transactionService = new VerifiedMultiFileTransactionService(this.#repository, runner);
    this.#planTtlMs = options.planTtlMs ?? 10 * 60_000;
    this.#now = options.now ?? Date.now;

    this.#registry.register(createSolidFrameworkAdapter());
    this.#registry.register(createReactFrameworkAdapter());
    this.#bindingRegistry.register(createSolidSourceBindingAdapter());
    this.#bindingRegistry.register(createReactSourceBindingAdapter());
    this.#importRegistry.register(createSolidScreenImportAdapter());
    this.#importRegistry.register(createReactScreenImportAdapter());
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

  async importScreen(request: ScreenImportRequest): Promise<ScreenImportResult> {
    const adapter = this.#importRegistry.get(request.adapterId);
    if (!adapter) {
      throw new ProjectBridgeServiceError(
        "SCREEN_IMPORT_ADAPTER_NOT_FOUND",
        `No screen import adapter is registered as ${request.adapterId}.`,
      );
    }

    const result = await importScreenGraph(
      adapter,
      request as ScreenImportGraphRequest,
      { read: (repositoryPath) => this.#repository.read(repositoryPath) },
    );
    return cloneJson(result) as ScreenImportResult;
  }

  async discoverBindings(request: BindingDiscoveryRequest): Promise<BindingDiscoveryResult> {
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

  async planBinding(request: BindingMarkerPlanRequest): Promise<BindingPatchPlanView> {
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
    const view = this.#createPlanView(result.plan, source, result.sourceWriteRequired);
    return {
      ...view,
      sourceWriteRequired: result.sourceWriteRequired,
      proposedBinding: cloneBinding(result.proposedBinding),
    };
  }

  async planPatch(operation: BridgeOperation): Promise<BridgePatchPlanView> {
    this.#pruneExpiredPlans();
    const { plan, source } = await this.#createLayoutPlan(operation);
    return this.#createPlanView(plan, source, true);
  }

  async planStylePatch(operation: BridgeStyleOperation): Promise<BridgePatchPlanView> {
    this.#pruneExpiredPlans();
    const { plan, source } = await this.#createStylePlan(operation);
    return this.#createPlanView(plan, source, true);
  }

  async planVariantPatch(operation: BridgeVariantOperation): Promise<BridgePatchPlanView> {
    this.#pruneExpiredPlans();
    const { plan, source } = await this.#createVariantPlan(operation);
    return this.#createPlanView(plan, source, true);
  }

  async planTransaction(
    operations: readonly BridgeTransactionOperation[],
  ): Promise<BridgeTransactionPlanView> {
    this.#pruneExpiredPlans();
    const plans: SourcePatchPlan[] = [];

    for (const entry of operations) {
      switch (entry.type) {
        case "layout":
          plans.push((await this.#createLayoutPlan(entry.operation)).plan);
          break;
        case "style":
          plans.push((await this.#createStylePlan(entry.operation)).plan);
          break;
        case "variant":
          plans.push((await this.#createVariantPlan(entry.operation)).plan);
          break;
      }
    }

    const transaction = createMultiFileTransactionPlan({ plans });
    const preview = await this.#transactionService.preview(transaction);
    const view = this.#createTransactionView(preview);
    const blocking = [
      ...preview.diagnostics,
      ...preview.files.flatMap((file) => file.diagnostics),
    ].some((diagnostic) => diagnostic.severity === "error");

    if (!blocking && preview.changedFiles === preview.files.length) {
      this.#transactions.set(transaction.transactionId, {
        plan: transaction,
        preview,
        createdAt: this.#now(),
      });
    }
    return view;
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
      verification: result.verification.map(cloneVerificationExecution),
    };
  }

  async applyTransaction(
    transactionId: string,
    sources: readonly BridgeTransactionSourceApproval[],
    approvedBy?: string,
  ): Promise<BridgeTransactionApplyResult> {
    this.#pruneExpiredPlans();
    const stored = this.#transactions.get(transactionId);
    if (!stored) {
      throw new ProjectBridgeServiceError(
        "TRANSACTION_NOT_FOUND",
        "The transaction is missing, blocked, expired, or was already applied. Create a new transaction plan.",
      );
    }

    const approval: MultiFileTransactionApproval = approvedBy
      ? {
          transactionId,
          sources: sources.map((source) => ({ ...source })),
          approved: true,
          approvedAt: new Date().toISOString(),
          approvedBy,
        }
      : {
          transactionId,
          sources: sources.map((source) => ({ ...source })),
          approved: true,
          approvedAt: new Date().toISOString(),
        };
    const result = await this.#transactionService.apply(stored.plan, approval);
    this.#transactions.delete(transactionId);

    return {
      status: result.status,
      transactionId: result.transactionId,
      files: result.files.map((file) => ({
        repositoryPath: file.repositoryPath,
        beforeVersion: file.before.version,
        ...(file.after ? { afterVersion: file.after.version } : {}),
        ...(file.restored ? { restoredVersion: file.restored.version } : {}),
      })),
      diagnostics: result.diagnostics.map((diagnostic) => ({ ...diagnostic })),
      verification: result.verification.map(cloneVerificationExecution),
    };
  }

  async #createLayoutPlan(
    operation: BridgeOperation,
  ): Promise<{ readonly plan: SourcePatchPlan; readonly source: SourceSnapshot }> {
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
    return {
      plan: adapter.planPatch(operation as FrameworkOperation, source),
      source,
    };
  }

  async #createStylePlan(
    operation: BridgeStyleOperation,
  ): Promise<{ readonly plan: SourcePatchPlan; readonly source: SourceSnapshot }> {
    const normalized = operation as StylePatchOperation;
    this.#assertOwnershipMatches(operation.binding.styleOwnership, operation.ownership);
    const strategy = this.#styleRegistry.resolve(normalized);
    if (!strategy) {
      throw new ProjectBridgeServiceError(
        "STYLE_STRATEGY_NOT_FOUND",
        `No style strategy supports ${operation.ownership.strategy} for ${operation.binding.frameworkId ?? "the selected framework"}.`,
      );
    }

    const sourcePath = resolveStyleSourcePath(normalized);
    const source = await this.#repository.read(sourcePath);
    return { plan: strategy.plan(normalized, source), source };
  }

  async #createVariantPlan(
    operation: BridgeVariantOperation,
  ): Promise<{ readonly plan: SourcePatchPlan; readonly source: SourceSnapshot }> {
    const normalized = operation as VariantPatchOperation;
    this.#assertOwnershipMatches(operation.binding.styleOwnership, operation.ownership);
    const strategy = this.#variantRegistry.resolve(normalized);
    if (!strategy) {
      throw new ProjectBridgeServiceError(
        "VARIANT_STRATEGY_NOT_FOUND",
        `No variant strategy supports ${operation.ownership.strategy} for ${operation.binding.frameworkId ?? "the selected framework"}.`,
      );
    }
    const sourcePath = resolveVariantSourcePath(normalized);
    const source = await this.#repository.read(sourcePath);
    return { plan: strategy.plan(normalized, source), source };
  }

  #assertOwnershipMatches(bindingOwnership: unknown, operationOwnership: unknown): void {
    if (bindingOwnership === undefined) return;
    if (JSON.stringify(bindingOwnership) !== JSON.stringify(operationOwnership)) {
      throw new ProjectBridgeServiceError(
        "STYLE_OWNERSHIP_MISMATCH",
        "The requested ownership does not match the ownership stored in the source binding.",
      );
    }
  }

  #createPlanView(
    plan: SourcePatchPlan,
    source: SourceSnapshot,
    storeWhenChanged: boolean,
  ): BridgePatchPlanView {
    const preview = createPatchPreview(plan, source);
    const blocking = preview.diagnostics.some((diagnostic) => diagnostic.severity === "error");
    if (storeWhenChanged && !blocking && preview.changed) {
      this.#plans.set(plan.planId, { plan, preview, createdAt: this.#now() });
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

  #createTransactionView(preview: MultiFileTransactionPreview): BridgeTransactionPlanView {
    return {
      transactionId: preview.transactionId,
      files: preview.files.map((file) => ({
        planId: file.planId,
        repositoryPath: file.repositoryPath,
        sourceVersion: file.sourceVersion,
        changed: file.changed,
        diff: createUnifiedDiff({
          repositoryPath: file.repositoryPath,
          before: file.before,
          after: file.after,
        }),
        diagnostics: file.diagnostics.map((diagnostic) => ({ ...diagnostic })),
      })),
      changedFiles: preview.changedFiles,
      diagnostics: preview.diagnostics.map((diagnostic) => ({ ...diagnostic })),
      verification: preview.verification.map((step) => ({ ...step })),
    };
  }

  #pruneExpiredPlans(): void {
    const threshold = this.#now() - this.#planTtlMs;
    for (const [planId, stored] of this.#plans) {
      if (stored.createdAt < threshold) this.#plans.delete(planId);
    }
    for (const [transactionId, stored] of this.#transactions) {
      if (stored.createdAt < threshold) this.#transactions.delete(transactionId);
    }
  }
}

function cloneBinding<T extends { readonly styleOwnership?: unknown }>(binding: T): T {
  return cloneJson(binding);
}

function cloneVerificationExecution(execution: VerificationExecution): VerificationExecution {
  return {
    step: { ...execution.step },
    ok: execution.ok,
    ...(execution.exitCode === undefined ? {} : { exitCode: execution.exitCode }),
    stdout: execution.stdout,
    stderr: execution.stderr,
  };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
