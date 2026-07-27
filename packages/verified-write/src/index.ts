import { exec as execCallback } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
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
  StagedSourceTransaction,
  StagedSourceWrite,
  TransactionalSourceRepository,
} from "./transaction.js";

const exec = promisify(execCallback);

export interface PatchApproval {
  readonly planId: string;
  readonly sourceVersion: string;
  readonly approved: true;
  readonly approvedAt: string;
  readonly approvedBy?: string;
}

export interface SourceRepository {
  read(repositoryPath: string): Promise<VersionedSourceSnapshot>;
  write(
    repositoryPath: string,
    content: string,
    expectedVersion: string,
  ): Promise<VersionedSourceSnapshot>;
}

export interface VerificationExecution {
  readonly step: VerificationStep;
  readonly ok: boolean;
  readonly exitCode?: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface VerificationRunner {
  run(step: VerificationStep): Promise<VerificationExecution>;
}

export type VerifiedWriteStatus =
  | "applied"
  | "rejected"
  | "rolled-back"
  | "rollback-failed";

export interface VerifiedWriteResult {
  readonly status: VerifiedWriteStatus;
  readonly planId: string;
  readonly before: VersionedSourceSnapshot;
  readonly after?: VersionedSourceSnapshot;
  readonly restored?: VersionedSourceSnapshot;
  readonly preview: PatchPreview;
  readonly verification: readonly VerificationExecution[];
  readonly diagnostics: readonly AdapterDiagnostic[];
}

export interface ProcessVerificationRunnerOptions {
  readonly projectRoot: string;
  readonly timeoutMs?: number;
  readonly maxBufferBytes?: number;
}

export function createPatchApproval(
  preview: PatchPreview,
  approvedBy?: string,
  approvedAt = new Date().toISOString(),
): PatchApproval {
  const blocking = preview.diagnostics.find((diagnostic) => diagnostic.severity === "error");
  if (blocking) {
    throw new Error(`Cannot approve blocked patch: ${blocking.message}`);
  }
  if (!preview.changed) {
    throw new Error("Cannot approve a patch that does not change the source.");
  }

  return approvedBy
    ? {
        planId: preview.planId,
        sourceVersion: preview.sourceVersion,
        approved: true,
        approvedAt,
        approvedBy,
      }
    : {
        planId: preview.planId,
        sourceVersion: preview.sourceVersion,
        approved: true,
        approvedAt,
      };
}

export class VerifiedWriteService {
  readonly #repository: SourceRepository;
  readonly #runner: VerificationRunner;

  constructor(repository: SourceRepository, runner: VerificationRunner) {
    this.#repository = repository;
    this.#runner = runner;
  }

  async preview(plan: SourcePatchPlan): Promise<PatchPreview> {
    const source = await this.#repository.read(plan.repositoryPath);
    return createPatchPreview(plan, source);
  }

  async apply(plan: SourcePatchPlan, approval: PatchApproval): Promise<VerifiedWriteResult> {
    const before = await this.#repository.read(plan.repositoryPath);
    const preview = createPatchPreview(plan, before);
    const diagnostics: AdapterDiagnostic[] = [...preview.diagnostics];

    if (approval.planId !== plan.planId || approval.sourceVersion !== before.version) {
      diagnostics.push({
        code: "APPROVAL_MISMATCH",
        severity: "error",
        message: "Approval does not match the current patch plan and source version.",
        repositoryPath: plan.repositoryPath,
      });
    }

    if (!preview.changed) {
      diagnostics.push({
        code: "PATCH_HAS_NO_CHANGES",
        severity: "error",
        message: "The patch does not change the source.",
        repositoryPath: plan.repositoryPath,
      });
    }

    if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      return {
        status: "rejected",
        planId: plan.planId,
        before,
        preview,
        verification: [],
        diagnostics,
      };
    }

    let after: VersionedSourceSnapshot;
    try {
      after = await this.#repository.write(
        plan.repositoryPath,
        preview.after,
        before.version,
      );
    } catch (error) {
      diagnostics.push({
        code: "WRITE_CONFLICT",
        severity: "error",
        message: error instanceof Error ? error.message : "The source could not be written.",
        repositoryPath: plan.repositoryPath,
      });
      return {
        status: "rejected",
        planId: plan.planId,
        before,
        preview,
        verification: [],
        diagnostics,
      };
    }

