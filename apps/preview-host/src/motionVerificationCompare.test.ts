import { describe, expect, it } from "vitest";
import type { MotionVerificationStyle } from "@afrodite/protocol/motion-verification";
import {
  compareMotionVerificationStyles,
  parseMotionMatrix,
} from "./motionVerificationCompare";

const base: MotionVerificationStyle = {
  opacity: 1,
  transform: { a: 1, b: 0, c: 0, d: 1, e: 24, f: -8 },
  borderRadius: 12,
  backgroundColor: "rgb(255, 0, 128)",
};

describe("isolated motion verification comparison", () => {
  it("parses 2D, 3D, and identity computed matrices", () => {
    expect(parseMotionMatrix("none")).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    expect(parseMotionMatrix("matrix(1, 0.2, -0.3, 0.9, 24, -8)")).toEqual({
      a: 1,
      b: 0.2,
      c: -0.3,
      d: 0.9,
      e: 24,
      f: -8,
    });
    expect(parseMotionMatrix("matrix3d(1, 0.2, 0, 0, -0.3, 0.9, 0, 0, 0, 0, 1, 0, 24, -8, 0, 1)")).toEqual({
      a: 1,
      b: 0.2,
      c: -0.3,
      d: 0.9,
      e: 24,
      f: -8,
    });
    expect(() => parseMotionMatrix("translateX(10px)")).toThrow(/unsupported/i);
  });

  it("accepts bounded browser rounding within tolerance", () => {
    const actual: MotionVerificationStyle = {
      opacity: 0.985,
      transform: { a: 0.99, b: 0, c: 0, d: 1.01, e: 24.4, f: -7.7 },
      borderRadius: 12.4,
      backgroundColor: base.backgroundColor,
    };
    expect(compareMotionVerificationStyles(base, actual, 2, 2)).toEqual([]);
  });

  it("reports every material mismatch including animation count", () => {
    const actual: MotionVerificationStyle = {
      opacity: 0.5,
      transform: { a: 0.8, b: 0, c: 0, d: 0.8, e: 30, f: 0 },
      borderRadius: 20,
      backgroundColor: "rgb(0, 0, 0)",
    };
    expect(compareMotionVerificationStyles(base, actual, 2, 1).map((item) => item.property))
      .toEqual(["opacity", "transform", "borderRadius", "backgroundColor", "animationCount"]);
  });
});
