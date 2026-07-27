import { randomBytes } from "node:crypto";
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
  BridgeMotionPlanView,
  BridgeMotionRuntimeEvidence,
} from "@afrodite/protocol";
import type { MotionVerificationManifest, MotionVerificationResult } from "@afrodite/protocol/motion-verification";
import {
  FileSystemSourceRepository,
  ProcessVerificationRunner,
  VerifiedWriteService,
  createPatchApproval,
  type SourceRepository,
  type VerificationRunner,
} from "@afrodite/verified-write";
import { createUnifiedDiff } from "@afrodite/verified-write/diff";
import { createMotionVerificationManifest } from "./motionVerification.js";

interface StoredRuntimeEvidence {
  readonly evidenceId: string;
  readonly result: MotionVerificationResult;
  readonly verifiedAt: string;
}

interface StoredMotionPlan {
  readonly plan: SourcePatchPlan;
  readonly preview: PatchPreview;
  readonly manifest: MotionVerificationManifest;
  readonly createdAt: number;
  readonly evidence?: StoredRuntimeEvidence;
}

export interface MotionBridgeServiceOptions {
  readonly projectRoot: string;
  readonly repository?: SourceRepository;
  readonly verificationRunner?: VerificationRunner;
  readonly planTtlMs?: number;
  readonly now?: () => number;
  readonly challengeFactory?: () => string;
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
  readonly #challengeFactory: () => string;

  constructor(options: MotionBridgeServiceOptions) {
    const projectRoot = path.resolve(options.projectRoot);
    this.#repository = options.repository ?? new FileSystemSourceRepository(projectRoot);
    const runner = options.verificationRunner ?? new ProcessVerificationRunner({ projectRoot });
    this.#writeService = new VerifiedWriteService(this.#repository, runner);
    this.#planTtlMs = options.planTtlMs ?? 10 * 60_000;
    this.#now = options.now ?? Date.now;
    this.#challengeFactory = options.challengeFactory ?? (() => randomBytes(18).toString("base64url"));
  }

  async planMotionPatch(operation: BridgeMotionOperation): Promise<BridgeMotionPlanView> {
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
    const manifest = !blocking && preview.changed
      ? createMotionVerificationManifest({
          operation: normalized,
          plan,
          preview,
          challenge: this.#challengeFactory(),
        })
      : undefined;
    if (manifest) {
      this.#plans.set(plan.planId, {
        plan,
        preview,
        manifest,
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
      ...(manifest ? { runtimeVerification: cloneJson(manifest) } : {}),
    };
  }

  recordRuntimeEvidence(result: MotionVerificationResult): BridgeMotionRuntimeEvidence {
    this.#prune();
    const stored = this.#plans.get(result.planId);
    if (!stored) {
      throw new MotionBridgeServiceError(
        "MOTION_PLAN_NOT_FOUND",
        "The motion plan is missing, blocked, expired, or already applied.",
      );
    }
    validateRuntimeResult(stored.manifest, result);
    const verifiedAt = new Date(this.#now()).toISOString();
    const evidence: StoredRuntimeEvidence = {
      evidenceId: result.evidenceId,
      result: cloneJson(result),
      verifiedAt,
    };
    this.#plans.set(result.planId, { ...stored, evidence });
    return {
      evidenceId: evidence.evidenceId,
      planId: result.planId,
      sourceVersion: result.sourceVersion,
      cssFingerprint: result.cssFingerprint,
      verifiedAt,
      sampleCount: result.samples.length,
      diagnostics: result.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        severity: diagnostic.severity,
        message: diagnostic.message,
        nodeId: stored.manifest.nodeId,
        repositoryPath: stored.plan.repositoryPath,
      })),
      verification: [],
    };
  }

  async applyMotionPatch(
    planId: string,
    sourceVersion: string,
    runtimeEvidenceId: string,
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
    if (!stored.evidence || stored.evidence.evidenceId !== runtimeEvidenceId) {
      throw new MotionBridgeServiceError(
        "MOTION_RUNTIME_EVIDENCE_REQUIRED",
        "A successful isolated runtime verification for this exact plan is required before apply.",
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

function validateRuntimeResult(
  manifest: MotionVerificationManifest,
  result: MotionVerificationResult,
): void {
  if (result.sourceVersion !== manifest.sourceVersion
    || result.cssFingerprint !== manifest.cssFingerprint
    || result.challenge !== manifest.challenge) {
    throw new MotionBridgeServiceError(
      "MOTION_RUNTIME_EVIDENCE_MISMATCH",
      "Runtime evidence does not match the exact plan manifest, stylesheet version, CSS fingerprint, or challenge.",
    );
  }
  if (!result.ok || result.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    throw new MotionBridgeServiceError(
      "MOTION_RUNTIME_VERIFICATION_FAILED",
      "The isolated runtime verification reported a mismatch or runtime error.",
    );
  }

  const expectedKeys = manifest.scenarios.flatMap((scenario) =>
    scenario.sampleTimesMs.map((sampleTimeMs) => sampleKey(scenario.scenarioId, sampleTimeMs)));
  const actualKeys = result.samples.map((sample) => sampleKey(sample.scenarioId, sample.sampleTimeMs));
  if (new Set(actualKeys).size !== actualKeys.length
    || expectedKeys.length !== actualKeys.length
    || expectedKeys.some((key) => !actualKeys.includes(key))) {
    throw new MotionBridgeServiceError(
      "MOTION_RUNTIME_EVIDENCE_INCOMPLETE",
      "Runtime evidence does not contain the exact expected scenario/sample set.",
    );
  }
  if (result.samples.some((sample) => !sample.matched)) {
    throw new MotionBridgeServiceError(
      "MOTION_RUNTIME_STYLE_MISMATCH",
      "At least one isolated runtime sample differs from the semantic motion compositor.",
    );
  }
}

function sampleKey(scenarioId: string, sampleTimeMs: number): string {
  return `${scenarioId}@${sampleTimeMs}`;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
