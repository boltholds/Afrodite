import { reactFrameworkDescriptor } from "@afrodite/adapter-react";
import { solidFrameworkDescriptor } from "@afrodite/adapter-solid";
import { componentCatalogSchema } from "@afrodite/protocol";

export const sampleCatalog = componentCatalogSchema.parse({
  schemaVersion: 1,
  projectRoot: "packages/project-indexer/test/fixtures/solid-app",
  tsconfigPath: "packages/project-indexer/test/fixtures/solid-app/tsconfig.json",
  frameworks: [solidFrameworkDescriptor, reactFrameworkDescriptor],
  components: [
    {
      id: "src/Button.tsx#Button",
      frameworkId: "solid",
      adapterId: "afrodite.adapter.solid",
      name: "Button",
      exportName: "Button",
      sourcePath: "src/Button.tsx",
      location: { line: 17, column: 14 },
      declarationKind: "variable",
      props: [
        {
          name: "label",
          typeText: "string",
          required: true,
          serializable: true,
          valueKind: "string",
          description: "Visible button label.",
        },
        {
          name: "disabled",
          typeText: "boolean | undefined",
          required: false,
          serializable: true,
          valueKind: "boolean",
          defaultValue: false,
        },
        {
          name: "tone",
          typeText: "\"pink\" | \"cyan\" | undefined",
          required: false,
          serializable: true,
          valueKind: "enum",
          defaultValue: "pink",
        },
        {
          name: "metadata",
          typeText: "{ trackingId: string; priority: number } | undefined",
          required: false,
          serializable: true,
          valueKind: "object",
        },
        {
          name: "onClick",
          typeText: "(() => void) | undefined",
          required: false,
          serializable: false,
          valueKind: "unknown",
        },
      ],
    },
    {
      id: "src/Panel.tsx#default",
      frameworkId: "solid",
      adapterId: "afrodite.adapter.solid",
      name: "Panel",
      exportName: "default",
      sourcePath: "src/Panel.tsx",
      location: { line: 3, column: 1 },
      declarationKind: "function",
      props: [
        {
          name: "title",
          typeText: "string",
          required: true,
          serializable: true,
          valueKind: "string",
        },
        {
          name: "tags",
          typeText: "string[] | undefined",
          required: false,
          serializable: true,
          valueKind: "array",
          defaultValue: ["semantic", "runtime"],
        },
        {
          name: "density",
          typeText: "\"compact\" | \"comfortable\" | undefined",
          required: false,
          serializable: true,
          valueKind: "enum",
          defaultValue: "compact",
        },
      ],
    },
  ],
  diagnostics: [
    {
      code: "UNSUPPORTED_PROP_TYPE",
      severity: "warning",
      message: "Button.onClick is runtime behavior and is not persisted in UI IR.",
      sourcePath: "src/Button.tsx",
      componentName: "Button",
      propName: "onClick",
      frameworkId: "solid",
      adapterId: "afrodite.adapter.solid",
    },
  ],
});
