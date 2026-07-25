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
  sourceBinding: {
    frameworkId: "react",
    adapterId: "afrodite.adapter.react",
    repositoryPath: "src/Button.tsx",
    exportName: "Button",
  },
  layout: {
    display: "block" as const,
    direction: "column" as const,
    sizing: { width: "hug" as const, height: "hug" as const },
  },
  children: [],
};

describe("component catalog protocol", () => {
  it("decodes framework metadata without coupling consumers to an adapter package", () => {
    const catalog = componentCatalogSchema.parse({
      schemaVersion: 1,
      projectRoot: "/workspace",
      tsconfigPath: "/workspace/tsconfig.json",
      frameworks: [
        {
          frameworkId: "react",
          adapterId: "afrodite.adapter.react",
          displayName: "React",
          adapterVersion: "0.1.0",
          sourceExtensions: [".tsx", ".jsx"],
          runtimePackages: ["react", "react-dom"],
          capabilities: {
            projectDetection: true,
            staticIndexing: false,
            runtimePreview: false,
            sourcePatching: false,
            propEditing: false,
          },
        },
      ],
      components: [
        {
          id: "src/Button.tsx#Button",
          frameworkId: "react",
          adapterId: "afrodite.adapter.react",
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
    if (decoded.ok) {
      expect(decoded.catalog.components[0]).toMatchObject({
        name: "Button",
        frameworkId: "react",
        adapterId: "afrodite.adapter.react",
      });
    }
  });

  it("keeps catalogs from the Solid-only bootstrap readable", () => {
    const decoded = decodeComponentCatalog(JSON.stringify({
      schemaVersion: 1,
      projectRoot: "/workspace",
      tsconfigPath: "/workspace/tsconfig.json",
      components: [],
      diagnostics: [],
    }));

    expect(decoded.ok).toBe(true);
  });

  it("returns diagnostics for invalid JSON", () => {
    const decoded = decodeComponentCatalog("{");
    expect(decoded.ok).toBe(false);
    if (!decoded.ok) expect(decoded.diagnostics[0]?.code).toBe("INVALID_CATALOG_JSON");
  });
});

describe("preview protocol", () => {
  it("includes the frameworks required by a render request", () => {
    const request = createPreviewRenderRequest(node, "request.1");
    expect(request.requiredFrameworks).toEqual(["react"]);
    expect(decodePreviewMessage(request)).toEqual(request);
  });
});
