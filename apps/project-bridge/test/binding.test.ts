import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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

describe("ProjectBridgeService binding workflow", () => {
  it("discovers a JSX target, plans a reviewed marker patch, and applies it", async () => {
    const root = await createFixture(false);
    const service = new ProjectBridgeService({
      projectRoot: root,
      verificationRunner: successfulRunner,
    });

    const discovery = await service.discoverBindings({
      adapterId: "afrodite.adapter.react",
      repositoryPath: "src/Card.tsx",
      exportName: "Card",
      componentId: "src/Card.tsx#Card",
    });
    expect(discovery.candidates.map((candidate) => candidate.elementName)).toEqual([
      "section",
      "span",
    ]);

    const plan = await service.planBinding({
      nodeId: "node.card",
      adapterId: "afrodite.adapter.react",
      repositoryPath: "src/Card.tsx",
      candidateId: discovery.candidates[0]!.candidateId,
      stableMarker: "ui.card.primary",
      expectedSourceVersion: discovery.sourceVersion,
      exportName: "Card",
      componentId: "src/Card.tsx#Card",
    });

    expect(plan.sourceWriteRequired).toBe(true);
    expect(plan.changed).toBe(true);
    expect(plan.diff).toContain('+    <section data-afrodite-id="ui.card.primary" className="card">');
    expect(plan.proposedBinding).toEqual({
      frameworkId: "react",
      adapterId: "afrodite.adapter.react",
      repositoryPath: "src/Card.tsx",
      stableMarker: "ui.card.primary",
      exportName: "Card",
      componentId: "src/Card.tsx#Card",
    });

    const result = await service.applyPatch(plan.planId, plan.sourceVersion, "binding-test");
    expect(result.status).toBe("applied");
    const source = await readFile(path.join(root, "src/Card.tsx"), "utf8");
    expect(source).toContain('data-afrodite-id="ui.card.primary"');
  });

  it("confirms an existing matching marker without storing an empty write", async () => {
    const root = await createFixture(true);
    const service = new ProjectBridgeService({
      projectRoot: root,
      verificationRunner: successfulRunner,
    });
    const discovery = await service.discoverBindings({
      adapterId: "afrodite.adapter.react",
      repositoryPath: "src/Card.tsx",
    });
    const candidate = discovery.candidates[0]!;
    expect(candidate.existingMarker).toBe("ui.card.primary");

    const plan = await service.planBinding({
      nodeId: "node.card",
      adapterId: "afrodite.adapter.react",
      repositoryPath: "src/Card.tsx",
      candidateId: candidate.candidateId,
      stableMarker: "ui.card.primary",
      expectedSourceVersion: discovery.sourceVersion,
    });

    expect(plan.sourceWriteRequired).toBe(false);
    expect(plan.changed).toBe(false);
    expect(plan.diagnostics.some((diagnostic) => diagnostic.code === "STABLE_MARKER_ALREADY_INSTALLED")).toBe(true);
  });
});

async function createFixture(marked: boolean): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "afrodite-binding-"));
  roots.push(root);
  await mkdir(path.join(root, "src"), { recursive: true });
  const marker = marked ? ' data-afrodite-id="ui.card.primary"' : "";
  await writeFile(
    path.join(root, "src/Card.tsx"),
    `export function Card() {
  return (
    <section${marker} className="card">
      <span>Card</span>
    </section>
  );
}
`,
    "utf8",
  );
  return root;
}
