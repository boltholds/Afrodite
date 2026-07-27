import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { SemanticOperationCommand } from "@afrodite/protocol";
import type { UiDocument } from "@afrodite/ui-ir";
import { planProjectSemanticOperation } from "../src/semantic.js";
import { ProjectBridgeService } from "../src/service.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("project-aware semantic operations", () => {
  it("turns convert_to_grid into a UI IR mutation and exact source plan", async () => {
    const service = new ProjectBridgeService({ projectRoot: await fixture() });
    const plan = await planProjectSemanticOperation(service, document(), {
      type: "convert_to_grid",
      nodeId: "node.card",
      gap: 16,
    });

    expect(plan.status).toBe("ready");
    expect(plan.applicationMode).toBe("document-and-source");
    expect(plan.documentAfter?.root.layout.display).toBe("grid");
    expect(plan.sourcePlans).toHaveLength(1);
    expect(plan.sourcePlans[0]?.diff).toContain("grid");
    expect(plan.sourcePlans[0]?.diff).toContain("gap-[16px]");
  });

  it("creates a responsive variant through the existing variant adapter", async () => {
    const service = new ProjectBridgeService({ projectRoot: await fixture() });
    const command: SemanticOperationCommand = {
      type: "create_responsive_variant",
      nodeId: "node.card",
      variantId: "tablet",
      minWidth: 768,
      layout: { direction: "row", gap: 20 },
    };
    const plan = await planProjectSemanticOperation(service, document(), command);

    expect(plan.status).toBe("ready");
    expect(plan.sourcePlans[0]?.diff).toContain("min-[768px]:flex-row");
    expect(plan.sourcePlans[0]?.diff).toContain("min-[768px]:gap-[20px]");
  });

  it("returns explanations without creating source plans", async () => {
    const service = new ProjectBridgeService({ projectRoot: await fixture() });
    const input = document();
    input.root.sourceBinding = undefined;
    const plan = await planProjectSemanticOperation(service, input, {
      type: "explain_unpatchable_region",
      nodeId: "node.card",
    });

    expect(plan.status).toBe("informational");
    expect(plan.sourcePlans).toEqual([]);
    expect(plan.explanation?.nextActions.join(" ")).toContain("Binding Manager");
  });
});

function document(): UiDocument {
  return {
    schemaVersion: 1,
    id: "doc.semantic",
    name: "Semantic",
    root: {
      id: "node.card",
      kind: "element",
      element: "section",
      name: "Card",
      layout: {
        display: "flex",
        direction: "column",
        gap: 8,
        padding: 12,
        sizing: { width: "fill", height: "hug" },
      },
      variants: { responsive: [], states: [] },
      props: {},
      sourceBinding: {
        frameworkId: "react",
        adapterId: "afrodite.adapter.react",
        repositoryPath: "src/Card.tsx",
        stableMarker: "card.primary",
        styleOwnership: {
          strategy: "utility",
          dialect: "tailwind",
          attribute: "className",
          managedProperties: ["display", "direction", "gap", "padding"],
        },
      },
      children: [],
    },
  };
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "afrodite-semantic-"));
  roots.push(root);
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(
    path.join(root, "src/Card.tsx"),
    `export const Card = () => <section data-afrodite-id="card.primary" className="flex flex-col gap-[8px] p-[12px]" />;\n`,
    "utf8",
  );
  return root;
}
