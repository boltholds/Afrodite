import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { BridgeStyleOperation } from "@afrodite/protocol";
import type { VerificationRunner } from "@afrodite/verified-write";
import { ProjectBridgeService } from "../src/service.js";

const roots: string[] = [];
const successfulRunner: VerificationRunner = {
  async run(step) {
    return { step, ok: true, exitCode: 0, stdout: "ok", stderr: "" };
  },
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("ProjectBridgeService style ownership", () => {
  it("plans and applies a CSS Module style patch", async () => {
    const root = await fixture();
    const service = new ProjectBridgeService({ projectRoot: root, verificationRunner: successfulRunner });
    const ownership = {
      strategy: "css-module" as const,
      stylesheetPath: "src/Card.module.css",
      className: "card",
      managedProperties: ["display", "gap", "padding"] as const,
    };
    const operation: BridgeStyleOperation = {
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
      before: layout("block", 4, 8),
      after: layout("flex", 16, 12),
    };

    const plan = await service.planStylePatch(operation);
    expect(plan.changed).toBe(true);
    expect(plan.repositoryPath).toBe("src/Card.module.css");
    expect(plan.diff).toContain("+  display: flex;");

    const result = await service.applyPatch(plan.planId, plan.sourceVersion, "style-test");
    expect(result.status).toBe("applied");
    const css = await readFile(path.join(root, "src/Card.module.css"), "utf8");
    expect(css).toContain("gap: 16px;");
    expect(css).toContain("color: hotpink;");
  });

  it("rejects ownership supplied by the client when it differs from the binding", async () => {
    const root = await fixture();
    const service = new ProjectBridgeService({ projectRoot: root, verificationRunner: successfulRunner });
    const bindingOwnership = {
      strategy: "inline" as const,
      managedProperties: ["display"] as const,
    };
    const operationOwnership = {
      strategy: "utility" as const,
      dialect: "tailwind" as const,
      managedProperties: ["display"] as const,
    };
    const operation: BridgeStyleOperation = {
      kind: "update-style",
      nodeId: "node.card",
      binding: {
        frameworkId: "react",
        adapterId: "afrodite.adapter.react",
        repositoryPath: "src/Card.tsx",
        stableMarker: "card.primary",
        styleOwnership: bindingOwnership,
      },
      ownership: operationOwnership,
      before: layout("block", 0, 0),
      after: layout("flex", 0, 0),
    };

    await expect(service.planStylePatch(operation)).rejects.toMatchObject({ code: "STYLE_OWNERSHIP_MISMATCH" });
  });
});

function layout(display: "block" | "flex", gap: number, padding: number) {
  return {
    display,
    direction: "row" as const,
    gap,
    padding,
    sizing: { width: "fill" as const, height: "hug" as const },
  };
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "afrodite-style-"));
  roots.push(root);
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(
    path.join(root, "src/Card.tsx"),
    `export const Card = () => <section data-afrodite-id="card.primary" className="card" />;\n`,
    "utf8",
  );
  await writeFile(
    path.join(root, "src/Card.module.css"),
    `.card {\n  color: hotpink;\n  display: block;\n  gap: 4px;\n  padding: 8px;\n}\n`,
    "utf8",
  );
  return root;
}
