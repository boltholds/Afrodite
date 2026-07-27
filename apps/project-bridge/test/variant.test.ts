import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  BridgeTransactionOperation,
  BridgeVariantOperation,
} from "@afrodite/protocol";
import { ProjectBridgeService } from "../src/service.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("ProjectBridgeService variants", () => {
  it("plans Tailwind responsive and state classes from semantic variants", async () => {
    const root = await fixture();
    const service = new ProjectBridgeService({ projectRoot: root });
    const plan = await service.planVariantPatch(utilityVariantOperation());

    expect(plan.changed).toBe(true);
    expect(plan.repositoryPath).toBe("src/Card.tsx");
    expect(plan.diff).toContain("min-[768px]:flex-row");
    expect(plan.diff).toContain("hover:gap-[20px]");
  });

  it("includes variant materialization inside an atomic multi-file transaction", async () => {
    const root = await fixture();
    const service = new ProjectBridgeService({ projectRoot: root });
    const cssOperation: BridgeVariantOperation = {
      kind: "update-variants",
      nodeId: "node.panel",
      binding: {
        frameworkId: "react",
        adapterId: "afrodite.adapter.react",
        repositoryPath: "src/Panel.tsx",
        stableMarker: "panel.primary",
        styleOwnership: {
          strategy: "css-module",
          stylesheetPath: "src/Panel.module.css",
          className: "panel",
          managedProperties: ["display", "gap"],
        },
      },
      ownership: {
        strategy: "css-module",
        stylesheetPath: "src/Panel.module.css",
        className: "panel",
        managedProperties: ["display", "gap"],
      },
      before: { responsive: [], states: [] },
      after: {
        responsive: [{ id: "desktop", minWidth: 1024, layout: { display: "grid", gap: 24 } }],
        states: [{ id: "error", state: "error", layout: { gap: 32 } }],
      },
    };
    const operations: BridgeTransactionOperation[] = [
      { type: "variant", operation: utilityVariantOperation() },
      { type: "variant", operation: cssOperation },
    ];
    const transaction = await service.planTransaction(operations);

    expect(transaction.files.map((file) => file.repositoryPath)).toEqual([
      "src/Card.tsx",
      "src/Panel.module.css",
    ]);
    expect(transaction.changedFiles).toBe(2);
    expect(transaction.files[1]?.diff).toContain("afrodite-variants:panel:start");
  });
});

function utilityVariantOperation(): BridgeVariantOperation {
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
      repositoryPath: "src/Card.tsx",
      stableMarker: "card.primary",
      styleOwnership: ownership,
    },
    ownership,
    before: { responsive: [], states: [] },
    after: {
      responsive: [{ id: "tablet", minWidth: 768, layout: { direction: "row", gap: 16 } }],
      states: [{ id: "hover", state: "hover", layout: { gap: 20 } }],
    },
  };
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "afrodite-variants-"));
  roots.push(root);
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(
    path.join(root, "src/Card.tsx"),
    `export const Card = () => <section data-afrodite-id="card.primary" className="rounded-xl" />;\n`,
    "utf8",
  );
  await writeFile(
    path.join(root, "src/Panel.tsx"),
    `export const Panel = () => <section data-afrodite-id="panel.primary" />;\n`,
    "utf8",
  );
  await writeFile(
    path.join(root, "src/Panel.module.css"),
    `.panel {\n  color: hotpink;\n}\n`,
    "utf8",
  );
  return root;
}
