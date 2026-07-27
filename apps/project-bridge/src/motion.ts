import path from "node:path";
import {
  createPatchPreview,
  type PatchPreview,
  type SourcePatchPlan,
} from "@afrodite/framework-core";
import {
  createDefaultMotionStrategyRegistry,
  resolveMotionSourcePath,
  type MotionPatchOperation,
} from "@afrodite/motion-core";
import type {
  BridgeApplyResult,
  BridgeMotionOperation,
  BridgePatchPlanView,
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

interface StoredMotionPlan {
  readonly plan: SourcePatchPlan;
  readonly preview: PatchPreview;
  readonly createdAt: number;
}

export interface MotionBridgeServiceOptions {
  readonly projectRoot: string;
  readonly repository?: SourceRepository;
  readonly verificationRunner?: VerificationRunner;
  readonly planTtlMs?: number;
  readonly now?: () => number;
}

export class MotionBridgeServiceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MotionBridgeServiceError";
    this.code = code;
  }
}

export class MotionBridgeService {
  readonly #repository: SourceRepository;
  readonly #writeService: VerifiedWriteService;
  readonly #registry = createDefaultMotionStrategyRegistry();
  readonly #plans = new Map<string, StoredMotionPlan>();
  readonly #planTtlMs: number;
  readonly #now: () => number;

  constructor(options: MotionBridgeServiceOptions) {
    const projectRoot = path.resolve(options.projectRoot);
    this.#repository = options.repository ?? new FileSystemSourceRepository(projectRoot);
    const runner = options.verificationRunner ?? new ProcessVerificationRunner({ projectRoot });
    this.#writeService = new VerifiedWriteService(this.#repository, runner);
    this.#planTtlMs = options.planTtlMs ?? 10 * 60_000;
    this.#now = options.now ?? Date.now;
  }

  async planMotionPatch(operation: BridgeMotionOperation): Promise<BridgePatchPlanView> {
    this.#prune();
    const normalized = operation as MotionPatchOperation;
    const strategy = this.#registry.resolve(normalized);
    if (!strategy) {
      throw new MotionBridgeServiceError(
        "MOTION_STRATEGY_NOT_FOUND",
        `No motion source strategy supports ${operation.ownership.strategy}.`,
      );
    }
    const source = await this.#repository.read(resolveMotionSourcePath(normalized));
    const plan = strategy.plan(normalized, source);
    const preview = createPatchPreview(plan, source);
    const blocking = preview.diagnostics.some((diagnostic) => diagnostic.severity === "error");
    if (!blocking && preview.changed) {
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

  async applyMotionPatch(
    planId: string,
    sourceVersion: string,
    approvedBy?: string,
  ): Promise<BridgeApplyResult> {
    this.#prune();
    const stored = this.#plans.get(planId);
    if (!stored) {
      throw new MotionBridgeServiceError(
        "MOTION_PLAN_NOT_FOUND",
        "The motion patch plan is missing, blocked, expired, or already applied. Create a fresh plan.",
      );
    }
    if (stored.preview.sourceVersion !== sourceVersion) {
      throw new MotionBridgeServiceError(
        "MOTION_APPROVAL_SOURCE_VERSION_MISMATCH",
        "The motion approval does not match the exact stylesheet version shown in the diff.",
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

  #prune(): void {
    const threshold = this.#now() - this.#planTtlMs;
    for (const [planId, stored] of this.#plans) {
      if (stored.createdAt < threshold) this.#plans.delete(planId);
    }
  }
}
