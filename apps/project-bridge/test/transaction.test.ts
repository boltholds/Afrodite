import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  BridgeTransactionOperation,
} from "@afrodite/protocol";
import type {
  VerificationExecution,
  VerificationRunner,
} from "@afrodite/verified-write";
import { ProjectBridgeService } from "../src/service.js";

const roots: string[] = [];

class PassingRunner implements VerificationRunner {
  async run(step: Parameters<VerificationRunner["run"]>[0]): Promise<VerificationExecution> {
    return { step, ok: true, exitCode: 0, stdout: "", stderr: "" };
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("ProjectBridgeService multi-file transaction", () => {
  it("plans reviewed diffs for two targets and applies them through staged writes", async () => {
    const root = await createFixture();
    const service = new ProjectBridgeService({
      projectRoot: root,
      verificationRunner: new PassingRunner(),
    });
    const transaction = await service.planTransaction(createOperations());

    expect(transaction.changedFiles).toBe(2);
    expect(transaction.files.map((file) => file.repositoryPath).sort()).toEqual([
      "src/Card.module.css",
      "src/Card.tsx",
    ]);
    expect(transaction.files.every((file) => file.diff.includes("@@"))).toBe(true);

    const result = await service.applyTransaction(
      transaction.transactionId,
      transaction.files.map((file) => ({
        repositoryPath: file.repositoryPath,
        sourceVersion: file.sourceVersion,
      })),
      "bridge-test",
    );

    expect(result.status).toBe("applied");
    expect(await readFile(path.join(root, "src/Card.tsx"), "utf8")).toContain('display: "flex"');
    expect(await readFile(path.join(root, "src/Card.module.css"), "utf8")).toContain("gap: 16px;");
  });

  it("rejects the complete transaction when one source changes after review", async () => {
    const root = await createFixture();
    const service = new ProjectBridgeService({
      projectRoot: root,
      verificationRunner: new PassingRunner(),
    });
    const transaction = await service.planTransaction(createOperations());
    await writeFile(path.join(root, "src/Card.module.css"), ".card { color: cyan; }\n", "utf8");

    const result = await service.applyTransaction(
      transaction.transactionId,
      transaction.files.map((file) => ({
        repositoryPath: file.repositoryPath,
        sourceVersion: file.sourceVersion,
      })),
    );

    expect(result.status).toBe("rejected");
    expect(await readFile(path.join(root, "src/Card.tsx"), "utf8")).toContain('display: "block"');
    expect(result.diagnostics.some((item) => item.code === "TRANSACTION_SOURCE_VERSION_MISMATCH")).toBe(true);
  });
});

function createOperations(): BridgeTransactionOperation[] {
  const before = {
    display: "block" as const,
    direction: "column" as const,
    gap: 4,
    padding: 8,
    sizing: { width: "hug" as const, height: "hug" as const },
  };
  const after = {
    display: "flex" as const,
    direction: "row" as const,
    gap: 16,
    padding: 12,
    sizing: { width: "fill" as const, height: "hug" as const },
  };
  const ownership = {
    strategy: "css-module" as const,
    stylesheetPath: "src/Card.module.css",
    className: "card",
    managedProperties: ["gap", "padding"] as const,
  };
  const binding = {
    frameworkId: "react",
    adapterId: "afrodite.adapter.react",
    repositoryPath: "src/Card.tsx",
    stableMarker: "card.primary",
  };

  return [
    {
      type: "layout",
      operation: {
        kind: "update-layout",
        nodeId: "node.card",
        binding,
        before,
        after,
      },
    },
    {
      type: "style",
      operation: {
        kind: "update-style",
        nodeId: "node.card",
        binding: { ...binding, styleOwnership: ownership },
        ownership,
        before,
        after,
      },
    },
  ];
}

async function createFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "afrodite-transaction-"));
  roots.push(root);
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(
    path.join(root, "src/Card.tsx"),
    `export const Card = () => <section data-afrodite-id="card.primary" style={{ display: "block", gap: "4px", padding: "8px" }} />;\n`,
    "utf8",
  );
  await writeFile(
    path.join(root, "src/Card.module.css"),
    `.card {\n  color: hotpink;\n  gap: 4px;\n  padding: 8px;\n}\n`,
    "utf8",
  );
  return root;
}
