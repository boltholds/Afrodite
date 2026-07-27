import { describe, expect, it } from "vitest";
import { createPatchPreview, type SourceSnapshot } from "@afrodite/framework-core";
import { animationClipsSchema, type SourceBinding } from "@afrodite/ui-ir";
import {
  createCssKeyframesMotionStrategy,
  type MotionPatchOperation,
} from "../src/index";

const source: SourceSnapshot = {
  repositoryPath: "src/Card.module.css",
  content: ".card { color: white; }\n",
  version: "sha256:before",
};

const binding: SourceBinding = {
  frameworkId: "react",
  repositoryPath: "src/Card.tsx",
  stableMarker: "card.primary",
  styleOwnership: {
    strategy: "css-module",
    stylesheetPath: "src/Card.module.css",
    className: "card",
    managedProperties: ["display"],
  },
};

function clips() {
  return animationClipsSchema.parse([
    {
      id: "fade",
      name: "Fade",
      enabled: true,
      priority: 0,
      blend: "replace",
      trigger: { type: "hover" },
      timeline: { durationMs: 200, delayMs: 0, easing: "ease-out", iterations: 1, direction: "normal", fill: "both" },
      tracks: [{ id: "opacity", property: "opacity", keyframes: [{ offset: 0, value: 0.5 }, { offset: 1, value: 1 }] }],
    },
    {
      id: "slide",
      name: "Slide",
      enabled: true,
      priority: 10,
      blend: "replace",
      trigger: { type: "hover" },
      timeline: { durationMs: 300, delayMs: 0, easing: "ease-out", iterations: 1, direction: "normal", fill: "both" },
      tracks: [{ id: "y", property: "transform.y", keyframes: [{ offset: 0, value: 12 }, { offset: 1, value: 0 }] }],
    },
  ]);
}

function operation(after = clips()): MotionPatchOperation {
  return {
    kind: "update-motion",
    nodeId: "node.card",
    binding,
    ownership: {
      strategy: "css-keyframes",
      stylesheetPath: "src/Card.module.css",
      className: "card",
      managedClipIds: after.map((clip) => clip.id),
    },
    before: [],
    after,
  };
}

describe("CSS keyframe motion strategy", () => {
  it("materializes several non-conflicting clips on one selector", () => {
    const plan = createCssKeyframesMotionStrategy().plan(operation(), source);
    const preview = createPatchPreview(plan, source);

    expect(preview.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
    expect(preview.after).toContain("@keyframes afrodite-node-card-fade");
    expect(preview.after).toContain("@keyframes afrodite-node-card-slide");
    expect(preview.after).toContain(".card:hover");
    expect(preview.after).toContain("animation-name: afrodite-node-card-fade, afrodite-node-card-slide");
    expect(preview.after).toContain("opacity:");
    expect(preview.after).toContain("transform:");
  });

  it("rejects additive source composition", () => {
    const after = clips().map((clip, index) => index === 0 ? { ...clip, blend: "add" as const } : clip);
    const plan = createCssKeyframesMotionStrategy().plan(operation(after), source);
    expect(plan.diagnostics.some((item) => item.code === "MOTION_BLEND_NOT_PATCHABLE")).toBe(true);
  });

  it("rejects manual and click triggers", () => {
    const after = clips().map((clip, index) => index === 0 ? { ...clip, trigger: { type: "manual" as const } } : clip);
    const plan = createCssKeyframesMotionStrategy().plan(operation(after), source);
    expect(plan.diagnostics.some((item) => item.code === "MOTION_TRIGGER_NOT_PATCHABLE")).toBe(true);
  });

  it("rejects overlapping transform channels", () => {
    const after = clips();
    const conflict = animationClipsSchema.parse([
      ...after,
      {
        id: "scale",
        name: "Scale",
        enabled: true,
        priority: 20,
        blend: "replace",
        trigger: { type: "hover" },
        timeline: { durationMs: 200, delayMs: 0, easing: "linear", iterations: 1, direction: "normal", fill: "both" },
        tracks: [{ id: "scale-track", property: "transform.scale", keyframes: [{ offset: 0, value: 1 }, { offset: 1, value: 1.1 }] }],
      },
    ]);
    const plan = createCssKeyframesMotionStrategy().plan(operation(conflict), source);
    expect(plan.diagnostics.some((item) => item.code === "MOTION_CSS_CHANNEL_CONFLICT")).toBe(true);
  });
});
