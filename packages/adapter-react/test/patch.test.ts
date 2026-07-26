import { describe, expect, it } from "vitest";
import {
  applyTextEdits,
  createPatchPreview,
  type FrameworkOperation,
} from "@afrodite/framework-core";
import {
  createReactFrameworkAdapter,
  planReactLayoutPatch,
  reactFrameworkDescriptor,
} from "../src/index.js";

const beforeLayout = {
  display: "block" as const,
  direction: "column" as const,
  gap: 0,
  padding: 0,
  sizing: { width: "hug" as const, height: "hug" as const },
};

const afterLayout = {
  display: "flex" as const,
  direction: "row" as const,
  gap: 16,
  padding: 12,
  sizing: { width: "fill" as const, height: 240 },
};

function operation(marker = "card.primary"): FrameworkOperation {
  return {
    kind: "update-layout",
    nodeId: "node.card",
    binding: {
      frameworkId: "react",
      adapterId: "afrodite.adapter.react",
      repositoryPath: "src/Card.tsx",
      stableMarker: marker,
    },
    before: beforeLayout,
    after: afterLayout,
  };
}

describe("planReactLayoutPatch", () => {
  it("rewrites only the static style object and preserves hooks and behavior", () => {
    const source = {
      repositoryPath: "src/Card.tsx",
      content: `import { useMemo } from "react";

export function Card(props: { onOpen: () => void; theme: { color: string } }) {
  const label = useMemo(() => "Content", []);
  return (
    <section
      data-afrodite-id="card.primary"
      className="card"
      aria-label={label}
      style={{ color: props.theme.color, display: "block", width: "fit-content" }}
      onClick={() => props.onOpen()}
    >
      {label}
    </section>
  );
}
`,
    };

    const plan = planReactLayoutPatch(operation(), source);
    const preview = createPatchPreview(plan, source);

    expect(plan.edits).toHaveLength(1);
    expect(preview.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
    expect(preview.after).toContain('const label = useMemo(() => "Content", [])');
    expect(preview.after).toContain('onClick={() => props.onOpen()}');
    expect(preview.after).toContain("color: props.theme.color");
    expect(preview.after).toContain('display: "flex"');
    expect(preview.after).toContain('flexDirection: "row"');
    expect(preview.after).toContain('gap: "16px"');
    expect(preview.after).toContain('padding: "12px"');
    expect(preview.after).toContain('width: "100%"');
    expect(preview.after).toContain('height: "240px"');
    expect(applyTextEdits(source.content, plan.edits)).toBe(preview.after);
  });

  it("adds an inline React style object when the marked element has none", () => {
    const source = {
      repositoryPath: "src/Card.tsx",
      content: '<button data-afrodite-id="card.primary" onClick={open}>Card</button>\n',
    };

    const preview = createPatchPreview(planReactLayoutPatch(operation(), source), source);

    expect(preview.after).toContain('onClick={open} style={{ display: "flex", flexDirection: "row"');
  });

  it("refuses dynamic managed values while preserving unrelated expressions", () => {
    const source = {
      repositoryPath: "src/Card.tsx",
      content: '<div data-afrodite-id="card.primary" style={{ color: theme.color, display: compact ? "block" : "flex" }}>Card</div>\n',
    };

    const plan = planReactLayoutPatch(operation(), source);

    expect(plan.edits).toEqual([]);
    expect(plan.diagnostics.some((item) => item.code === "DYNAMIC_MANAGED_STYLE_NOT_PATCHABLE")).toBe(true);
  });

  it("refuses style variables, spreads, duplicate markers, and server modules", () => {
    const dynamicPlan = planReactLayoutPatch(operation(), {
      repositoryPath: "src/Card.tsx",
      content: '<div data-afrodite-id="card.primary" style={cardStyle}>Card</div>\n',
    });
    const spreadPlan = planReactLayoutPatch(operation(), {
      repositoryPath: "src/Card.tsx",
      content: '<div data-afrodite-id="card.primary" style={{ ...baseStyle, color: "red" }}>Card</div>\n',
    });
    const duplicatePlan = planReactLayoutPatch(operation(), {
      repositoryPath: "src/Card.tsx",
      content: '<><div data-afrodite-id="card.primary" /><div data-afrodite-id="card.primary" /></>\n',
    });
    const serverPlan = planReactLayoutPatch(operation(), {
      repositoryPath: "src/Card.tsx",
      content: '"use server";\nexport function Card() { return <div data-afrodite-id="card.primary" />; }\n',
    });

    expect(dynamicPlan.diagnostics.some((item) => item.code === "DYNAMIC_STYLE_NOT_PATCHABLE")).toBe(true);
    expect(spreadPlan.diagnostics.some((item) => item.code === "STYLE_SPREAD_NOT_PATCHABLE")).toBe(true);
    expect(duplicatePlan.diagnostics.some((item) => item.code === "AMBIGUOUS_STABLE_MARKER")).toBe(true);
    expect(serverPlan.diagnostics.some((item) => item.code === "SERVER_MODULE_NOT_PATCHABLE")).toBe(true);
  });

  it("exposes patch planning through the registered React adapter", () => {
    const adapter = createReactFrameworkAdapter();

    expect(reactFrameworkDescriptor.capabilities.sourcePatching).toBe(true);
    expect(adapter.planPatch).toBe(planReactLayoutPatch);
  });
});
