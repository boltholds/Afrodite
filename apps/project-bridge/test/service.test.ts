import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { BridgeOperation } from "@afrodite/protocol";
import type { VerificationRunner } from "@afrodite/verified-write";
import { ProjectBridgeService } from "../src/service.js";

const roots: string[] = [];

const successfulRunner: VerificationRunner = {
  async run(step) {
    return { step, ok: true, exitCode: 0, stdout: "ok", stderr: "" };
  },
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("ProjectBridgeService", () => {
  it("plans, previews, approves, and applies a React layout patch", async () => {
    const root = await createFixture();
    const service = new ProjectBridgeService({
      projectRoot: root,
      verificationRunner: successfulRunner,
    });

    const plan = await service.planPatch(operation());
    expect(plan.changed).toBe(true);
    expect(plan.diff).toContain("+      flexDirection: \"row\"");
    expect(plan.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);

    const result = await service.applyPatch(plan.planId, plan.sourceVersion, "studio-test");
    expect(result.status).toBe("applied");
    expect(result.verification.every((execution) => execution.ok)).toBe(true);

    const source = await readFile(path.join(root, "src/Card.tsx"), "utf8");
    expect(source).toContain('display: "flex"');
    expect(source).toContain('flexDirection: "row"');
    expect(source).toContain('onClick={() => setOpen(true)}');
  });

  it("rejects an approval after the source changes", async () => {
    const root = await createFixture();
    const service = new ProjectBridgeService({
      projectRoot: root,
      verificationRunner: successfulRunner,
    });
    const plan = await service.planPatch(operation());
    const filePath = path.join(root, "src/Card.tsx");
    await writeFile(filePath, `${await readFile(filePath, "utf8")}\n// concurrent edit\n`, "utf8");

    const result = await service.applyPatch(plan.planId, plan.sourceVersion, "studio-test");
    expect(result.status).toBe("rejected");
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "SOURCE_VERSION_MISMATCH")).toBe(true);
  });
});

function operation(): BridgeOperation {
  return {
    kind: "update-layout",
    nodeId: "node.card",
    binding: {
      frameworkId: "react",
      adapterId: "afrodite.adapter.react",
      repositoryPath: "src/Card.tsx",
      stableMarker: "card.primary",
    },
    before: {
      display: "block",
      direction: "column",
      gap: 0,
      padding: 8,
      sizing: { width: "hug", height: "hug" },
    },
    after: {
      display: "flex",
      direction: "row",
      gap: 16,
      padding: 12,
      sizing: { width: "fill", height: 240 },
    },
  };
}

async function createFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "afrodite-bridge-"));
  roots.push(root);
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(
    path.join(root, "src/Card.tsx"),
    `import { useState } from "react";

export function Card() {
  const [open, setOpen] = useState(false);
  return (
    <section
      data-afrodite-id="card.primary"
      className="card"
      style={{ color: open ? "pink" : "cyan", display: "block", padding: "8px" }}
      onClick={() => setOpen(true)}
    >
      Card
    </section>
  );
}
`,
    "utf8",
  );
  return root;
}
