import { describe, expect, it } from "vitest";
import type { FrameworkDescriptor } from "@afrodite/framework-core";
import {
  ScreenImportAdapterRegistry,
  createJsxScreenImportAdapter,
  importJsxScreen,
} from "../src/index.js";

const reactDescriptor: FrameworkDescriptor = {
  frameworkId: "react",
  adapterId: "afrodite.adapter.react",
  displayName: "React",
  adapterVersion: "0.4.0",
  sourceExtensions: [".tsx", ".jsx"],
  runtimePackages: ["react"],
  capabilities: {
    projectDetection: true,
    staticIndexing: true,
    runtimePreview: true,
    sourcePatching: true,
    propEditing: true,
  },
};

describe("bounded JSX screen import", () => {
  it("imports a static React tree and preserves control flow as read-only source regions", () => {
    const source = `export function Dashboard(props: { ready: boolean; items: string[] }) {
  return (
    <main data-afrodite-id="dashboard.root" style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }} aria-label="Dashboard">
      <header className="flex flex-row gap-2"><h1>Overview</h1></header>
      {props.ready ? <section data-afrodite-id="dashboard.ready">Ready</section> : <section>Loading</section>}
      {props.items.map((item) => <article key={item}>{item}</article>)}
    </main>
  );
}`;
    const result = importJsxScreen(
      reactDescriptor,
      { repositoryPath: "src/Dashboard.tsx", exportName: "Dashboard" },
      { repositoryPath: "src/Dashboard.tsx", content: source },
      "data-afrodite-id",
      true,
    );

    expect(result.document).toBeDefined();
    expect(result.document?.root.kind).toBe("element");
    expect(result.document?.root.sourceRegion?.mode).toBe("editable");
    expect(result.document?.root.sourceBinding?.stableMarker).toBe("dashboard.root");
    expect(result.document?.root.layout).toMatchObject({
      display: "flex",
      direction: "column",
      gap: 16,
      sizing: { width: "fill", height: "hug" },
    });
    expect(result.stats.editableNodes).toBeGreaterThanOrEqual(2);
    expect(result.stats.requiresBindingNodes).toBeGreaterThanOrEqual(2);
    expect(result.stats.readOnlyRegions).toBeGreaterThanOrEqual(4);
    expect(findKinds(result.document!.root)).toContain("conditional");
    expect(findKinds(result.document!.root)).toContain("iteration");
  });

  it("imports missing markers as requires-binding and keeps dynamic props out of serializable props", () => {
    const source = `export const Card = (props: { title: string }) => (
  <article className="grid gap-4 p-6 w-full" title={props.title} data-static="yes">
    Card
  </article>
);`;
    const result = importJsxScreen(
      reactDescriptor,
      { repositoryPath: "src/Card.tsx", exportName: "Card" },
      { repositoryPath: "src/Card.tsx", content: source },
    );

    expect(result.document?.root.sourceRegion?.mode).toBe("requires-binding");
    expect(result.document?.root.sourceBinding?.stableMarker).toBeUndefined();
    expect(result.document?.root.props).toEqual({ "data-static": "yes" });
    expect(result.document?.root.layout).toMatchObject({
      display: "grid",
      gap: 16,
      padding: 24,
      sizing: { width: "fill", height: "hug" },
    });
    expect(result.diagnostics.some((item) => item.code === "DYNAMIC_PROP_IMPORTED_READ_ONLY")).toBe(true);
  });

  it("requires an explicit export when a module has several screen candidates", () => {
    const source = `export const One = () => <main />;
export const Two = () => <aside />;`;
    const result = importJsxScreen(
      reactDescriptor,
      { repositoryPath: "src/screens.tsx" },
      { repositoryPath: "src/screens.tsx", content: source },
    );

    expect(result.document).toBeUndefined();
    expect(result.diagnostics.some((item) => item.code === "SCREEN_EXPORT_AMBIGUOUS")).toBe(true);
  });

  it("imports React server modules as read-only instead of executing or editing them", () => {
    const source = `"use server";
export function ServerScreen() {
  return <main data-afrodite-id="server.root">Server</main>;
}`;
    const result = importJsxScreen(
      reactDescriptor,
      { repositoryPath: "src/ServerScreen.tsx", exportName: "ServerScreen" },
      { repositoryPath: "src/ServerScreen.tsx", content: source },
      "data-afrodite-id",
      true,
    );

    expect(result.document?.root.sourceRegion?.mode).toBe("read-only");
    expect(result.document?.root.sourceRegion?.reason).toContain("use server");
    expect(result.diagnostics.some((item) => item.code === "SERVER_MODULE_IMPORTED_READ_ONLY")).toBe(true);
  });

  it("registers import adapters by adapter identity", () => {
    const registry = new ScreenImportAdapterRegistry();
    const adapter = createJsxScreenImportAdapter({ descriptor: reactDescriptor, rejectUseServer: true });
    registry.register(adapter);
    expect(registry.get("afrodite.adapter.react")).toBe(adapter);
    expect(() => registry.register(adapter)).toThrow(/already registered/);
  });
});

function findKinds(node: NonNullable<ReturnType<typeof importJsxScreen>["document"]>["root"]): string[] {
  return [node.kind === "source-region" ? node.regionKind : node.kind, ...node.children.flatMap(findKinds)];
}
