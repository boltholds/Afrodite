import { describe, expect, it } from "vitest";
import {
  decodeUiDocument,
  parseUiDocument,
  serializeUiDocument,
} from "../src/index";

describe("manual interaction UI IR properties", () => {
  it("round-trips position and appearance through document JSON", () => {
    const document = parseUiDocument({
      schemaVersion: 1,
      id: "document.manual-properties",
      name: "Manual properties",
      root: {
        id: "node.root",
        kind: "element",
        element: "main",
        name: "Root",
        layout: {
          display: "block",
          direction: "column",
          sizing: { width: "fill", height: "fill" },
        },
        position: { x: 24, y: -8 },
        appearance: { borderRadius: 18 },
        props: {},
        children: [],
      },
    });

    const decoded = decodeUiDocument(serializeUiDocument(document));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.document.root.position).toEqual({ x: 24, y: -8 });
    expect(decoded.document.root.appearance).toEqual({ borderRadius: 18 });
  });

  it("keeps old documents valid when manual properties are absent", () => {
    const document = parseUiDocument({
      schemaVersion: 1,
      id: "document.backward-compatible",
      name: "Backward compatible",
      root: {
        id: "node.root",
        kind: "element",
        element: "main",
        name: "Root",
        layout: {
          display: "block",
          direction: "column",
          sizing: { width: "fill", height: "fill" },
        },
        props: {},
        children: [],
      },
    });

    expect(document.root.position).toBeUndefined();
    expect(document.root.appearance).toBeUndefined();
  });

  it("rejects negative radius and non-finite coordinates", () => {
    expect(() => parseUiDocument({
      schemaVersion: 1,
      id: "document.invalid-manual-properties",
      name: "Invalid manual properties",
      root: {
        id: "node.root",
        kind: "element",
        element: "main",
        name: "Root",
        layout: {
          display: "block",
          direction: "column",
          sizing: { width: "fill", height: "fill" },
        },
        position: { x: Number.POSITIVE_INFINITY, y: 0 },
        appearance: { borderRadius: -1 },
        props: {},
        children: [],
      },
    })).toThrow();
  });
});
