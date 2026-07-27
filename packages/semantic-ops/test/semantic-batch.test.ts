import { describe, expect, it } from "vitest";
import { parseUiDocument } from "@afrodite/ui-ir";
import {
  applySemanticBatchDocumentPlan,
  planSemanticBatch,
} from "../src/batch";

function createDocument(secondPath = "src/Panel.tsx") {
  return parseUiDocument({
    schemaVersion: 1,
    id: "document.batch",
    name: "Batch fixture",
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
            sizing: { width: 320, height: "hug" },
          },
          sourceBinding: {
            frameworkId: "react",
            repositoryPath: "src/Card.tsx",
            stableMarker: "card",
            styleOwnership: {
              strategy: "inline",
              managedProperties: ["display", "gap"],
            },
          },
          props: {},
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
          sourceBinding: {
            frameworkId: "solid",
            repositoryPath: secondPath,
            stableMarker: "panel",
            styleOwnership: {
              strategy: "inline",
              managedProperties: ["display", "gap"],
            },
          },
          props: {},
          children: [],
        },
      ],
    },
  });
}

function createCssModuleDocument() {
  const document = createDocument();
  return parseUiDocument({
    ...document,
    root: {
      ...document.root,
      children: document.root.children.map((node, index) => ({
        ...node,
        sourceBinding: {
          ...node.sourceBinding!,
          repositoryPath: index === 0 ? "src/Card.tsx" : "src/Panel.tsx",
          styleOwnership: {
            strategy: "css-module" as const,
            managedProperties: ["display", "gap"] as const,
            stylesheetPath: "src/shared.module.css",
            className: index === 0 ? "card" : "panel",
          },
        },
      })),
    },
  });
}

describe("typed semantic batches", () => {
  it("combines ordered independent commands into one deterministic document and source intent set", () => {
    const document = createDocument();
    const commands = [
      { type: "convert_to_grid" as const, nodeId: "node.card", gap: 16 },
      { type: "convert_to_grid" as const, nodeId: "node.panel", gap: 20 },
    ];

    const first = planSemanticBatch(document, commands);
    const second = planSemanticBatch(document, commands);

    expect(first.status).toBe("ready");
    expect(first.applicationMode).toBe("document-and-source");
    expect(first.batchId).toBe(second.batchId);
    expect(first.steps).toHaveLength(2);
    expect(first.sourceIntents).toHaveLength(2);
    expect(first.sourceTargetPaths).toEqual(["src/Card.tsx", "src/Panel.tsx"]);
    expect(first.documentAfter?.root.children[0]?.layout).toMatchObject({ display: "grid", gap: 16 });
    expect(first.documentAfter?.root.children[1]?.layout).toMatchObject({ display: "grid", gap: 20 });

    const applied = applySemanticBatchDocumentPlan(document, first);
    expect(applied).toEqual(first.documentAfter);
  });

  it("rejects two commands that write the same semantic field", () => {
    const plan = planSemanticBatch(createDocument(), [
      { type: "convert_to_grid", nodeId: "node.card", gap: 16 },
      { type: "convert_to_grid", nodeId: "node.card", gap: 24 },
    ]);

    expect(plan.status).toBe("blocked");
    expect(plan.documentAfter).toBeUndefined();
    expect(plan.diagnostics.some((item) => item.code === "SEMANTIC_BATCH_WRITE_CONFLICT")).toBe(true);
  });

  it("rejects distinct semantic writes that would require unsupported same-file source merging", () => {
    const plan = planSemanticBatch(createDocument("src/Card.tsx"), [
      { type: "convert_to_grid", nodeId: "node.card", gap: 16 },
      { type: "convert_to_grid", nodeId: "node.panel", gap: 20 },
    ]);

    expect(plan.status).toBe("blocked");
    expect(plan.diagnostics.some((item) => item.code === "SEMANTIC_BATCH_SOURCE_FILE_CONFLICT")).toBe(true);
  });

  it("detects conflicts on the actual CSS Module stylesheet rather than JSX bindings", () => {
    const plan = planSemanticBatch(createCssModuleDocument(), [
      { type: "convert_to_grid", nodeId: "node.card", gap: 16 },
      { type: "convert_to_grid", nodeId: "node.panel", gap: 20 },
    ]);

    expect(plan.status).toBe("blocked");
    expect(plan.diagnostics).toContainEqual(expect.objectContaining({
      code: "SEMANTIC_BATCH_SOURCE_FILE_CONFLICT",
      conflictKey: "source:src/shared.module.css",
    }));
  });

  it("rejects informational commands inside mutation batches", () => {
    const plan = planSemanticBatch(createDocument(), [
      { type: "explain_unpatchable_region", nodeId: "node.card" },
    ]);

    expect(plan.status).toBe("blocked");
    expect(plan.diagnostics.some((item) => item.code === "SEMANTIC_BATCH_INFORMATIONAL_COMMAND")).toBe(true);
  });

  it("rejects stale document application", () => {
    const document = createDocument();
    const plan = planSemanticBatch(document, [
      { type: "convert_to_grid", nodeId: "node.card" },
    ]);
    const changed = parseUiDocument({ ...document, name: "Changed after planning" });

    expect(() => applySemanticBatchDocumentPlan(changed, plan)).toThrow(/stale/i);
  });

  it("enforces the bounded command count", () => {
    const commands = Array.from({ length: 17 }, (_, index) => ({
      type: "convert_to_grid" as const,
      nodeId: index % 2 === 0 ? "node.card" : "node.panel",
    }));
    const plan = planSemanticBatch(createDocument(), commands);

    expect(plan.status).toBe("blocked");
    expect(plan.diagnostics.some((item) => item.code === "SEMANTIC_BATCH_LIMIT_EXCEEDED")).toBe(true);
  });
});
