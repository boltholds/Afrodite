import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { UiDocument } from "@afrodite/ui-ir";
import { planProjectSemanticBatch } from "../src/semanticBatch.js";
import { ProjectBridgeService } from "../src/service.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("project-aware semantic batches", () => {
  it("groups distinct source effects into one reviewed transaction", async () => {
    const service = new ProjectBridgeService({ projectRoot: await fixture() });
    const batch = await planProjectSemanticBatch(service, document(), [
      { type: "convert_to_grid", nodeId: "node.card", gap: 16 },
      { type: "convert_to_grid", nodeId: "node.panel", gap: 20 },
    ]);

    expect(batch.status).toBe("ready");
    expect(batch.applicationMode).toBe("document-and-source");
    expect(batch.sourcePlans).toHaveLength(2);
    expect(batch.sourceTransaction?.files).toHaveLength(2);
    expect(batch.sourceTransaction?.files.map((file) => file.repositoryPath)).toEqual([
      "src/Card.tsx",
      "src/Panel.tsx",
    ]);
    expect(batch.documentAfter?.root.children[0]?.layout.display).toBe("grid");
    expect(batch.documentAfter?.root.children[1]?.layout.gap).toBe(20);
  });

  it("returns a blocked batch before creating source plans for same-file conflicts", async () => {
    const root = await fixture();
    const input = document();
    input.root.children[1]!.sourceBinding!.repositoryPath = "src/Card.tsx";
    input.root.children[1]!.sourceBinding!.stableMarker = "panel.secondary";
    await writeFile(
      path.join(root, "src/Card.tsx"),
      `export const Card = () => <section data-afrodite-id="card.primary" className="flex flex-col gap-[8px]" />;\nexport const Panel = () => <aside data-afrodite-id="panel.secondary" className="flex flex-col gap-[12px]" />;\n`,
      "utf8",
    );
    const service = new ProjectBridgeService({ projectRoot: root });
    const batch = await planProjectSemanticBatch(service, input, [
      { type: "convert_to_grid", nodeId: "node.card" },
      { type: "convert_to_grid", nodeId: "node.panel" },
    ]);

    expect(batch.status).toBe("blocked");
    expect(batch.sourcePlans).toEqual([]);
    expect(batch.sourceTransaction).toBeUndefined();
    expect(batch.diagnostics.some((item) => item.code === "SEMANTIC_BATCH_SOURCE_FILE_CONFLICT")).toBe(true);
  });
});

function document(): UiDocument {
  const ownership = {
    strategy: "utility" as const,
    dialect: "tailwind" as const,
    attribute: "className" as const,
    managedProperties: ["display", "gap"] as const,
  };
  return {
    schemaVersion: 1,
    id: "doc.semantic-batch",
    name: "Semantic batch",
    root: {
      id: "node.root",
      kind: "element",
      element: "main",
      name: "Root",
      layout: {
        display: "flex",
        direction: "column",
        sizing: { width: "fill", height: "fill" },
      },
      props: {},
      children: [
        {
          id: "node.card",
          kind: "element",
          element: "section",
          name: "Card",
          layout: {
            display: "flex",
            direction: "column",
            gap: 8,
            sizing: { width: "fill", height: "hug" },
          },
          props: {},
          sourceBinding: {
            frameworkId: "react",
            adapterId: "afrodite.adapter.react",
            repositoryPath: "src/Card.tsx",
            stableMarker: "card.primary",
            styleOwnership: ownership,
          },
          children: [],
        },
        {
          id: "node.panel",
          kind: "element",
          element: "aside",
          name: "Panel",
          layout: {
            display: "flex",
            direction: "column",
            gap: 12,
            sizing: { width: 240, height: "fill" },
          },
          props: {},
          sourceBinding: {
            frameworkId: "react",
            adapterId: "afrodite.adapter.react",
            repositoryPath: "src/Panel.tsx",
            stableMarker: "panel.secondary",
            styleOwnership: ownership,
          },
          children: [],
        },
      ],
    },
  };
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "afrodite-semantic-batch-"));
  roots.push(root);
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(
    path.join(root, "src/Card.tsx"),
    `export const Card = () => <section data-afrodite-id="card.primary" className="flex flex-col gap-[8px]" />;\n`,
    "utf8",
  );
  await writeFile(
    path.join(root, "src/Panel.tsx"),
    `export const Panel = () => <aside data-afrodite-id="panel.secondary" className="flex flex-col gap-[12px]" />;\n`,
    "utf8",
  );
  return root;
}
