import { describe, expect, it } from "vitest";
import {
  semanticBatchPlanRequestSchema,
  semanticBatchPlanViewSchema,
} from "../src/semantic-batch";

const document = {
  schemaVersion: 1 as const,
  id: "document.batch",
  name: "Batch",
  root: {
    id: "node.root",
    kind: "element" as const,
    element: "main",
    name: "Root",
    layout: {
      display: "block" as const,
      direction: "column" as const,
      sizing: { width: "fill" as const, height: "fill" as const },
    },
    props: {},
    children: [],
  },
};

describe("semantic batch protocol", () => {
  it("parses a bounded ordered command request", () => {
    const request = semanticBatchPlanRequestSchema.parse({
      document,
      commands: [
        { type: "convert_to_grid", nodeId: "node.root", gap: 16 },
        {
          type: "create_responsive_variant",
          nodeId: "node.root",
          variantId: "tablet",
          minWidth: 768,
          layout: { direction: "row" },
        },
      ],
    });

    expect(request.apiVersion).toBe(1);
    expect(request.semanticApiVersion).toBe(1);
    expect(request.commands).toHaveLength(2);
  });

  it("rejects more than sixteen commands", () => {
    expect(() => semanticBatchPlanRequestSchema.parse({
      document,
      commands: Array.from({ length: 17 }, () => ({
        type: "convert_to_grid",
        nodeId: "node.root",
      })),
    })).toThrow();
  });

  it("keeps a source transaction distinct from source plan previews", () => {
    const parsed = semanticBatchPlanViewSchema.parse({
      apiVersion: 1,
      semanticApiVersion: 1,
      batchId: "semantic-batch:fixture",
      documentVersion: "ui-fnv1a32:fixture",
      status: "blocked",
      applicationMode: "document-only",
      commands: [{ type: "convert_to_grid", nodeId: "node.root" }],
      steps: [],
      diagnostics: [{
        code: "SEMANTIC_BATCH_WRITE_CONFLICT",
        severity: "error",
        message: "Conflict",
        commandIndex: 0,
        conflictKey: "node:node.root:layout.display",
      }],
      sourcePlans: [],
    });

    expect(parsed.sourceTransaction).toBeUndefined();
    expect(parsed.diagnostics[0]?.commandIndex).toBe(0);
  });
});
