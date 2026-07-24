import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { indexSolidProject } from "../src/indexer.js";

const fixtureRoot = fileURLToPath(new URL("./fixtures/solid-app", import.meta.url));

describe("indexSolidProject", () => {
  it("discovers exported SolidJS components without executing project code", () => {
    const catalog = indexSolidProject({ projectRoot: fixtureRoot });

    expect(catalog.components.map((component) => component.name)).toEqual([
      "Button",
      "Panel",
    ]);
    expect(catalog.components).toHaveLength(2);

    const button = catalog.components.find((component) => component.name === "Button");
    expect(button).toBeDefined();
    expect(button?.sourcePath).toBe("src/Button.tsx");
    expect(button?.exportName).toBe("Button");

    expect(button?.props.find((prop) => prop.name === "label")).toMatchObject({
      required: true,
      serializable: true,
      valueKind: "string",
      description: "Visible button label.",
    });
    expect(button?.props.find((prop) => prop.name === "tone")).toMatchObject({
      required: false,
      serializable: true,
      valueKind: "enum",
    });
    expect(button?.props.find((prop) => prop.name === "metadata")).toMatchObject({
      serializable: true,
      valueKind: "object",
    });
    expect(button?.props.find((prop) => prop.name === "onClick")).toMatchObject({
      serializable: false,
      valueKind: "unknown",
    });

    expect(catalog.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "UNSUPPORTED_PROP_TYPE",
        componentName: "Button",
        propName: "onClick",
      }),
    );
    expect(catalog.components.some((component) => component.name === "add")).toBe(false);
  });

  it("returns a structured diagnostic when tsconfig is missing", () => {
    const catalog = indexSolidProject({
      projectRoot: fileURLToPath(new URL("./fixtures", import.meta.url)),
      tsconfigPath: "missing.json",
    });

    expect(catalog.components).toEqual([]);
    expect(catalog.diagnostics[0]).toMatchObject({
      severity: "error",
    });
  });
});
