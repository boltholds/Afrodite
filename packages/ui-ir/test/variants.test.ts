import { describe, expect, it } from "vitest";
import { parseUiDocument } from "../src/index.js";

const baseDocument = {
  schemaVersion: 1 as const,
  id: "document.demo",
  name: "Demo",
  root: {
    id: "node.root",
    name: "Root",
    kind: "element" as const,
    element: "main",
    layout: {
      display: "flex" as const,
      direction: "column" as const,
      gap: 8,
      sizing: { width: "fill" as const, height: "hug" as const },
    },
    props: {},
    children: [],
  },
};

describe("Semantic UI variants", () => {
  it("parses responsive breakpoints and interaction states", () => {
    const document = parseUiDocument({
      ...baseDocument,
      root: {
        ...baseDocument.root,
        variants: {
          responsive: [
            {
              id: "tablet",
              minWidth: 768,
              layout: { direction: "row", gap: 16 },
            },
          ],
          states: [
            {
              id: "hovered",
              state: "hover",
              layout: { gap: 12 },
            },
            {
              id: "loading",
              state: "loading",
              layout: { display: "grid" },
            },
          ],
        },
      },
    });

    expect(document.root.variants?.responsive[0]?.minWidth).toBe(768);
    expect(document.root.variants?.states.map((variant) => variant.state)).toEqual(["hover", "loading"]);
  });

  it("rejects empty overrides, duplicate IDs, duplicate states, and invalid ranges", () => {
    const result = (() => {
      try {
        parseUiDocument({
          ...baseDocument,
          root: {
            ...baseDocument.root,
            variants: {
              responsive: [
                { id: "same", minWidth: 800, maxWidth: 700, layout: {} },
              ],
              states: [
                { id: "same", state: "hover", layout: { gap: 4 } },
                { id: "hover-again", state: "hover", layout: { gap: 6 } },
              ],
            },
          },
        });
        return undefined;
      } catch (error) {
        return error;
      }
    })();

    expect(result).toBeDefined();
  });

  it("keeps variant data optional for existing UI IR documents", () => {
    const document = parseUiDocument(baseDocument);
    expect(document.root.variants).toBeUndefined();
  });
});
