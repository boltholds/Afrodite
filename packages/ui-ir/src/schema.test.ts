import { describe, expect, it } from "vitest";
import { parseUiDocument } from "./schema";

describe("parseUiDocument", () => {
  it("accepts a minimal semantic document", () => {
    const document = parseUiDocument({
      schemaVersion: 1,
      id: "document.test",
      name: "Test",
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
        children: [],
      },
    });

    expect(document.root.props).toEqual({});
    expect(document.root.children).toEqual([]);
  });

  it("rejects duplicate-free semantics only at a later validation layer", () => {
    const document = parseUiDocument({
      schemaVersion: 1,
      id: "document.test",
      name: "Test",
      root: {
        id: "node.root",
        kind: "component",
        component: "Button",
        name: "Button",
        layout: {
          display: "block",
          sizing: { width: "hug", height: "hug" },
        },
        children: [],
      },
    });

    expect(document.root.kind).toBe("component");
  });
});
