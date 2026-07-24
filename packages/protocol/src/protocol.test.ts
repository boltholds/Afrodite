import { describe, expect, it } from "vitest";
import {
  componentCatalogSchema,
  createPreviewRenderRequest,
  decodeComponentCatalog,
  decodePreviewMessage,
} from "./index";

const node = {
  id: "node.button",
  kind: "component" as const,
  component: "Button",
  name: "Button",
  props: { label: "Launch" },
  layout: {
    display: "block" as const,
    direction: "column" as const,
    sizing: { width: "hug" as const, height: "hug" as const },
  },
  children: [],
};

describe("component catalog protocol", () => {
  it("decodes a valid catalog", () => {
    const catalog = componentCatalogSchema.parse({
      schemaVersion: 1,
      projectRoot: "/workspace",
      tsconfigPath: "/workspace/tsconfig.json",
      components: [
        {
          id: "src/Button.tsx#Button",
          name: "Button",
          exportName: "Button",
          sourcePath: "src/Button.tsx",
          location: { line: 1, column: 1 },
          declarationKind: "variable",
          props: [],
        },
      ],
      diagnostics: [],
    });

    const decoded = decodeComponentCatalog(JSON.stringify(catalog));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(decoded.catalog.components[0]?.name).toBe("Button");
  });

  it("returns diagnostics for invalid JSON", () => {
    const decoded = decodeComponentCatalog("{");
    expect(decoded.ok).toBe(false);
    if (!decoded.ok) expect(decoded.diagnostics[0]?.code).toBe("INVALID_CATALOG_JSON");
  });
});

describe("preview protocol", () => {
  it("round-trips a render request", () => {
    const request = createPreviewRenderRequest(node, "request.1");
    expect(decodePreviewMessage(request)).toEqual(request);
  });
});
