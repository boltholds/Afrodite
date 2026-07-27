import {
  createPatchPreview,
  createSourceVersion,
  type AdapterDiagnostic,
  type PatchPreview,
  type SourcePatchPlan,
  type VerificationStep,
  type VersionedSourceSnapshot,
} from "@afrodite/framework-core";
import type {
  SourceRepository,
  VerificationExecution,
  VerificationRunner,
} from "./index.js";

export interface MultiFileTransactionPlan {
  readonly transactionId: string;
  readonly files: readonly SourcePatchPlan[];
  readonly verification: readonly VerificationStep[];
  readonly diagnostics: readonly AdapterDiagnostic[];
  readonly requiresApproval: true;
}

export interface TransactionFilePreview {
  readonly planId: string;
  readonly repositoryPath: string;
  readonly sourceVersion: string;
  readonly before: string;
  readonly after: string;
  readonly changed: boolean;
  readonly diagnostics: readonly AdapterDiagnostic[];
}

export interface MultiFileTransactionPreview {
  readonly transactionId: string;
  readonly files: readonly TransactionFilePreview[];
  readonly verification: readonly VerificationStep[];
  readonly diagnostics: readonly AdapterDiagnostic[];
  readonly changedFiles: number;
}

export interface TransactionSourceApproval {
  readonly repositoryPath: string;
  readonly sourceVersion: string;
}

export interface MultiFileTransactionApproval {
  readonly transactionId: string;
  readonly sources: readonly TransactionSourceApproval[];
  readonly approved: true;
  readonly approvedAt: string;
  readonly approvedBy?: string;
}

export interface StagedSourceWrite {
  readonly repositoryPath: string;
  readonly content: string;
  readonly expectedVersion: string;
}

export interface StagedSourceFile {
  readonly repositoryPath: string;
  readonly before: VersionedSourceSnapshot;
  readonly stagedVersion: string;
}

export interface StagedSourceTransaction {
  readonly transactionId: string;
  readonly files: readonly StagedSourceFile[];
}

export interface TransactionalSourceRepository extends SourceRepository {
  stageTransaction(
    transactionId: string,
    writes: readonly StagedSourceWrite[],
  ): Promise<StagedSourceTransaction>;
  commitStagedFile(
    transaction: StagedSourceTransaction,
    repositoryPath: string,
    expectedVersion: string,
  ): Promise<VersionedSourceSnapshot>;
  discardTransaction(transaction: StagedSourceTransaction): Promise<void>;
}

export type MultiFileTransactionStatus =
  | "applied"
  | "rejected"
  | "rolled-back"
  | "rollback-failed";

export interface MultiFileTransactionFileResult {
  readonly repositoryPath: string;
  readonly before: VersionedSourceSnapshot;
  readonly after?: VersionedSourceSnapshot;
  readonly restored?: VersionedSourceSnapshot;
}

export interface MultiFileTransactionResult {
  readonly status: MultiFileTransactionStatus;
  readonly transactionId: string;
  readonly files: readonly MultiFileTransactionFileResult[];
  readonly preview: MultiFileTransactionPreview;
  readonly verification: readonly VerificationExecution[];
  readonly diagnostics: readonly AdapterDiagnostic[];
}

export interface CreateMultiFileTransactionPlanInput {
  readonly plans: readonly SourcePatchPlan[];
  readonly verification?: readonly VerificationStep[];
}

interface GenericStagedTransaction extends StagedSourceTransaction {
  readonly writes: ReadonlyMap<string, StagedSourceWrite>;
}

export function createMultiFileTransactionPlan(
  input: CreateMultiFileTransactionPlanInput,
): MultiFileTransactionPlan {
  const files = [...input.plans].sort((left, right) =>
    left.repositoryPath.localeCompare(right.repositoryPath)
      || left.planId.localeCompare(right.planId),
  );
  const diagnostics: AdapterDiagnostic[] = [];

  if (files.length < 2) {
    diagnostics.push({
      code: "TRANSACTION_REQUIRES_MULTIPLE_FILES",
      severity: "error",
      message: "A multi-file transaction must contain at least two source patch plans.",
    });
  }

  const paths = new Set<string>();
  for (const plan of files) {
    if (paths.has(plan.repositoryPath)) {
      diagnostics.push({
        code: "TRANSACTION_DUPLICATE_TARGET",
        severity: "error",
        message: `More than one plan targets ${plan.repositoryPath}. Combine those edits in one adapter plan before creating the transaction.`,
        repositoryPath: plan.repositoryPath,
      });
    }
    paths.add(plan.repositoryPath);
  }

  const verification = deduplicateVerification([
    ...files.flatMap((plan) => plan.verification),
    ...(input.verification ?? []),
  ]);
  const identity = [
    ...files.map((plan) => `${plan.repositoryPath}:${plan.sourceVersion}:${plan.planId}`),
    ...verification.map((step) => `${step.kind}:${step.required}:${step.cwd ?? ""}:${step.command}`),
  ].join("|");

  return {
    transactionId: `transaction:${createSourceVersion(identity).replaceAll(":", "-")}`,
    files,
    verification,
    diagnostics,
    requiresApproval: true,
  };
}

