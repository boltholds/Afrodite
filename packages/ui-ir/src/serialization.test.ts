import { describe, expect, it } from "vitest";
import { parseUiDocument } from "./schema";
import {
  decodeUiDocument,
  serializeUiDocument,
  validateUiDocument,
} from "./serialization";

const document = parseUiDocument({
  schemaVersion: 1,
  id: "document.test",
  name: "Serialization test",
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

describe("UI document serialization", () => {
  it("round-trips a valid document", () => {
    const decoded = decodeUiDocument(serializeUiDocument(document));

    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.document).toEqual(document);
    }
  });

  it("returns a structured diagnostic for invalid JSON", () => {
    const decoded = decodeUiDocument("{");

    expect(decoded.ok).toBe(false);
    if (!decoded.ok) {
      expect(decoded.diagnostics[0]?.code).toBe("invalid-json");
      expect(decoded.diagnostics[0]?.path).toBe("$");
    }
  });

  it("returns schema diagnostics instead of guessing", () => {
    const decoded = decodeUiDocument(JSON.stringify({ schemaVersion: 1 }));

    expect(decoded.ok).toBe(false);
    if (!decoded.ok) {
      expect(decoded.diagnostics.some((diagnostic) => diagnostic.code === "schema-invalid")).toBe(true);
    }
  });

  it("detects duplicate stable node IDs", () => {
    const duplicated = parseUiDocument({
      ...document,
      root: {
        ...document.root,
        children: [
          {
            ...document.root,
            children: [],
          },
        ],
      },
    });

    expect(validateUiDocument(duplicated)).toEqual([
      expect.objectContaining({ code: "duplicate-node-id", path: "root.children.0" }),
    ]);
  });
});
