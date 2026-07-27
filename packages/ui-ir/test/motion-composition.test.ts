import { describe, expect, it } from "vitest";
import {
  animationClipSchema,
  animationClipsSchema,
  parseUiDocument,
} from "../src/index";

const baseClip = {
  id: "fade",
  name: "Fade",
  enabled: true,
  trigger: { type: "manual" as const },
  timeline: {
    durationMs: 300,
    delayMs: 0,
    easing: "linear" as const,
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

describe("motion composition schema", () => {
  it("adds backward-compatible priority and blend defaults", () => {
    const clip = animationClipSchema.parse(baseClip);
    expect(clip.priority).toBe(0);
    expect(clip.blend).toBe("replace");
  });

  it("rejects non-replace color composition", () => {
    const result = animationClipSchema.safeParse({
      ...baseClip,
      blend: "add",
      tracks: [{
        id: "color",
        property: "backgroundColor",
        keyframes: [{ offset: 0, value: "#000" }, { offset: 1, value: "#fff" }],
      }],
    });
    expect(result.success).toBe(false);
  });

  it("round-trips several clips on one node", () => {
    const clips = animationClipsSchema.parse([
      baseClip,
      {
        ...baseClip,
        id: "slide",
        name: "Slide",
        priority: 5,
        blend: "add",
        tracks: [{
          id: "y",
          property: "transform.y",
          keyframes: [{ offset: 0, value: 24 }, { offset: 1, value: 0 }],
        }],
      },
    ]);
    const document = parseUiDocument({
      schemaVersion: 1,
      id: "doc.motion-composition",
      name: "Motion composition",
      root: {
        id: "node.card",
        kind: "element",
        element: "section",
        name: "Card",
        layout: { display: "block", direction: "column", sizing: { width: "hug", height: "hug" } },
        animations: clips,
        props: {},
        children: [],
      },
    });
    expect(document.root.animations).toEqual(clips);
  });
});
