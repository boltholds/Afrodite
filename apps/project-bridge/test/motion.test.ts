import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { BridgeMotionOperation } from "@afrodite/protocol";
import { MotionBridgeService } from "../src/motion.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("project bridge motion planning", () => {
  it("returns an exact CSS keyframe diff without writing the stylesheet", async () => {
    const root = await fixture();
    const service = new MotionBridgeService({ projectRoot: root });
    const plan = await service.planMotionPatch(operation());

    expect(plan.changed).toBe(true);
    expect(plan.repositoryPath).toBe("src/Card.module.css");
    expect(plan.diff).toContain("@keyframes afrodite-node-card-fade");
    expect(plan.diff).toContain(".card:hover");
    expect(plan.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
  });

  it("does not store blocked runtime trigger plans", async () => {
    const root = await fixture();
    const service = new MotionBridgeService({ projectRoot: root });
    const base = operation();
    const input: BridgeMotionOperation = {
      ...base,
      after: base.after.map((clip, index) => index === 0
        ? { ...clip, trigger: { type: "click" as const } }
        : clip),
    };
    const plan = await service.planMotionPatch(input);

    expect(plan.changed).toBe(false);
    expect(plan.diagnostics.some((item) => item.code === "MOTION_TRIGGER_NOT_PATCHABLE")).toBe(true);
    await expect(service.applyMotionPatch(plan.planId, plan.sourceVersion)).rejects.toMatchObject({
      code: "MOTION_PLAN_NOT_FOUND",
    });
  });
});

function operation(): BridgeMotionOperation {
  return {
    kind: "update-motion",
    nodeId: "node.card",
    binding: {
      frameworkId: "react",
      repositoryPath: "src/Card.tsx",
      stableMarker: "card.primary",
      styleOwnership: {
        strategy: "css-module",
        managedProperties: ["display"],
        stylesheetPath: "src/Card.module.css",
        className: "card",
      },
    },
    ownership: {
      strategy: "css-keyframes",
      stylesheetPath: "src/Card.module.css",
      className: "card",
      managedClipIds: ["fade"],
    },
    before: [],
    after: [{
      id: "fade",
      name: "Fade",
      enabled: true,
      priority: 0,
      blend: "replace",
      trigger: { type: "hover" },
      timeline: {
        durationMs: 200,
        delayMs: 0,
        easing: "ease-out",
        iterations: 1,
        direction: "normal",
        fill: "both",
      },
      tracks: [{
        id: "opacity",
        property: "opacity",
        keyframes: [{ offset: 0, value: 0 }, { offset: 1, value: 1 }],
      }],
    }],
  };
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "afrodite-motion-"));
  roots.push(root);
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "src", "Card.module.css"), ".card { color: white; }\n", "utf8");
  return root;
}
