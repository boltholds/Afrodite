import { describe, expect, it } from "vitest";
import { applyTextEdits, createPatchPreview, type SourceSnapshot } from "@afrodite/framework-core";
import {
  createCssModuleStyleStrategy,
  createDefaultStyleStrategyRegistry,
  createDesignTokenStyleStrategy,
  createJsxInlineStyleStrategy,
  createTailwindUtilityStrategy,
  type StylePatchOperation,
} from "../src/index.js";

const before = {
  display: "block" as const,
  direction: "column" as const,
  gap: 0,
  padding: 8,
  sizing: { width: "hug" as const, height: "hug" as const },
};

const after = {
  display: "flex" as const,
  direction: "row" as const,
  gap: 16,
  padding: 12,
  sizing: { width: "fill" as const, height: 240 },
};

describe("style ownership strategies", () => {
  it("updates only explicitly owned React inline properties", () => {
    const source = snapshot(
      "src/Card.tsx",
      `export function Card({ padding }: { padding: string }) {
  return <section data-afrodite-id="card.primary" style={{ color: "pink", display: "block", padding }} />;
}
`,
    );
    const strategy = createJsxInlineStyleStrategy({
      frameworkId: "react",
      frameworkAdapterId: "afrodite.adapter.react",
      keyMode: "react",
    });
    const plan = strategy.plan(operation({
      strategy: "inline",
      managedProperties: ["display", "direction", "gap"],
    }), source);
    const preview = createPatchPreview(plan, source);

    expect(preview.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
    expect(preview.after).toContain('color: "pink"');
    expect(preview.after).toContain("padding");
    expect(preview.after).toContain('display: "flex"');
    expect(preview.after).toContain('flexDirection: "row"');
    expect(preview.after).toContain('gap: "16px"');
  });

  it("refuses dynamic values for properties Afrodite claims", () => {
    const source = snapshot(
      "src/Card.tsx",
      `export const Card = ({ display }: { display: string }) => <section data-afrodite-id="card.primary" style={{ display }} />;`,
    );
    const strategy = createJsxInlineStyleStrategy({
      frameworkId: "react",
      frameworkAdapterId: "afrodite.adapter.react",
      keyMode: "react",
    });
    const plan = strategy.plan(operation({ strategy: "inline", managedProperties: ["display"] }), source);
    expect(plan.diagnostics.some((item) => item.code === "DYNAMIC_OWNED_STYLE_NOT_PATCHABLE")).toBe(true);
  });

  it("replaces only owned Tailwind utility groups", () => {
    const source = snapshot(
      "src/Card.tsx",
      `export const Card = () => <section data-afrodite-id="card.primary" className="grid gap-2 rounded-xl text-white" />;`,
    );
    const strategy = createTailwindUtilityStrategy({
      frameworkId: "react",
      frameworkAdapterId: "afrodite.adapter.react",
    });
    const plan = strategy.plan(operation({
      strategy: "utility",
      dialect: "tailwind",
      managedProperties: ["display", "gap", "width"],
    }), source);
    const next = applyTextEdits(source.content, plan.edits);

    expect(next).toContain('className="rounded-xl text-white flex gap-[16px] w-full"');
  });

  it("updates an explicit CSS Module rule without touching unrelated declarations", () => {
    const source = snapshot("src/Card.module.css", `.card {\n  color: hotpink;\n  display: block;\n  gap: 4px;\n}\n`);
    const strategy = createCssModuleStyleStrategy();
    const plan = strategy.plan(operation({
      strategy: "css-module",
      stylesheetPath: "src/Card.module.css",
      className: "card",
      managedProperties: ["display", "gap", "padding"],
    }), source);
    const next = applyTextEdits(source.content, plan.edits);

    expect(next).toContain("color: hotpink;");
    expect(next).toContain("display: flex;");
    expect(next).toContain("gap: 16px;");
    expect(next).toContain("padding: 12px;");
  });

  it("updates existing design tokens but never invents a declaration scope", () => {
    const source = snapshot("src/tokens.css", `:root {\n  --card-gap: 4px;\n  --card-padding: 8px;\n}\n`);
    const strategy = createDesignTokenStyleStrategy();
    const plan = strategy.plan(operation({
      strategy: "design-token",
      tokenFilePath: "src/tokens.css",
      managedProperties: ["gap", "padding"],
      tokens: { gap: "--card-gap", padding: "--card-padding" },
    }), source);
    const next = applyTextEdits(source.content, plan.edits);

    expect(next).toContain("--card-gap: 16px;");
    expect(next).toContain("--card-padding: 12px;");
  });

  it("resolves strategies without framework branches in callers", () => {
    const registry = createDefaultStyleStrategyRegistry();
    expect(registry.resolve(operation({ strategy: "inline", managedProperties: ["display"] }))?.id)
      .toBe("afrodite.style.inline.react");
    expect(registry.resolve(operation({
      strategy: "css-module",
      stylesheetPath: "src/Card.module.css",
      className: "card",
      managedProperties: ["display"],
    }))?.id).toBe("afrodite.style.css-module");
  });
});

function operation(ownership: StylePatchOperation["ownership"]): StylePatchOperation {
  return {
    kind: "update-style",
    nodeId: "node.card",
    binding: {
      frameworkId: "react",
      adapterId: "afrodite.adapter.react",
      repositoryPath: "src/Card.tsx",
      stableMarker: "card.primary",
      styleOwnership: ownership,
    },
    ownership,
    before,
    after,
  };
}

function snapshot(repositoryPath: string, content: string): SourceSnapshot {
  return { repositoryPath, content };
}
