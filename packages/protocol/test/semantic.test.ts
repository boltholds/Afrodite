import { describe, expect, it } from "vitest";
import {
  semanticOperationCommandSchema,
  semanticPlanRequestSchema,
} from "../src/semantic";

const document = {
  schemaVersion: 1 as const,
  id: "document.test",
  name: "Semantic protocol test",
  root: {
    id: "node.root",
    kind: "element" as const,
    element: "main",
    name: "Root",
    layout: {
      display: "flex" as const,
      direction: "column" as const,
      sizing: { width: "fill" as const, height: "fill" as const },
    },
    props: {},
    children: [],
  },
};

describe("semantic operation protocol", () => {
  it("initializes the discriminated command schema and parses every command family", () => {
    expect(semanticOperationCommandSchema.parse({
      type: "convert_to_grid",
      nodeId: "node.root",
      gap: 16,
    }).type).toBe("convert_to_grid");

    expect(semanticPlanRequestSchema.parse({
      document,
      command: {
        type: "create_responsive_variant",
        nodeId: "node.root",
        variantId: "tablet",
        minWidth: 768,
        maxWidth: 1024,
        layout: { direction: "row" },
      },
    }).apiVersion).toBe(1);
  });

  it("keeps responsive range validation outside discriminated-union members", () => {
    const result = semanticOperationCommandSchema.safeParse({
      type: "create_responsive_variant",
      nodeId: "node.root",
      variantId: "broken",
      minWidth: 768,
      maxWidth: 640,
      layout: { direction: "row" },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join(".") === "maxWidth")).toBe(true);
    }
  });
});
