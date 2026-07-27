import { describe, expect, it } from "vitest";
import {
  createAnimationPreset,
  duplicateAnimationClip,
  resolveMotionComposition,
} from "../src/motion";

describe("composed motion playback", () => {
  it("combines several active clips on one object", () => {
    const fade = { ...createAnimationPreset("fade-in"), trigger: { type: "manual" as const } };
    const slide = { ...createAnimationPreset("slide-up"), trigger: { type: "manual" as const } };
    const pulse = { ...createAnimationPreset("pulse"), trigger: { type: "manual" as const }, priority: 10 };
    const style = resolveMotionComposition(
      [fade, slide, pulse],
      300,
      new Set([fade.id, slide.id, pulse.id]),
    );

    expect(style.opacity).toBeCloseTo(1);
    expect(style.translateY).toBeCloseTo(0);
    expect(style.scale).toBeCloseTo(1.06);
  });

  it("uses stable priority and ID order for replace conflicts", () => {
    const low = {
      ...createAnimationPreset("fade-in"),
      id: "low",
      priority: 0,
      tracks: [{
        id: "opacity",
        property: "opacity" as const,
        keyframes: [{ offset: 0, value: 0.2 }, { offset: 1, value: 0.2 }],
      }],
    };
    const high = {
      ...createAnimationPreset("fade-in"),
      id: "high",
      priority: 20,
      tracks: [{
        id: "opacity",
        property: "opacity" as const,
        keyframes: [{ offset: 0, value: 0.8 }, { offset: 1, value: 0.8 }],
      }],
    };
    expect(resolveMotionComposition([high, low], 100).opacity).toBeCloseTo(0.8);
  });

  it("duplicates clips with fresh IDs", () => {
    const original = createAnimationPreset("scale-in");
    const copy = duplicateAnimationClip(original, [original]);
    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toContain("copy");
    expect(copy.tracks).toEqual(original.tracks);
  });
});
