import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { BridgeMotionOperation } from "@afrodite/protocol";
import type {
  MotionVerificationManifest,
  MotionVerificationResult,
  MotionVerificationStyle,
} from "@afrodite/protocol/motion-verification";
import type { VerificationRunner } from "@afrodite/verified-write";
import { MotionBridgeService } from "../src/motion.js";

const roots: string[] = [];
const identity: MotionVerificationStyle = {
  opacity: 1,
  transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
  borderRadius: 0,
  backgroundColor: "rgba(0, 0, 0, 0)",
};
const passingRunner: VerificationRunner = {
  run: async (step) => ({ step, ok: true, exitCode: 0, stdout: "ok", stderr: "" }),
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("project bridge motion planning", () => {
  it("returns a version-bound runtime manifest without writing the stylesheet", async () => {
    const root = await fixture();
    const service = createService(root);
    const plan = await service.planMotionPatch(operation());

    expect(plan.changed).toBe(true);
    expect(plan.repositoryPath).toBe("src/Card.module.css");
    expect(plan.diff).toContain("@keyframes afrodite-node-card-fade");
    expect(plan.diff).toContain(".card:hover");
    expect(plan.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
    expect(plan.runtimeVerification).toMatchObject({
      planId: plan.planId,
      sourceVersion: plan.sourceVersion,
      nodeId: "node.card",
      className: "card",
      managedClipIds: ["fade"],
      challenge: "fixed-runtime-challenge",
    });
    expect(plan.runtimeVerification?.cssRegion).toContain("afrodite-motion:node.card:start");
    expect(plan.runtimeVerification?.scenarios).toEqual([expect.objectContaining({
      scenarioId: "hover",
      activeClipIds: ["fade"],
      activation: { hover: true, focus: false },
    })]);
    expect(await readFile(path.join(root, "src", "Card.module.css"), "utf8")).toBe(".card { color: white; }\n");
  });

  it("rejects apply until successful runtime evidence is recorded", async () => {
    const root = await fixture();
    const service = createService(root);
    const plan = await service.planMotionPatch(operation());

    await expect(service.applyMotionPatch(plan.planId, plan.sourceVersion, "missing"))
      .rejects.toMatchObject({ code: "MOTION_RUNTIME_EVIDENCE_REQUIRED" });
  });

  it("rejects evidence with a mismatched challenge, incomplete samples, or mismatched styles", async () => {
    const root = await fixture();
    const service = createService(root);
    const plan = await service.planMotionPatch(operation());
    const manifest = plan.runtimeVerification!;
    const valid = resultFor(manifest, "evidence-valid");

    expect(() => service.recordRuntimeEvidence({ ...valid, challenge: "another-runtime-challenge" }))
      .toThrowError(expect.objectContaining({ code: "MOTION_RUNTIME_EVIDENCE_MISMATCH" }));
    expect(() => service.recordRuntimeEvidence({ ...valid, samples: valid.samples.slice(1) }))
      .toThrowError(expect.objectContaining({ code: "MOTION_RUNTIME_EVIDENCE_INCOMPLETE" }));
    expect(() => service.recordRuntimeEvidence({
      ...valid,
      ok: false,
      samples: valid.samples.map((sample, index) => index === 0
        ? { ...sample, matched: false, differences: [{ property: "opacity", expected: "1", actual: "0" }] }
        : sample),
    })).toThrowError(expect.objectContaining({ code: "MOTION_RUNTIME_VERIFICATION_FAILED" }));
  });

  it("applies the exact stylesheet only after matching evidence and consumes the plan", async () => {
    const root = await fixture();
    const service = createService(root);
    const plan = await service.planMotionPatch(operation());
    const manifest = plan.runtimeVerification!;
    const evidence = service.recordRuntimeEvidence(resultFor(manifest, "evidence-apply"));

    const applied = await service.applyMotionPatch(
      plan.planId,
      plan.sourceVersion,
      evidence.evidenceId,
      "motion-test",
    );

    expect(applied.status).toBe("applied");
    expect(await readFile(path.join(root, "src", "Card.module.css"), "utf8"))
      .toContain("@keyframes afrodite-node-card-fade");
    await expect(service.applyMotionPatch(plan.planId, plan.sourceVersion, evidence.evidenceId))
      .rejects.toMatchObject({ code: "MOTION_PLAN_NOT_FOUND" });
  });

  it("does not store blocked runtime trigger plans", async () => {
    const root = await fixture();
    const service = createService(root);
    const base = operation();
    const input: BridgeMotionOperation = {
      ...base,
      after: base.after.map((clip, index) => index === 0
        ? { ...clip, trigger: { type: "click" as const } }
        : clip),
    };
    const plan = await service.planMotionPatch(input);

    expect(plan.changed).toBe(false);
    expect(plan.runtimeVerification).toBeUndefined();
    expect(plan.diagnostics.some((item) => item.code === "MOTION_TRIGGER_NOT_PATCHABLE")).toBe(true);
    await expect(service.applyMotionPatch(plan.planId, plan.sourceVersion, "none"))
      .rejects.toMatchObject({ code: "MOTION_PLAN_NOT_FOUND" });
  });
});

function createService(root: string): MotionBridgeService {
  return new MotionBridgeService({
    projectRoot: root,
    verificationRunner: passingRunner,
    challengeFactory: () => "fixed-runtime-challenge",
    now: () => Date.parse("2026-07-27T12:00:00.000Z"),
  });
}

function resultFor(
  manifest: MotionVerificationManifest,
  evidenceId: string,
): MotionVerificationResult {
  return {
    channel: "afrodite.motion-verification.v1",
    type: "motion-verification-result",
    requestId: `request-${evidenceId}`,
    evidenceId,
    planId: manifest.planId,
    sourceVersion: manifest.sourceVersion,
    cssFingerprint: manifest.cssFingerprint,
    challenge: manifest.challenge,
    hostVersion: 1,
    ok: true,
    samples: manifest.scenarios.flatMap((scenario) => scenario.sampleTimesMs.map((sampleTimeMs) => ({
      scenarioId: scenario.scenarioId,
      sampleTimeMs,
      expectedAnimationCount: scenario.activeClipIds.length,
      actualAnimationCount: scenario.activeClipIds.length,
      expected: identity,
      actual: identity,
      matched: true,
      differences: [],
    }))),
    diagnostics: [],
  };
}

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