export function createMultiFileTransactionApproval(
  preview: MultiFileTransactionPreview,
  approvedBy?: string,
  approvedAt = new Date().toISOString(),
): MultiFileTransactionApproval {
  const blocking = collectPreviewDiagnostics(preview).find((item) => item.severity === "error");
  if (blocking) throw new Error(`Cannot approve blocked transaction: ${blocking.message}`);
  if (preview.changedFiles === 0) throw new Error("Cannot approve a transaction with no source changes.");

  const sources = preview.files
    .map((file) => ({
      repositoryPath: file.repositoryPath,
      sourceVersion: file.sourceVersion,
    }))
    .sort((left, right) => left.repositoryPath.localeCompare(right.repositoryPath));

  return approvedBy
    ? {
        transactionId: preview.transactionId,
        sources,
        approved: true,
        approvedAt,
        approvedBy,
      }
    : {
        transactionId: preview.transactionId,
        sources,
        approved: true,
        approvedAt,
      };
}

export class VerifiedMultiFileTransactionService {
  readonly #repository: SourceRepository;
  readonly #runner: VerificationRunner;

  constructor(repository: SourceRepository, runner: VerificationRunner) {
    this.#repository = repository;
    this.#runner = runner;
  }

  async preview(plan: MultiFileTransactionPlan): Promise<MultiFileTransactionPreview> {
    const files: TransactionFilePreview[] = [];
    const diagnostics: AdapterDiagnostic[] = [...plan.diagnostics];

    for (const filePlan of plan.files) {
      try {
        const source = await this.#repository.read(filePlan.repositoryPath);
        const preview = createPatchPreview(filePlan, source);
        files.push(toTransactionFilePreview(preview));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const diagnostic: AdapterDiagnostic = {
          code: "TRANSACTION_SOURCE_READ_FAILED",
          severity: "error",
          message,
          repositoryPath: filePlan.repositoryPath,
        };
        diagnostics.push(diagnostic);
        files.push({
          planId: filePlan.planId,
          repositoryPath: filePlan.repositoryPath,
          sourceVersion: filePlan.sourceVersion,
          before: "",
          after: "",
          changed: false,
          diagnostics: [diagnostic],
        });
      }
    }

    return {
      transactionId: plan.transactionId,
      files,
      verification: plan.verification,
      diagnostics,
      changedFiles: files.filter((file) => file.changed).length,
    };
  }

