import { exec as execCallback } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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

export class FileSystemSourceRepository implements SourceRepository {
  readonly #projectRoot: string;

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
