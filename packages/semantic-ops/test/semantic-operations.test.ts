import { describe, expect, it } from "vitest";
import type { UiDocument } from "@afrodite/ui-ir";
import {
  applySemanticDocumentPlan,
  planSemanticOperation,
} from "../src/index.js";

function document(): UiDocument {
  return {
    schemaVersion: 1,
    id: "doc.demo",
    name: "Demo",
    root: {
      id: "node.root",
      kind: "element",
      element: "main",
      name: "Root",
      layout: {
        display: "flex",
        direction: "column",
        gap: 8,
        padding: 12,
        sizing: { width: "fill", height: "hug" },
      },
      variants: { responsive: [], states: [] },
      props: {},
      sourceBinding: {
        frameworkId: "react",
        adapterId: "afrodite.adapter.react",
        repositoryPath: "src/Card.tsx",
        stableMarker: "card.primary",
        styleOwnership: {
          strategy: "utility",
          dialect: "tailwind",
          attribute: "className",
          managedProperties: ["display", "gap", "direction"],
        },
      },
      children: [],
    },
  };
}

describe("semantic operation planner", () => {
  it("plans convert_to_grid as a document and owned source change", () => {
    const plan = planSemanticOperation(document(), {
      type: "convert_to_grid",
      nodeId: "node.root",
      gap: 16,
    });

    expect(plan.status).toBe("ready");
    expect(plan.applicationMode).toBe("document-and-source");
    expect(plan.documentAfter?.root.layout.display).toBe("grid");
    expect(plan.documentAfter?.root.layout.gap).toBe(16);
    expect(plan.sourceIntents[0]?.type).toBe("style");
  });

  it("keeps a valid semantic change document-only when ownership is incomplete", () => {
    const input = document();
    input.root.sourceBinding!.styleOwnership = {
      strategy: "utility",
      dialect: "tailwind",
      managedProperties: ["gap"],
    };
    const plan = planSemanticOperation(input, {
      type: "convert_to_grid",
      nodeId: "node.root",
    });

    expect(plan.status).toBe("ready");
    expect(plan.applicationMode).toBe("document-only");
    expect(plan.diagnostics.some((item) => item.code === "SEMANTIC_OWNERSHIP_INCOMPLETE")).toBe(true);
  });

  it("creates one responsive variant without replacing an existing ID", () => {
    const command = {
      type: "create_responsive_variant" as const,
      nodeId: "node.root",
      variantId: "tablet",
      minWidth: 768,
      layout: { direction: "row" as const, gap: 20 },
    };
    const plan = planSemanticOperation(document(), command);

    expect(plan.status).toBe("ready");
    expect(plan.sourceIntents[0]?.type).toBe("variant");
    expect(plan.documentAfter?.root.variants?.responsive[0]?.id).toBe("tablet");

    const applied = applySemanticDocumentPlan(document(), plan);
    const duplicate = planSemanticOperation(applied, command);
    expect(duplicate.status).toBe("blocked");
    expect(duplicate.diagnostics[0]?.code).toBe("SEMANTIC_VARIANT_ID_EXISTS");
  });

  it("refuses implicit design-token takeover", () => {
    const plan = planSemanticOperation(document(), {
      type: "replace_spacing_with_token",
      nodeId: "node.root",
      property: "gap",
      tokenName: "--space-card",
      tokenFilePath: "src/tokens.css",
    });

    expect(plan.status).toBe("blocked");
    expect(plan.diagnostics[0]?.code).toBe("SEMANTIC_TOKEN_TAKEOVER_REQUIRED");
  });

  it("remaps spacing only when design-token ownership already exists", () => {
    const input = document();
    input.root.sourceBinding!.styleOwnership = {
      strategy: "design-token",
      managedProperties: ["gap"],
      tokenFilePath: "src/tokens.css",
      tokens: { gap: "--space-old" },
    };
    const plan = planSemanticOperation(input, {
      type: "replace_spacing_with_token",
      nodeId: "node.root",
      property: "gap",
      tokenName: "--space-card",
      tokenFilePath: "src/tokens.css",
    });

    expect(plan.status).toBe("ready");
    expect(plan.applicationMode).toBe("document-and-source");
    expect(plan.sourceIntents[0]?.type).toBe("style");
    expect(plan.documentAfter?.root.sourceBinding?.styleOwnership).toMatchObject({
      strategy: "design-token",
      tokens: { gap: "--space-card" },
    });
  });

  it("explains read-only source-backed regions without creating mutations", () => {
    const input = document();
    input.root = {
      ...input.root,
      kind: "source-region",
      regionKind: "conditional",
      sourceRegion: {
        frameworkId: "react",
        adapterId: "afrodite.adapter.react",
        repositoryPath: "src/Card.tsx",
        sourceVersion: "fnv1a32:1234",
        start: 10,
        end: 40,
        line: 2,
        column: 3,
        mode: "read-only",
        regionKind: "conditional",
        excerpt: "ready ? <Card /> : null",
        reason: "Conditional rendering remains source-controlled.",
      },
    };
    const plan = planSemanticOperation(input, {
      type: "explain_unpatchable_region",
      nodeId: "node.root",
    });

    expect(plan.status).toBe("informational");
    expect(plan.documentAfter).toBeUndefined();
    expect(plan.explanation?.summary).toContain("Conditional rendering");
  });

  it("rejects stale document application", () => {
    const input = document();
    const plan = planSemanticOperation(input, {
      type: "convert_to_grid",
      nodeId: "node.root",
    });
    input.root.layout.padding = 99;
    expect(() => applySemanticDocumentPlan(input, plan)).toThrow(/stale/);
  });
});