  async apply(
    plan: MultiFileTransactionPlan,
    approval: MultiFileTransactionApproval,
  ): Promise<MultiFileTransactionResult> {
    const preview = await this.preview(plan);
    const diagnostics = collectPreviewDiagnostics(preview);

    if (!approvalMatchesPreview(approval, preview)) {
      diagnostics.push({
        code: "TRANSACTION_APPROVAL_MISMATCH",
        severity: "error",
        message: "Approval does not match the exact transaction ID and every reviewed source version.",
      });
    }
    if (preview.changedFiles !== preview.files.length) {
      diagnostics.push({
        code: "TRANSACTION_FILE_HAS_NO_CHANGES",
        severity: "error",
        message: "Every file in an atomic transaction must contain a source change.",
      });
    }

    const beforeFiles = await readBeforeFiles(this.#repository, preview.files, diagnostics);
    if (diagnostics.some((item) => item.severity === "error") || beforeFiles.length !== preview.files.length) {
      return {
        status: "rejected",
        transactionId: plan.transactionId,
        files: beforeFiles.map((before) => ({ repositoryPath: before.repositoryPath, before })),
        preview,
        verification: [],
        diagnostics,
      };
    }

    const writes = preview.files.map((file) => ({
      repositoryPath: file.repositoryPath,
      content: file.after,
      expectedVersion: file.sourceVersion,
    }));

    let staged: StagedSourceTransaction;
    try {
      staged = await stageWrites(this.#repository, plan.transactionId, writes, beforeFiles);
    } catch (error) {
      diagnostics.push({
        code: "TRANSACTION_STAGE_FAILED",
        severity: "error",
        message: error instanceof Error ? error.message : String(error),
      });
      return {
        status: "rejected",
        transactionId: plan.transactionId,
        files: beforeFiles.map((before) => ({ repositoryPath: before.repositoryPath, before })),
        preview,
        verification: [],
        diagnostics,
      };
    }

    const committed = new Map<string, VersionedSourceSnapshot>();
    try {
      for (const file of staged.files) {
        const after = await commitStagedFile(
          this.#repository,
          staged,
          file.repositoryPath,
          file.before.version,
        );
        committed.set(file.repositoryPath, after);
      }
    } catch (error) {
      diagnostics.push({
        code: "TRANSACTION_COMMIT_FAILED",
        severity: "error",
        message: error instanceof Error ? error.message : String(error),
      });
      const rollback = await rollbackCommitted(this.#repository, staged.files, committed, diagnostics);
      await discardStaged(this.#repository, staged);
      return buildResult(
        rollback.failed ? "rollback-failed" : "rolled-back",
        plan.transactionId,
        staged.files,
        committed,
        rollback.restored,
        preview,
        [],
        diagnostics,
      );
    }

    const verification = await runVerification(this.#runner, plan.verification);
    const failedRequired = verification.find((execution) => execution.step.required && !execution.ok);
    if (!failedRequired) {
      await discardStaged(this.#repository, staged);
      return buildResult(
        "applied",
        plan.transactionId,
        staged.files,
        committed,
        new Map(),
        preview,
        verification,
        diagnostics,
      );
    }

    diagnostics.push({
      code: "TRANSACTION_REQUIRED_VERIFICATION_FAILED",
      severity: "error",
      message: `Required ${failedRequired.step.kind} verification failed; restoring every committed source file.`,
    });
    const rollback = await rollbackCommitted(this.#repository, staged.files, committed, diagnostics);
    await discardStaged(this.#repository, staged);
    return buildResult(
      rollback.failed ? "rollback-failed" : "rolled-back",
      plan.transactionId,
      staged.files,
      committed,
      rollback.restored,
      preview,
      verification,
      diagnostics,
    );
  }
}

function toTransactionFilePreview(preview: PatchPreview): TransactionFilePreview {
  return {
    planId: preview.planId,
    repositoryPath: preview.repositoryPath,
    sourceVersion: preview.sourceVersion,
    before: preview.before,
    after: preview.after,
    changed: preview.changed,
    diagnostics: preview.diagnostics,
  };
}

function collectPreviewDiagnostics(preview: MultiFileTransactionPreview): AdapterDiagnostic[] {
  return [
    ...preview.diagnostics.map(cloneDiagnostic),
    ...preview.files.flatMap((file) => file.diagnostics.map(cloneDiagnostic)),
  ];
}

function approvalMatchesPreview(
  approval: MultiFileTransactionApproval,
  preview: MultiFileTransactionPreview,
): boolean {
  if (approval.transactionId !== preview.transactionId) return false;
  const expected = preview.files
    .map((file) => `${file.repositoryPath}:${file.sourceVersion}`)
    .sort();
  const actual = approval.sources
    .map((file) => `${file.repositoryPath}:${file.sourceVersion}`)
    .sort();
  return expected.length === actual.length && expected.every((value, index) => value === actual[index]);
}

async function readBeforeFiles(
  repository: SourceRepository,
  files: readonly TransactionFilePreview[],
  diagnostics: AdapterDiagnostic[],
): Promise<VersionedSourceSnapshot[]> {
  const snapshots: VersionedSourceSnapshot[] = [];
  for (const file of files) {
    try {
      const current = await repository.read(file.repositoryPath);
      if (current.version !== file.sourceVersion) {
        diagnostics.push({
          code: "TRANSACTION_SOURCE_VERSION_MISMATCH",
          severity: "error",
          message: "A source file changed after transaction review. Re-plan the complete transaction.",
          repositoryPath: file.repositoryPath,
        });
      }
      snapshots.push(current);
    } catch (error) {
      diagnostics.push({
        code: "TRANSACTION_SOURCE_READ_FAILED",
        severity: "error",
        message: error instanceof Error ? error.message : String(error),
        repositoryPath: file.repositoryPath,
      });
    }
  }
  return snapshots;
}

async function stageWrites(
  repository: SourceRepository,
  transactionId: string,
  writes: readonly StagedSourceWrite[],
  beforeFiles: readonly VersionedSourceSnapshot[],
): Promise<StagedSourceTransaction> {
  if (isTransactionalRepository(repository)) {
    return repository.stageTransaction(transactionId, writes);
  }
  return {
    transactionId,
    files: beforeFiles.map((before) => ({
      repositoryPath: before.repositoryPath,
      before,
      stagedVersion: createSourceVersion(
        writes.find((write) => write.repositoryPath === before.repositoryPath)?.content ?? before.content,
      ),
    })),
    writes: new Map(writes.map((write) => [write.repositoryPath, write])),
  } as GenericStagedTransaction;
}

async function commitStagedFile(
  repository: SourceRepository,
  transaction: StagedSourceTransaction,
  repositoryPath: string,
  expectedVersion: string,
): Promise<VersionedSourceSnapshot> {
  if (isTransactionalRepository(repository)) {
    return repository.commitStagedFile(transaction, repositoryPath, expectedVersion);
  }
  const generic = transaction as GenericStagedTransaction;
  const write = generic.writes.get(repositoryPath);
  if (!write) throw new Error(`No staged write exists for ${repositoryPath}.`);
  return repository.write(repositoryPath, write.content, expectedVersion);
}

async function discardStaged(
  repository: SourceRepository,
  transaction: StagedSourceTransaction,
): Promise<void> {
  if (isTransactionalRepository(repository)) {
    try {
      await repository.discardTransaction(transaction);
    } catch {
      // A completed or rolled-back transaction must not be reclassified because temp cleanup failed.
    }
  }
}

async function rollbackCommitted(
  repository: SourceRepository,
  stagedFiles: readonly StagedSourceFile[],
  committed: ReadonlyMap<string, VersionedSourceSnapshot>,
  diagnostics: AdapterDiagnostic[],
): Promise<{ readonly restored: Map<string, VersionedSourceSnapshot>; readonly failed: boolean }> {
  const restored = new Map<string, VersionedSourceSnapshot>();
  let failed = false;

  for (const file of [...stagedFiles].reverse()) {
    const after = committed.get(file.repositoryPath);
    if (!after) continue;
    try {
      const snapshot = await repository.write(
        file.repositoryPath,
        file.before.content,
        after.version,
      );
      restored.set(file.repositoryPath, snapshot);
    } catch (error) {
      failed = true;
      diagnostics.push({
        code: "TRANSACTION_ROLLBACK_FAILED",
        severity: "error",
        message: error instanceof Error ? error.message : String(error),
        repositoryPath: file.repositoryPath,
      });
    }
  }

  return { restored, failed };
}

async function runVerification(
  runner: VerificationRunner,
  steps: readonly VerificationStep[],
): Promise<VerificationExecution[]> {
  const executions: VerificationExecution[] = [];
  for (const step of steps) {
    try {
      executions.push(await runner.run(step));
    } catch (error) {
      executions.push({
        step,
        ok: false,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return executions;
}

function buildResult(
  status: MultiFileTransactionStatus,
  transactionId: string,
  stagedFiles: readonly StagedSourceFile[],
  committed: ReadonlyMap<string, VersionedSourceSnapshot>,
  restored: ReadonlyMap<string, VersionedSourceSnapshot>,
  preview: MultiFileTransactionPreview,
  verification: readonly VerificationExecution[],
  diagnostics: readonly AdapterDiagnostic[],
): MultiFileTransactionResult {
  return {
    status,
    transactionId,
    files: stagedFiles.map((file) => {
      const after = committed.get(file.repositoryPath);
      const restoredFile = restored.get(file.repositoryPath);
      return {
        repositoryPath: file.repositoryPath,
        before: file.before,
        ...(after ? { after } : {}),
        ...(restoredFile ? { restored: restoredFile } : {}),
      };
    }),
    preview,
    verification,
    diagnostics,
  };
}

function deduplicateVerification(steps: readonly VerificationStep[]): VerificationStep[] {
  const map = new Map<string, VerificationStep>();
  for (const step of steps) {
    const key = `${step.kind}:${step.cwd ?? ""}:${step.command}`;
    const existing = map.get(key);
    if (!existing || (!existing.required && step.required)) map.set(key, { ...step });
  }
  return [...map.values()].sort((left, right) =>
    left.kind.localeCompare(right.kind)
      || (left.cwd ?? "").localeCompare(right.cwd ?? "")
      || left.command.localeCompare(right.command),
  );
}

function isTransactionalRepository(
  repository: SourceRepository,
): repository is TransactionalSourceRepository {
  const candidate = repository as Partial<TransactionalSourceRepository>;
  return typeof candidate.stageTransaction === "function"
    && typeof candidate.commitStagedFile === "function"
    && typeof candidate.discardTransaction === "function";
}

function cloneDiagnostic(diagnostic: AdapterDiagnostic): AdapterDiagnostic {
  return { ...diagnostic };
}
