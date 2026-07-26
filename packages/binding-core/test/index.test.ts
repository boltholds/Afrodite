import { describe, expect, it } from "vitest";
import { createPatchPreview } from "@afrodite/framework-core";
import {
  createJsxSourceBindingAdapter,
  SourceBindingAdapterRegistry,
} from "../src/index.js";

const descriptor = {
  frameworkId: "react",
  adapterId: "afrodite.adapter.react",
  displayName: "React",
  adapterVersion: "test",
  sourceExtensions: [".tsx", ".jsx"],
  runtimePackages: ["react"],
  capabilities: {
    projectDetection: true,
    staticIndexing: true,
    runtimePreview: true,
    sourcePatching: true,
    propEditing: true,
  },
} as const;

const adapter = createJsxSourceBindingAdapter({
  descriptor,
  rejectUseServer: true,
  verification: [],
});

const source = {
  repositoryPath: "src/Card.tsx",
  version: "source-v1",
  content: `export function Card() {
  return (
    <article className="card">
      <h2>Title</h2>
      <button type="button">Open</button>
    </article>
  );
}
`,
};

describe("JSX source binding", () => {
  it("discovers explicit JSX candidates without executing source", () => {
    const result = adapter.discoverCandidates(
      { repositoryPath: source.repositoryPath },
      source,
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.candidates.map((candidate) => candidate.elementName)).toEqual([
      "article",
      "h2",
      "button",
    ]);
    expect(result.candidates[0]?.line).toBe(3);
    expect(result.candidates[0]?.markerState).toBe("missing");
  });

  it("plans one exact marker insertion and returns a source binding", () => {
    const discovery = adapter.discoverCandidates(
      { repositoryPath: source.repositoryPath },
      source,
    );
    const candidate = discovery.candidates[0]!;
    const result = adapter.planStableMarker(
      {
        nodeId: "node.card",
        repositoryPath: source.repositoryPath,
        candidateId: candidate.candidateId,
        stableMarker: "ui.card.primary",
        expectedSourceVersion: source.version,
        exportName: "Card",
        componentId: "src/Card.tsx#Card",
      },
      source,
    );

    expect(result.sourceWriteRequired).toBe(true);
    expect(result.plan.operation).toBe("install-stable-marker");
    expect(result.proposedBinding).toEqual({
      frameworkId: "react",
      adapterId: "afrodite.adapter.react",
      repositoryPath: "src/Card.tsx",
      stableMarker: "ui.card.primary",
      exportName: "Card",
      componentId: "src/Card.tsx#Card",
    });

    const preview = createPatchPreview(result.plan, source);
    expect(preview.diagnostics).toEqual([]);
    expect(preview.after).toContain('<article className="card" data-afrodite-id="ui.card.primary">');
    expect(preview.after).toContain('<button type="button">Open</button>');
  });

  it("accepts an already installed matching marker without creating a write", () => {
    const marked = {
      ...source,
      version: "source-v2",
      content: source.content.replace(
        '<article className="card">',
        '<article className="card" data-afrodite-id="ui.card.primary">',
      ),
    };
    const discovery = adapter.discoverCandidates(
      { repositoryPath: marked.repositoryPath },
      marked,
    );
    const result = adapter.planStableMarker(
      {
        nodeId: "node.card",
        repositoryPath: marked.repositoryPath,
        candidateId: discovery.candidates[0]!.candidateId,
        stableMarker: "ui.card.primary",
        expectedSourceVersion: marked.version,
      },
      marked,
    );

    expect(result.sourceWriteRequired).toBe(false);
    expect(result.plan.edits).toEqual([]);
    expect(result.plan.diagnostics.some((diagnostic) => diagnostic.code === "STABLE_MARKER_ALREADY_INSTALLED")).toBe(true);
  });

  it("rejects dynamic marker ownership and stale source versions", () => {
    const dynamic = {
      ...source,
      content: source.content.replace(
        '<article className="card">',
        '<article className="card" data-afrodite-id={marker}>',
      ),
    };
    const discovery = adapter.discoverCandidates(
      { repositoryPath: dynamic.repositoryPath },
      dynamic,
    );
    const result = adapter.planStableMarker(
      {
        nodeId: "node.card",
        repositoryPath: dynamic.repositoryPath,
        candidateId: discovery.candidates[0]!.candidateId,
        stableMarker: "ui.card.primary",
        expectedSourceVersion: "stale",
      },
      dynamic,
    );

    expect(result.plan.diagnostics.some((diagnostic) => diagnostic.code === "BINDING_SOURCE_VERSION_MISMATCH")).toBe(true);
    expect(result.plan.diagnostics.some((diagnostic) => diagnostic.code === "BINDING_CANDIDATE_NOT_PATCHABLE")).toBe(true);
  });

  it("registers adapters without framework-specific branching", () => {
    const registry = new SourceBindingAdapterRegistry();
    registry.register(adapter);
    expect(registry.get("afrodite.adapter.react")).toBe(adapter);
    expect(registry.list()).toHaveLength(1);
  });
});
