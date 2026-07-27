import { describe, expect, it } from "vitest";
import {
  createMotionCssFingerprint,
  motionVerificationManifestSchema,
  motionVerificationResultSchema,
} from "../src/motion-verification";

const cssRegion = `/* afrodite-motion:node.card:start */
@keyframes afrodite-node-card-fade {
  0% { opacity: 0; }
  100% { opacity: 1; }
}
.card:hover { animation: afrodite-node-card-fade 200ms linear both; }
/* afrodite-motion:node.card:end */`;

function manifest() {
  return {
    version: 1 as const,
    planId: "plan.motion.1",
    sourceVersion: "source.v1",
    nodeId: "node.card",
    className: "card",
    managedClipIds: ["fade"],
    clips: [clip("fade")],
    cssRegion,
    cssFingerprint: createMotionCssFingerprint(cssRegion),
    challenge: "abcdefghijklmnop",
    scenarios: [{
      scenarioId: "hover",
      selector: ".card:hover",
      activation: { hover: true, focus: false },
      activeClipIds: ["fade"],
      sampleTimesMs: [0, 100, 200],
    }],
  };
}

function clip(id: string) {
  return {
    id,
    name: `Clip ${id}`,
    enabled: true,
    priority: 0,
    blend: "replace" as const,
    trigger: { type: "hover" as const },
    timeline: {
      durationMs: 200,
      delayMs: 0,
      easing: "linear" as const,
      iterations: 1,
      direction: "normal" as const,
      fill: "both" as const,
    },
    tracks: [{
      id: `opacity-${id}`,
      property: "opacity" as const,
      keyframes: [{ offset: 0, value: 0 }, { offset: 1, value: 1 }],
    }],
  };
}

describe("motion verification protocol", () => {
  it("loads the refined animation schema and accepts an exact manifest", () => {
    const parsed = motionVerificationManifestSchema.parse(manifest());
    expect(parsed.cssFingerprint).toBe(createMotionCssFingerprint(cssRegion));
    expect(parsed.scenarios[0]?.sampleTimesMs).toEqual([0, 100, 200]);
  });

  it("rejects CSS tampering, unmanaged clips, duplicate samples, and more than eight clips", () => {
    expect(() => motionVerificationManifestSchema.parse({
      ...manifest(),
      cssRegion: `${cssRegion}\n/* tampered */`,
    })).toThrow(/fingerprint/i);
    expect(() => motionVerificationManifestSchema.parse({
      ...manifest(),
      scenarios: [{ ...manifest().scenarios[0], activeClipIds: ["unknown"] }],
    })).toThrow(/unmanaged clip/i);
    expect(() => motionVerificationManifestSchema.parse({
      ...manifest(),
      scenarios: [{ ...manifest().scenarios[0], sampleTimesMs: [0, 0] }],
    })).toThrow(/unique/i);
    expect(() => motionVerificationManifestSchema.parse({
      ...manifest(),
      clips: Array.from({ length: 9 }, (_, index) => clip(`clip-${index}`)),
      scenarios: [{
        ...manifest().scenarios[0],
        activeClipIds: [],
      }],
    })).toThrow(/at most eight clips/i);
  });

  it("allows a baseline removal scenario with no active animations", () => {
    const parsed = motionVerificationManifestSchema.parse({
      ...manifest(),
      clips: [],
      cssRegion: "",
      cssFingerprint: createMotionCssFingerprint(""),
      scenarios: [{
        scenarioId: "baseline",
        selector: ".card",
        activation: { hover: false, focus: false },
        activeClipIds: [],
        sampleTimesMs: [0],
      }],
    });
    expect(parsed.scenarios[0]?.activeClipIds).toEqual([]);
  });

  it("requires a bounded structured evidence result", () => {
    const parsedManifest = motionVerificationManifestSchema.parse(manifest());
    const result = motionVerificationResultSchema.parse({
      channel: "afrodite.motion-verification.v1",
      type: "motion-verification-result",
      requestId: "request.1",
      evidenceId: "evidence.1",
      planId: parsedManifest.planId,
      sourceVersion: parsedManifest.sourceVersion,
      cssFingerprint: parsedManifest.cssFingerprint,
      challenge: parsedManifest.challenge,
      hostVersion: 1,
      ok: true,
      samples: [{
        scenarioId: "hover",
        sampleTimeMs: 0,
        expectedAnimationCount: 1,
        actualAnimationCount: 1,
        expected: {
          opacity: 0,
          transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          borderRadius: 0,
          backgroundColor: "rgba(0, 0, 0, 0)",
        },
        actual: {
          opacity: 0,
          transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          borderRadius: 0,
          backgroundColor: "rgba(0, 0, 0, 0)",
        },
        matched: true,
        differences: [],
      }],
      diagnostics: [],
    });
    expect(result.ok).toBe(true);
  });
});
