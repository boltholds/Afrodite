import { describe, expect, it } from "vitest";
import {
  applyTextEdits,
  createPatchPreview,
  type FrameworkOperation,
} from "@afrodite/framework-core";
import { planSolidLayoutPatch } from "../src/index.js";

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
      frameworkId: "solid",
      adapterId: "afrodite.adapter.solid",
      repositoryPath: "src/Card.tsx",
      stableMarker: marker,
    },
    before: beforeLayout,
    after: afterLayout,
  };
}

describe("planSolidLayoutPatch", () => {
  it("rewrites only the static style object and preserves behavior", () => {
    const source = {
      repositoryPath: "src/Card.tsx",
      content: `export function Card(props: { onOpen: () => void }) {
  return (
    <section
      data-afrodite-id="card.primary"
      class="card"
      style={{ color: "red", display: "block", width: "fit-content" }}
      onClick={() => props.onOpen()}
    >
      Content
    </section>
  );
}
`,
    };

    const plan = planSolidLayoutPatch(operation(), source);
    const preview = createPatchPreview(plan, source);

    expect(plan.edits).toHaveLength(1);
    expect(preview.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
    expect(preview.after).toContain('onClick={() => props.onOpen()}');
    expect(preview.after).toContain('color: "red"');
    expect(preview.after).toContain('display: "flex"');
    expect(preview.after).toContain('"flex-direction": "row"');
    expect(preview.after).toContain('gap: "16px"');
    expect(preview.after).toContain('padding: "12px"');
    expect(preview.after).toContain('width: "100%"');
    expect(preview.after).toContain('height: "240px"');
    expect(applyTextEdits(source.content, plan.edits)).toBe(preview.after);
  });

  it("adds a style object when the marked element has none", () => {
    const source = {
      repositoryPath: "src/Card.tsx",
      content: '<div data-afrodite-id="card.primary" onClick={open}>Card</div>\n',
    };

    const preview = createPatchPreview(planSolidLayoutPatch(operation(), source), source);

    expect(preview.after).toContain('onClick={open} style={{ display: "flex"');
  });

  it("refuses dynamic style expressions and missing markers", () => {
    const dynamicSource = {
      repositoryPath: "src/Card.tsx",
      content: '<div data-afrodite-id="card.primary" style={props.style}>Card</div>\n',
    };
    const missingSource = {
      repositoryPath: "src/Card.tsx",
      content: "<div>Card</div>\n",
    };

    const dynamicPlan = planSolidLayoutPatch(operation(), dynamicSource);
    const missingPlan = planSolidLayoutPatch(operation(), missingSource);

    expect(dynamicPlan.edits).toEqual([]);
    expect(dynamicPlan.diagnostics.some((item) => item.code === "DYNAMIC_STYLE_NOT_PATCHABLE")).toBe(true);
    expect(missingPlan.diagnostics.some((item) => item.code === "STABLE_MARKER_NOT_FOUND")).toBe(true);
  });
});
