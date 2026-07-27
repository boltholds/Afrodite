import { describe, expect, it } from "vitest";
import {
  animationClipSchema,
  decodeUiDocument,
  parseUiDocument,
  serializeUiDocument,
} from "../src/index";

const clip = {
  id: "button-hover",
  name: "Button hover",
  enabled: true,
  trigger: { type: "hover" as const },
  timeline: {
    durationMs: 180,
    delayMs: 0,
    easing: "ease-out" as const,
    iterations: 1,
    direction: "normal" as const,
    fill: "both" as const,
  },
  tracks: [
    {
      id: "scale",
      property: "transform.scale" as const,
      keyframes: [
        { offset: 0, value: 1 },
        { offset: 1, value: 1.04 },
      ],
    },
    {
      id: "surface",
      property: "backgroundColor" as const,
      keyframes: [
        { offset: 0, value: "#111111" },
        { offset: 1, value: "#ff33bb" },
      ],
    },
  ],
};

describe("semantic motion UI IR", () => {
  it("round-trips animation clips through document JSON", () => {
    const document = parseUiDocument({
      schemaVersion: 1,
      id: "document.motion",
      name: "Motion",
      root: {
        id: "node.root",
        kind: "element",
        element: "button",
        name: "Button",
        layout: {
          display: "block",
          direction: "column",
          sizing: { width: 120, height: 40 },
        },
        animations: [clip],
        props: { label: "Save" },
        children: [],
      },
    });

    const decoded = decodeUiDocument(serializeUiDocument(document));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.document.root.animations?.[0]?.id).toBe("button-hover");
    expect(decoded.document.root.animations?.[0]?.tracks).toHaveLength(2);
  });

  it("rejects unsorted keyframes and incorrect value types", () => {
    expect(() => animationClipSchema.parse({
      ...clip,
      tracks: [{
        id: "opacity",
        property: "opacity",
        keyframes: [
          { offset: 0, value: 0 },
          { offset: 0.8, value: 1 },
          { offset: 0.6, value: "wrong" },
          { offset: 1, value: 1 },
        ],
      }],
    })).toThrow();
  });

  it("rejects duplicate track properties", () => {
    expect(() => animationClipSchema.parse({
      ...clip,
      tracks: [
        clip.tracks[0],
        { ...clip.tracks[0], id: "scale-duplicate" },
      ],
    })).toThrow(/one track per property/i);
  });
});
