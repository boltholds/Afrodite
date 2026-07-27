import { describe, expect, it } from "vitest";
import {
  createSourcePatchPlan,
  createSourceVersion,
  type VerificationStep,
  type VersionedSourceSnapshot,
} from "@afrodite/framework-core";
import {
  VerifiedMultiFileTransactionService,
  createMultiFileTransactionApproval,
  createMultiFileTransactionPlan,
  type SourceRepository,
  type VerificationExecution,
  type VerificationRunner,
} from "../src/index.js";

class MemoryRepository implements SourceRepository {
  readonly files = new Map<string, string>();
  failWritePath?: string;

  constructor(files: Record<string, string>) {
    Object.entries(files).forEach(([repositoryPath, content]) => this.files.set(repositoryPath, content));
  }

  async read(repositoryPath: string): Promise<VersionedSourceSnapshot> {
    const content = this.files.get(repositoryPath);
    if (content === undefined) throw new Error(`Missing ${repositoryPath}`);
    return { repositoryPath, content, version: createSourceVersion(content) };
  }

  async write(
    repositoryPath: string,
    content: string,
    expectedVersion: string,
  ): Promise<VersionedSourceSnapshot> {
    const current = await this.read(repositoryPath);
    if (current.version !== expectedVersion) throw new Error(`Stale ${repositoryPath}`);
    if (this.failWritePath === repositoryPath && content !== current.content) {
      throw new Error(`Injected failure for ${repositoryPath}`);
    }
    this.files.set(repositoryPath, content);
    return { repositoryPath, content, version: createSourceVersion(content) };
  }
}

class StaticRunner implements VerificationRunner {
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

function patch(repositoryPath: string, source: string, replacement: string) {
  return createSourcePatchPlan({
    frameworkId: "react",
    adapterId: "afrodite.adapter.react",
    operation: "update-style",
    source: { repositoryPath, content: source },
    edits: [{ start: 0, end: source.length, replacement }],
    verification: [{ kind: "typecheck", command: "pnpm typecheck", required: true }],
  });
}

describe("VerifiedMultiFileTransactionService", () => {
  it("applies every staged file and runs shared verification once", async () => {
    const repository = new MemoryRepository({ "src/Card.tsx": "old-card", "src/card.css": "old-css" });
    const plan = createMultiFileTransactionPlan({
      plans: [
        patch("src/Card.tsx", "old-card", "new-card"),
        patch("src/card.css", "old-css", "new-css"),
      ],
    });
    const service = new VerifiedMultiFileTransactionService(repository, new StaticRunner(true));
    const preview = await service.preview(plan);
    const result = await service.apply(plan, createMultiFileTransactionApproval(preview, "test"));

    expect(result.status).toBe("applied");
    expect(repository.files.get("src/Card.tsx")).toBe("new-card");
    expect(repository.files.get("src/card.css")).toBe("new-css");
    expect(result.verification).toHaveLength(1);
    expect(result.files.every((file) => file.after)).toBe(true);
  });

  it("rejects the entire transaction before writing when one reviewed source becomes stale", async () => {
    const repository = new MemoryRepository({ "src/Card.tsx": "old-card", "src/card.css": "old-css" });
    const plan = createMultiFileTransactionPlan({
      plans: [
        patch("src/Card.tsx", "old-card", "new-card"),
        patch("src/card.css", "old-css", "new-css"),
      ],
    });
    const service = new VerifiedMultiFileTransactionService(repository, new StaticRunner(true));
    const preview = await service.preview(plan);
    repository.files.set("src/card.css", "external-change");
    const result = await service.apply(plan, createMultiFileTransactionApproval(preview));

    expect(result.status).toBe("rejected");
    expect(repository.files.get("src/Card.tsx")).toBe("old-card");
    expect(repository.files.get("src/card.css")).toBe("external-change");
    expect(result.diagnostics.some((item) => item.code === "TRANSACTION_SOURCE_VERSION_MISMATCH")).toBe(true);
  });

  it("rolls back every committed file when required verification fails", async () => {
    const repository = new MemoryRepository({ "src/Card.tsx": "old-card", "src/card.css": "old-css" });
    const plan = createMultiFileTransactionPlan({
      plans: [
        patch("src/Card.tsx", "old-card", "new-card"),
        patch("src/card.css", "old-css", "new-css"),
      ],
    });
    const service = new VerifiedMultiFileTransactionService(repository, new StaticRunner(false));
    const preview = await service.preview(plan);
    const result = await service.apply(plan, createMultiFileTransactionApproval(preview));

    expect(result.status).toBe("rolled-back");
    expect(repository.files.get("src/Card.tsx")).toBe("old-card");
    expect(repository.files.get("src/card.css")).toBe("old-css");
    expect(result.files.every((file) => file.restored)).toBe(true);
  });

  it("rolls back earlier writes when a later staged commit fails", async () => {
    const repository = new MemoryRepository({ "a.tsx": "a0", "b.css": "b0" });
    repository.failWritePath = "b.css";
    const plan = createMultiFileTransactionPlan({
      plans: [patch("a.tsx", "a0", "a1"), patch("b.css", "b0", "b1")],
    });
    const service = new VerifiedMultiFileTransactionService(repository, new StaticRunner(true));
    const preview = await service.preview(plan);
    const result = await service.apply(plan, createMultiFileTransactionApproval(preview));

    expect(result.status).toBe("rolled-back");
    expect(repository.files.get("a.tsx")).toBe("a0");
    expect(repository.files.get("b.css")).toBe("b0");
    expect(result.diagnostics.some((item) => item.code === "TRANSACTION_COMMIT_FAILED")).toBe(true);
  });

  it("blocks duplicate file targets until an adapter produces one deterministic combined plan", () => {
    const first = patch("src/Card.tsx", "old", "first");
    const second = patch("src/Card.tsx", "old", "second");
    const plan = createMultiFileTransactionPlan({ plans: [first, second] });
    expect(plan.diagnostics.some((item) => item.code === "TRANSACTION_DUPLICATE_TARGET")).toBe(true);
  });
});
