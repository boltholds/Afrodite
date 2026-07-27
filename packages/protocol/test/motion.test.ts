import { describe, expect, it } from "vitest";
import {
  bridgeMotionOperationSchema,
  motionOwnershipSchema,
} from "../src/index";

const clip = {
  id: "fade",
  name: "Fade",
  enabled: true,
  priority: 0,
  blend: "replace" as const,
  trigger: { type: "hover" as const },
  timeline: {
    durationMs: 200,
    delayMs: 0,
    easing: "ease-out" as const,
    iterations: 1,
    direction: "normal" as const,
    fill: "both" as const,
  },
  tracks: [{
    id: "opacity",
    property: "opacity" as const,
    keyframes: [{ offset: 0, value: 0 }, { offset: 1, value: 1 }],
  }],
};

const binding = {
  frameworkId: "react",
  repositoryPath: "src/Card.tsx",
  stableMarker: "card.primary",
  styleOwnership: {
    strategy: "css-module" as const,
    managedProperties: ["display" as const],
    stylesheetPath: "src/Card.module.css",
    className: "card",
  },
};

describe("motion bridge protocol", () => {
  it("parses a bounded CSS keyframe operation", () => {
    const operation = bridgeMotionOperationSchema.parse({
      kind: "update-motion",
      nodeId: "node.card",
      binding,
      ownership: {
        strategy: "css-keyframes",
        stylesheetPath: "src/Card.module.css",
        className: "card",
        managedClipIds: ["fade"],
      },
      before: [],
      after: [clip],
    });
    expect(operation.ownership.managedClipIds).toEqual(["fade"]);
  });

  it("rejects duplicate managed clip IDs", () => {
    const result = motionOwnershipSchema.safeParse({
      strategy: "css-keyframes",
      stylesheetPath: "src/Card.module.css",
      className: "card",
      managedClipIds: ["fade", "fade"],
    });
    expect(result.success).toBe(false);
  });

  it("does not accept browser-authored CSS or source offsets", () => {
    const result = bridgeMotionOperationSchema.safeParse({
      kind: "update-motion",
      nodeId: "node.card",
      binding,
      ownership: {
        strategy: "css-keyframes",
        stylesheetPath: "src/Card.module.css",
        className: "card",
        managedClipIds: ["fade"],
      },
      before: [],
      after: [clip],
      css: "body { display: none; }",
      edits: [{ start: 0, end: 1, replacement: "x" }],
    });
    expect(result.success).toBe(true);
    expect("css" in result.data).toBe(false);
    expect("edits" in result.data).toBe(false);
  });
});