    const verification: VerificationExecution[] = [];
    for (const step of plan.verification) {
      try {
        verification.push(await this.#runner.run(step));
      } catch (error) {
        verification.push({
          step,
          ok: false,
          stdout: "",
          stderr: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const failedRequired = verification.find((result) => result.step.required && !result.ok);
    if (!failedRequired) {
      return {
        status: "applied",
        planId: plan.planId,
        before,
        after,
        preview,
        verification,
        diagnostics,
      };
    }

    diagnostics.push({
      code: "REQUIRED_VERIFICATION_FAILED",
      severity: "error",
      message: `Required ${failedRequired.step.kind} verification failed; restoring the original source.`,
      repositoryPath: plan.repositoryPath,
    });

    try {
      const restored = await this.#repository.write(
        plan.repositoryPath,
        before.content,
        after.version,
      );
      return {
        status: "rolled-back",
        planId: plan.planId,
        before,
        after,
        restored,
        preview,
        verification,
        diagnostics,
      };
    } catch (error) {
      diagnostics.push({
        code: "ROLLBACK_FAILED",
        severity: "error",
        message: error instanceof Error ? error.message : "The original source could not be restored.",
        repositoryPath: plan.repositoryPath,
      });
      return {
        status: "rollback-failed",
        planId: plan.planId,
        before,
        after,
        preview,
        verification,
        diagnostics,
      };
    }
  }
}

interface FileSystemStagedEntry {
  readonly repositoryPath: string;
  readonly targetPath: string;
  readonly temporaryPath: string;
  readonly before: VersionedSourceSnapshot;
  readonly content: string;
  readonly stagedVersion: string;
}

interface FileSystemStagedState {
  readonly transaction: StagedSourceTransaction;
  readonly entries: ReadonlyMap<string, FileSystemStagedEntry>;
}

export class FileSystemSourceRepository implements TransactionalSourceRepository {
  readonly #projectRoot: string;
  readonly #stagedTransactions = new Map<string, FileSystemStagedState>();

  constructor(projectRoot: string) {
    this.#projectRoot = path.resolve(projectRoot);
  }

  async read(repositoryPath: string): Promise<VersionedSourceSnapshot> {
    const filePath = this.#resolve(repositoryPath);
    const content = await readFile(filePath, "utf8");
    return {
      repositoryPath: normalizeRepositoryPath(repositoryPath),
      content,
      version: createSourceVersion(content),
    };
  }

  async write(
    repositoryPath: string,
    content: string,
    expectedVersion: string,
  ): Promise<VersionedSourceSnapshot> {
    const current = await this.read(repositoryPath);
    if (current.version !== expectedVersion) {
      throw new Error("Compare-and-swap rejected the write because the file changed.");
    }

    const filePath = this.#resolve(repositoryPath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
    return {
      repositoryPath: normalizeRepositoryPath(repositoryPath),
      content,
      version: createSourceVersion(content),
    };
  }

  async stageTransaction(
    transactionId: string,
    writes: readonly StagedSourceWrite[],
  ): Promise<StagedSourceTransaction> {
    if (this.#stagedTransactions.has(transactionId)) {
      throw new Error(`Transaction ${transactionId} is already staged.`);
    }

    const entries = new Map<string, FileSystemStagedEntry>();
    const token = sanitizeStageToken(transactionId);
    try {
      for (const [index, write] of writes.entries()) {
        const repositoryPath = normalizeRepositoryPath(write.repositoryPath);
        if (entries.has(repositoryPath)) {
          throw new Error(`Transaction contains duplicate staged target ${repositoryPath}.`);
        }
        const before = await this.read(repositoryPath);
        if (before.version !== write.expectedVersion) {
          throw new Error(`Cannot stage ${repositoryPath} because its source version changed.`);
        }
        const targetPath = this.#resolve(repositoryPath);
        const temporaryPath = path.join(
          path.dirname(targetPath),
          `.${path.basename(targetPath)}.afrodite-${token}-${index}.stage`,
        );
        await mkdir(path.dirname(targetPath), { recursive: true });
        await writeFile(temporaryPath, write.content, "utf8");
        entries.set(repositoryPath, {
          repositoryPath,
          targetPath,
          temporaryPath,
          before,
          content: write.content,
          stagedVersion: createSourceVersion(write.content),
        });
      }
    } catch (error) {
      await Promise.all([...entries.values()].map((entry) => rm(entry.temporaryPath, { force: true })));
      throw error;
    }

    const transaction: StagedSourceTransaction = {
      transactionId,
      files: [...entries.values()].map((entry) => ({
        repositoryPath: entry.repositoryPath,
        before: entry.before,
        stagedVersion: entry.stagedVersion,
      })),
    };
    this.#stagedTransactions.set(transactionId, { transaction, entries });
    return transaction;
  }

  async commitStagedFile(
    transaction: StagedSourceTransaction,
    repositoryPath: string,
    expectedVersion: string,
  ): Promise<VersionedSourceSnapshot> {
    const state = this.#stagedTransactions.get(transaction.transactionId);
    const normalized = normalizeRepositoryPath(repositoryPath);
    const entry = state?.entries.get(normalized);
    if (!state || !entry) throw new Error(`No staged source exists for ${normalized}.`);

    const current = await this.read(normalized);
    if (current.version !== expectedVersion || current.version !== entry.before.version) {
      throw new Error(`Compare-and-swap rejected staged commit for ${normalized}.`);
    }

    try {
      await rename(entry.temporaryPath, entry.targetPath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EPERM" && code !== "EEXIST" && code !== "ENOTEMPTY") throw error;
      await writeFile(entry.targetPath, entry.content, "utf8");
      await rm(entry.temporaryPath, { force: true });
    }

    return {
      repositoryPath: normalized,
      content: entry.content,
      version: entry.stagedVersion,
    };
  }

  async discardTransaction(transaction: StagedSourceTransaction): Promise<void> {
    const state = this.#stagedTransactions.get(transaction.transactionId);
    if (!state) return;
    await Promise.all([...state.entries.values()].map((entry) => rm(entry.temporaryPath, { force: true })));
    this.#stagedTransactions.delete(transaction.transactionId);
  }

  #resolve(repositoryPath: string): string {
    const normalized = normalizeRepositoryPath(repositoryPath);
    const resolved = path.resolve(this.#projectRoot, normalized);
    const relative = path.relative(this.#projectRoot, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Repository path escapes the project root: ${repositoryPath}`);
    }
    return resolved;
  }
}

export class ProcessVerificationRunner implements VerificationRunner {
  readonly #projectRoot: string;
  readonly #timeoutMs: number;
  readonly #maxBufferBytes: number;

  constructor(options: ProcessVerificationRunnerOptions) {
    this.#projectRoot = path.resolve(options.projectRoot);
    this.#timeoutMs = options.timeoutMs ?? 120_000;
    this.#maxBufferBytes = options.maxBufferBytes ?? 4 * 1024 * 1024;
  }

  async run(step: VerificationStep): Promise<VerificationExecution> {
    const cwd = step.cwd
      ? path.resolve(this.#projectRoot, step.cwd)
      : this.#projectRoot;

    try {
      const result = await exec(step.command, {
        cwd,
        timeout: this.#timeoutMs,
        maxBuffer: this.#maxBufferBytes,
      });
      return {
        step,
        ok: true,
        exitCode: 0,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (error) {
      const processError = error as Error & {
        code?: number;
        stdout?: string;
        stderr?: string;
      };
      const exitCode = typeof processError.code === "number" ? processError.code : undefined;
      return exitCode === undefined
        ? {
            step,
            ok: false,
            stdout: processError.stdout ?? "",
            stderr: processError.stderr ?? processError.message,
          }
        : {
            step,
            ok: false,
            exitCode,
            stdout: processError.stdout ?? "",
            stderr: processError.stderr ?? processError.message,
          };
    }
  }
}

function normalizeRepositoryPath(repositoryPath: string): string {
  return repositoryPath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function sanitizeStageToken(transactionId: string): string {
  return transactionId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(-72);
}

export {
  VerifiedMultiFileTransactionService,
  createMultiFileTransactionApproval,
  createMultiFileTransactionPlan,
} from "./transaction.js";
export type {
  CreateMultiFileTransactionPlanInput,
  MultiFileTransactionApproval,
  MultiFileTransactionFileResult,
  MultiFileTransactionPlan,
  MultiFileTransactionPreview,
  MultiFileTransactionResult,
  MultiFileTransactionStatus,
  StagedSourceFile,
  StagedSourceTransaction,
  StagedSourceWrite,
  TransactionFilePreview,
  TransactionSourceApproval,
  TransactionalSourceRepository,
} from "./transaction.js";
