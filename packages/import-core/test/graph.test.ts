import { describe, expect, it } from "vitest";
import type { FrameworkDescriptor, SourceSnapshot } from "@afrodite/framework-core";
import { createJsxScreenImportAdapter } from "../src/index.js";
import {
  importScreenGraph,
  type ScreenImportSourceProvider,
} from "../src/graph.js";

const reactDescriptor: FrameworkDescriptor = {
  frameworkId: "react",
  adapterId: "afrodite.adapter.react",
  displayName: "React",
  adapterVersion: "0.5.0",
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

const adapter = createJsxScreenImportAdapter({
  descriptor: reactDescriptor,
  rejectUseServer: true,
});

describe("bounded multi-file screen import graph", () => {
  it("expands direct local imports and preserves per-file source provenance", async () => {
    const provider = memoryProvider({
      "src/Screen.tsx": `import { Card } from "./Card";
export function Screen() {
  return <main data-afrodite-id="screen.root"><Card /></main>;
}`,
      "src/Card.tsx": `import Badge from "./Badge";
export function Card() {
  return <article data-afrodite-id="card.root"><Badge /></article>;
}`,
      "src/Badge.tsx": `export default function Badge() {
  return <span data-afrodite-id="badge.root" />;
}`,
    });

    const result = await importScreenGraph(
      adapter,
      {
        repositoryPath: "src/Screen.tsx",
        exportName: "Screen",
        maxFiles: 8,
        maxNodes: 100,
        maxGraphDepth: 8,
      },
      provider,
    );

    expect(result.document).toBeDefined();
    expect(result.graph.filesRead).toBe(3);
    expect(result.graph.expandedComponents).toBe(2);
    expect(result.edges.map((edge) => edge.status)).toEqual(["expanded", "expanded"]);
    expect(result.files.map((file) => file.repositoryPath)).toEqual([
      "src/Screen.tsx",
      "src/Card.tsx",
      "src/Badge.tsx",
    ]);
    expect(sourcePaths(result.document!.root)).toEqual(expect.arrayContaining([
      "src/Screen.tsx",
      "src/Card.tsx",
      "src/Badge.tsx",
    ]));
    expect(uniqueNodeIds(result.document!.root)).toBe(true);
  });

  it("detects local component cycles and leaves the cyclic reference as a boundary", async () => {
    const provider = memoryProvider({
      "src/A.tsx": `import { B } from "./B";
export function A() { return <main data-afrodite-id="a.root"><B /></main>; }`,
      "src/B.tsx": `import { A } from "./A";
export function B() { return <section data-afrodite-id="b.root"><A /></section>; }`,
    });

    const result = await importScreenGraph(
      adapter,
      {
        repositoryPath: "src/A.tsx",
        exportName: "A",
        maxFiles: 8,
        maxNodes: 100,
        maxGraphDepth: 8,
      },
      provider,
    );

    expect(result.graph.cycles).toBe(1);
    expect(result.graph.boundaries).toBeGreaterThanOrEqual(1);
    expect(result.edges.some((edge) => edge.status === "cycle")).toBe(true);
    expect(result.diagnostics.some((item) => item.code === "LOCAL_COMPONENT_IMPORT_CYCLE")).toBe(true);
    expect(result.stats.totalNodes).toBeLessThan(20);
  });

  it("supports explicit expansion and user-controlled stop boundaries", async () => {
    const provider = memoryProvider({
      "src/Screen.tsx": `import { Card } from "./Card";
export function Screen() { return <main data-afrodite-id="screen.root"><Card /></main>; }`,
      "src/Card.tsx": `export function Card() { return <article data-afrodite-id="card.root" />; }`,
    });

    const explicitBoundary = await importScreenGraph(
      adapter,
      {
        repositoryPath: "src/Screen.tsx",
        exportName: "Screen",
        expansionMode: "explicit",
        expandComponents: [],
      },
      provider,
    );
    expect(explicitBoundary.edges[0]?.status).toBe("boundary");
    expect(explicitBoundary.graph.filesRead).toBe(1);

    const explicitExpansion = await importScreenGraph(
      adapter,
      {
        repositoryPath: "src/Screen.tsx",
        exportName: "Screen",
        expansionMode: "explicit",
        expandComponents: ["Card"],
      },
      provider,
    );
    expect(explicitExpansion.edges[0]?.status).toBe("expanded");

    const stopped = await importScreenGraph(
      adapter,
      {
        repositoryPath: "src/Screen.tsx",
        exportName: "Screen",
        stopComponents: ["Card"],
      },
      provider,
    );
    expect(stopped.edges[0]?.status).toBe("boundary");
  });

  it("enforces file, node, and graph-depth budgets", async () => {
    const provider = memoryProvider({
      "src/Screen.tsx": `import { Card } from "./Card";
export function Screen() { return <main data-afrodite-id="screen.root"><Card /></main>; }`,
      "src/Card.tsx": `export function Card() { return <article data-afrodite-id="card.root" />; }`,
    });

    const fileLimited = await importScreenGraph(
      adapter,
      {
        repositoryPath: "src/Screen.tsx",
        exportName: "Screen",
        maxFiles: 1,
      },
      provider,
    );
    expect(fileLimited.edges[0]?.status).toBe("budget");
    expect(fileLimited.graph.truncated).toBe(true);

    const nodeLimited = await importScreenGraph(
      adapter,
      {
        repositoryPath: "src/Screen.tsx",
        exportName: "Screen",
        maxNodes: 2,
      },
      provider,
    );
    expect(nodeLimited.stats.totalNodes).toBeLessThanOrEqual(2);
    expect(nodeLimited.edges[0]?.status).toBe("budget");

    const depthLimited = await importScreenGraph(
      adapter,
      {
        repositoryPath: "src/Screen.tsx",
        exportName: "Screen",
        maxGraphDepth: 0,
      },
      provider,
    );
    expect(depthLimited.edges[0]?.status).toBe("budget");
  });
});

function memoryProvider(files: Readonly<Record<string, string>>): ScreenImportSourceProvider {
  return {
    async read(repositoryPath: string): Promise<SourceSnapshot> {
      const content = files[repositoryPath];
      if (content === undefined) throw new Error(`Missing fixture ${repositoryPath}`);
      return { repositoryPath, content };
    },
  };
}

function sourcePaths(node: NonNullable<Awaited<ReturnType<typeof importScreenGraph>>["document"]>["root"]): string[] {
  return [
    ...(node.sourceRegion ? [node.sourceRegion.repositoryPath] : []),
    ...node.children.flatMap(sourcePaths),
  ];
}

function uniqueNodeIds(node: NonNullable<Awaited<ReturnType<typeof importScreenGraph>>["document"]>["root"]): boolean {
  const ids: string[] = [];
  const visit = (current: typeof node): void => {
    ids.push(current.id);
    current.children.forEach(visit);
  };
  visit(node);
  return new Set(ids).size === ids.length;
}
