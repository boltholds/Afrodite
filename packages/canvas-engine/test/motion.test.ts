import { describe, expect, it } from "vitest";
import { createCommandHistory, executeCommand, undoCommand } from "../src/index";
import {
  createDefaultAnimationClip,
  createDeleteAnimationClipCommand,
  createReplaceAnimationsCommand,
  createUpsertAnimationClipCommand,
  resolveMotionProgress,
  resolveMotionStyle,
} from "../src/motion";
import { parseUiDocument } from "@afrodite/ui-ir";

const document = parseUiDocument({
  schemaVersion: 1,
  id: "document.motion",
  name: "Motion",
  root: {
    id: "node.root",
    kind: "element",
    element: "main",
    name: "Root",
    layout: {
      display: "block",
      direction: "column",
      sizing: { width: "fill", height: "fill" },
    },
    props: {},
    children: [],
  },
});

describe("motion commands", () => {
  it("adds, replaces, deletes, and restores clips reversibly", () => {
    const first = createDefaultAnimationClip("Fade in");
    let history = executeCommand(
      createCommandHistory(document),
      createReplaceAnimationsCommand(document, "node.root", [first]),
    );
    expect(history.present.root.animations?.[0]?.name).toBe("Fade in");

    const updated = { ...first, name: "Updated fade" };
    history = executeCommand(
      history,
      createUpsertAnimationClipCommand(history.present, "node.root", updated),
    );
    expect(history.present.root.animations?.[0]?.name).toBe("Updated fade");

    history = executeCommand(
      history,
      createDeleteAnimationClipCommand(history.present, "node.root", first.id),
    );
    expect(history.present.root.animations).toEqual([]);

    history = undoCommand(history);
    expect(history.present.root.animations?.[0]?.name).toBe("Updated fade");
  });

  it("restores exact animation absence on undo", () => {
    const clip = createDefaultAnimationClip();
    let history = executeCommand(
      createCommandHistory(document),
      createReplaceAnimationsCommand(document, "node.root", [clip]),
    );
    history = undoCommand(history);
    expect(history.present.root.animations).toBeUndefined();
  });
});

describe("motion playback", () => {
  it("interpolates numeric tracks through easing", () => {
    const clip = {
      ...createDefaultAnimationClip(),
      timeline: {
        durationMs: 100,
        delayMs: 0,
        easing: "linear" as const,
        iterations: 1,
        direction: "normal" as const,
        fill: "both" as const,
      },
      tracks: [{
        id: "x",
        property: "transform.x" as const,
        keyframes: [
          { offset: 0, value: 0 },
          { offset: 1, value: 100 },
        ],
      }],
    };

    expect(resolveMotionProgress(clip, 50)).toBeCloseTo(0.5);
    expect(resolveMotionStyle(clip, 50).translateX).toBeCloseTo(50);
  });

  it("respects delay, fill, iterations, and alternate direction", () => {
    const clip = {
      ...createDefaultAnimationClip(),
      timeline: {
        durationMs: 100,
        delayMs: 20,
        easing: "linear" as const,
        iterations: 2,
        direction: "alternate" as const,
        fill: "none" as const,
      },
    };

    expect(resolveMotionProgress(clip, 10)).toBeUndefined();
    expect(resolveMotionProgress(clip, 70)).toBeCloseTo(0.5);
    expect(resolveMotionProgress(clip, 170)).toBeCloseTo(0.5);
    expect(resolveMotionProgress(clip, 220)).toBeUndefined();
  });

  it("uses discrete values for background colors", () => {
    const clip = {
      ...createDefaultAnimationClip(),
      timeline: {
        durationMs: 100,
        delayMs: 0,
        easing: "linear" as const,
        iterations: 1,
        direction: "normal" as const,
        fill: "both" as const,
      },
      tracks: [{
        id: "surface",
        property: "backgroundColor" as const,
        keyframes: [
          { offset: 0, value: "#111111" },
          { offset: 1, value: "#ffffff" },
        ],
      }],
    };

    expect(resolveMotionStyle(clip, 50).backgroundColor).toBe("#111111");
    expect(resolveMotionStyle(clip, 100).backgroundColor).toBe("#ffffff");
  });
});
