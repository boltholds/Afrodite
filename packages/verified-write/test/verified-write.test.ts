import { describe, expect, it } from "vitest";
import {
  createPatchPreview,
  createSourcePatchPlan,
  createSourceVersion,
  type VerificationStep,
  type VersionedSourceSnapshot,
} from "@afrodite/framework-core";
import {
  VerifiedWriteService,
  createPatchApproval,
  type SourceRepository,
  type VerificationExecution,
  type VerificationRunner,
} from "../src/index.js";

class MemoryRepository implements SourceRepository {
  snapshot: VersionedSourceSnapshot;

  constructor(content: string) {
    this.snapshot = {
      repositoryPath: "src/Card.tsx",
      content,
      version: createSourceVersion(content),
    };
  }

  async read(): Promise<VersionedSourceSnapshot> {
    return { ...this.snapshot };
  }

  async write(
    repositoryPath: string,
    content: string,
    expectedVersion: string,
  ): Promise<VersionedSourceSnapshot> {
    if (repositoryPath !== this.snapshot.repositoryPath) throw new Error("wrong path");
    if (expectedVersion !== this.snapshot.version) throw new Error("stale source");
    this.snapshot = {
      repositoryPath,
      content,
      version: createSourceVersion(content),
    };
    return { ...this.snapshot };
  }
}

class FixedRunner implements VerificationRunner {
  constructor(readonly ok: boolean) {}

  async run(step: VerificationStep): Promise<VerificationExecution> {
    return {
      step,
      ok: this.ok,
      exitCode: this.ok ? 0 : 1,
      stdout: "",
      stderr: this.ok ? "" : "verification failed",
    };
  }
}

function createPlan(repository: MemoryRepository) {
  return createSourcePatchPlan({
    frameworkId: "solid",
    adapterId: "afrodite.adapter.solid",
    operation: "update-layout",
    source: repository.snapshot,
    edits: [{ start: 14, end: 15, replacement: "2" }],
    verification: [
      { kind: "typecheck", command: "pnpm typecheck", required: true },
    ],
  });
}

describe("VerifiedWriteService", () => {
  it("requires an approval bound to the plan and current source version", async () => {
    const repository = new MemoryRepository("const value = 1;\n");
    const service = new VerifiedWriteService(repository, new FixedRunner(true));
    const plan = createPlan(repository);

    const result = await service.apply(plan, {
      planId: "wrong-plan",
      sourceVersion: repository.snapshot.version,
      approved: true,
      approvedAt: "2026-07-26T00:00:00.000Z",
    });

    expect(result.status).toBe("rejected");
    expect(repository.snapshot.content).toBe("const value = 1;\n");
    expect(result.diagnostics.some((item) => item.code === "APPROVAL_MISMATCH")).toBe(true);
  });

  it("applies an approved patch after required verification succeeds", async () => {
    const repository = new MemoryRepository("const value = 1;\n");
    const service = new VerifiedWriteService(repository, new FixedRunner(true));
    const plan = createPlan(repository);
    const preview = createPatchPreview(plan, repository.snapshot);
    const approval = createPatchApproval(preview, "volt");

    const result = await service.apply(plan, approval);

    expect(result.status).toBe("applied");
    expect(repository.snapshot.content).toBe("const value = 2;\n");
    expect(result.verification).toHaveLength(1);
  });

  it("rolls the source back when a required verification fails", async () => {
    const repository = new MemoryRepository("const value = 1;\n");
    const service = new VerifiedWriteService(repository, new FixedRunner(false));
    const plan = createPlan(repository);
    const approval = createPatchApproval(createPatchPreview(plan, repository.snapshot));

    const result = await service.apply(plan, approval);

    expect(result.status).toBe("rolled-back");
    expect(repository.snapshot.content).toBe("const value = 1;\n");
    expect(result.diagnostics.some((item) => item.code === "REQUIRED_VERIFICATION_FAILED")).toBe(true);
  });
});
