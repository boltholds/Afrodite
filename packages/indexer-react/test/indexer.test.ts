import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { indexReactProject } from "../src/indexer.js";

const fixtureRoot = fileURLToPath(new URL("./fixtures/react-app", import.meta.url));

describe("indexReactProject", () => {
  it("discovers React components without treating hooks or ordinary functions as components", () => {
    const catalog = indexReactProject({ projectRoot: fixtureRoot });

    expect(catalog.frameworks?.[0]).toMatchObject({
      frameworkId: "react",
      adapterId: "afrodite.adapter.react",
    });
    expect(catalog.components.map((component) => component.name)).toEqual([
      "ActionCard",
      "ContextBadge",
    ]);
    expect(catalog.components.every((component) => component.frameworkId === "react")).toBe(true);
    expect(catalog.components.some((component) => component.name === "add")).toBe(false);

    const actionCard = catalog.components.find((component) => component.name === "ActionCard");
    expect(actionCard?.props.find((prop) => prop.name === "title")).toMatchObject({
      required: true,
      serializable: true,
      valueKind: "string",
      description: "Visible card title.",
    });
    expect(actionCard?.props.find((prop) => prop.name === "tone")).toMatchObject({
      required: false,
      serializable: true,
      valueKind: "enum",
      defaultValue: "pink",
    });
    expect(actionCard?.props.find((prop) => prop.name === "onActivate")).toMatchObject({
      serializable: false,
      valueKind: "unknown",
    });
  });

  it("reports async, server-only, context, and runtime-prop boundaries explicitly", () => {
    const catalog = indexReactProject({ projectRoot: fixtureRoot });
    const codes = catalog.diagnostics.map((diagnostic) => diagnostic.code);

    expect(codes).toContain("ASYNC_COMPONENT_UNSUPPORTED");
    expect(codes).toContain("SERVER_COMPONENT_UNSUPPORTED");
    expect(codes).toContain("CONTEXT_DEPENDENCY_UNSUPPORTED");
    expect(catalog.diagnostics).toContainEqual(expect.objectContaining({
      code: "UNSUPPORTED_PROP_TYPE",
      componentName: "ActionCard",
      propName: "onActivate",
      frameworkId: "react",
    }));
  });

  it("returns a structured diagnostic when tsconfig is missing", () => {
    const catalog = indexReactProject({
      projectRoot: fixtureRoot,
      tsconfigPath: "missing.json",
    });

    expect(catalog.components).toEqual([]);
    expect(catalog.diagnostics[0]).toMatchObject({
      code: "TSCONFIG_READ_FAILED",
      frameworkId: "react",
      severity: "error",
    });
  });
});
