import { describe, expect, it } from "vitest";
import { createPatchPreview, type SourceSnapshot } from "@afrodite/framework-core";
import type { VariantPatchOperation } from "../src/index.js";
import {
  createDefaultVariantStrategyRegistry,
  resolveEffectiveLayout,
} from "../src/index.js";

const beforeVariants = { responsive: [], states: [] };
const afterVariants = {
  responsive: [
    { id: "tablet", minWidth: 768, layout: { direction: "row" as const, gap: 16 } },
  ],
  states: [
    { id: "hovered", state: "hover" as const, layout: { gap: 20 } },
    { id: "loading", state: "loading" as const, layout: { display: "grid" as const } },
  ],
};

const baseLayout = {
  display: "flex" as const,
  direction: "column" as const,
  gap: 8,
  padding: 4,
  sizing: { width: "fill" as const, height: "hug" as const },
};

describe("variant materialization", () => {
  it("resolves responsive overrides before deterministic state priority", () => {
    const resolved = resolveEffectiveLayout(baseLayout, afterVariants, {
      viewportWidth: 900,
      activeStates: ["hover", "loading"],
    });
    expect(resolved.direction).toBe("row");
    expect(resolved.gap).toBe(20);
    expect(resolved.display).toBe("grid");
  });

  it("writes owned Tailwind responsive and state classes while preserving unrelated classes", () => {
    const source = snapshot(
      "src/Card.tsx",
      `export const Card = () => <section data-afrodite-id="card.primary" className="rounded-xl text-white" />;`,
    );
    const operation = utilityOperation(source.repositoryPath);
    const strategy = createDefaultVariantStrategyRegistry().resolve(operation)!;
    const preview = createPatchPreview(strategy.plan(operation, source), source);

    expect(preview.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
    expect(preview.after).toContain("rounded-xl text-white");
    expect(preview.after).toContain("min-[768px]:flex-row");
    expect(preview.after).toContain("min-[768px]:gap-[16px]");
    expect(preview.after).toContain("hover:gap-[20px]");
    expect(preview.after).toContain("data-[state=loading]:grid");
  });

  it("creates one replaceable generated CSS Module region", () => {
    const source = snapshot("src/Card.module.css", `.card {\n  color: hotpink;\n}\n`);
    const operation: VariantPatchOperation = {
      kind: "update-variants",
      nodeId: "node.card",
      binding: {
        frameworkId: "react",
        adapterId: "afrodite.adapter.react",
        repositoryPath: "src/Card.tsx",
        stableMarker: "card.primary",
        styleOwnership: {
          strategy: "css-module",
          stylesheetPath: source.repositoryPath,
          className: "card",
          managedProperties: ["display", "direction", "gap"],
        },
      },
      ownership: {
        strategy: "css-module",
        stylesheetPath: source.repositoryPath,
        className: "card",
        managedProperties: ["display", "direction", "gap"],
      },
      before: beforeVariants,
      after: afterVariants,
    };
    const strategy = createDefaultVariantStrategyRegistry().resolve(operation)!;
    const preview = createPatchPreview(strategy.plan(operation, source), source);

    expect(preview.after).toContain("/* afrodite-variants:card:start */");
    expect(preview.after).toContain("@media (min-width: 768px)");
    expect(preview.after).toContain(".card:hover");
    expect(preview.after).toContain('.card[data-state="loading"]');
    expect(preview.after).toContain("color: hotpink");
  });

  it("rejects variant properties outside explicit ownership", () => {
    const source = snapshot("src/Card.tsx", `<section data-afrodite-id="card.primary" className="card" />`);
    const operation = {
      ...utilityOperation(source.repositoryPath),
      ownership: {
        strategy: "utility" as const,
        dialect: "tailwind" as const,
        managedProperties: ["display" as const],
      },
      binding: {
        ...utilityOperation(source.repositoryPath).binding,
        styleOwnership: {
          strategy: "utility" as const,
          dialect: "tailwind" as const,
          managedProperties: ["display" as const],
        },
      },
    };
    const plan = createDefaultVariantStrategyRegistry().resolve(operation)!.plan(operation, source);
    expect(plan.diagnostics.some((item) => item.code === "VARIANT_PROPERTY_NOT_OWNED")).toBe(true);
  });

  it("keeps static inline and unscoped token variants read-only", () => {
    for (const strategy of ["inline", "design-token"] as const) {
      const source = snapshot(strategy === "inline" ? "src/Card.tsx" : "src/tokens.css", "");
      const ownership = strategy === "inline"
        ? { strategy, managedProperties: ["display" as const] }
        : {
            strategy,
            tokenFilePath: source.repositoryPath,
            managedProperties: ["display" as const],
            tokens: { display: "--card-display" },
          };
      const operation: VariantPatchOperation = {
        kind: "update-variants",
        nodeId: "node.card",
        binding: {
          frameworkId: "react",
          adapterId: "afrodite.adapter.react",
          repositoryPath: "src/Card.tsx",
          stableMarker: "card.primary",
          styleOwnership: ownership,
        },
        ownership,
        before: beforeVariants,
        after: afterVariants,
      };
      const plan = createDefaultVariantStrategyRegistry().resolve(operation)!.plan(operation, source);
      expect(plan.diagnostics.some((item) => item.severity === "error")).toBe(true);
    }
  });
});

function utilityOperation(repositoryPath: string): VariantPatchOperation {
  const ownership = {
    strategy: "utility" as const,
    dialect: "tailwind" as const,
    attribute: "className" as const,
    managedProperties: ["display", "direction", "gap"] as const,
  };
  return {
    kind: "update-variants",
    nodeId: "node.card",
    binding: {
      frameworkId: "react",
      adapterId: "afrodite.adapter.react",
      repositoryPath,
      stableMarker: "card.primary",
      styleOwnership: ownership,
    },
    ownership,
    before: beforeVariants,
    after: afterVariants,
  };
}

function snapshot(repositoryPath: string, content: string): SourceSnapshot {
  return { repositoryPath, content };
}
