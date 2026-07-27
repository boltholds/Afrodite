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
const runner: VerificationRunner = {
  run: async (step) => ({ step, ok: true, exitCode: 0, stdout: "ok", stderr: "" }),
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("runtime-verified motion removal", () => {
  it("requires baseline evidence before removing an owned CSS region", async () => {
    const root = await fixture();
    let evidenceSequence = 0;
    const service = new MotionBridgeService({
      projectRoot: root,
      verificationRunner: runner,
      challengeFactory: () => "fixed-runtime-challenge",
      evidenceIdFactory: () => `bridge-evidence-${++evidenceSequence}`,
    });

    const createOperation = operation();
    const createPlan = await service.planMotionPatch(createOperation);
    const createEvidence = service.recordRuntimeEvidence(resultFor(createPlan.runtimeVerification!, "host-create"));
    expect((await service.applyMotionPatch(
      createPlan.planId,
      createPlan.sourceVersion,
      createEvidence.evidenceId,
    )).status).toBe("applied");

    const removeOperation: BridgeMotionOperation = {
      ...createOperation,
      before: createOperation.after,
      after: [],
    };
    const removePlan = await service.planMotionPatch(removeOperation);

    expect(removePlan.changed).toBe(true);
    expect(removePlan.runtimeVerification).toMatchObject({
      clips: [],
      cssRegion: "",
      scenarios: [{
        scenarioId: "baseline",
        activeClipIds: [],
        sampleTimesMs: [0],
      }],
    });
    await expect(service.applyMotionPatch(removePlan.planId, removePlan.sourceVersion, "missing"))
      .rejects.toMatchObject({ code: "MOTION_RUNTIME_EVIDENCE_REQUIRED" });

    const removeEvidence = service.recordRuntimeEvidence(resultFor(removePlan.runtimeVerification!, "host-remove"));
    expect((await service.applyMotionPatch(
      removePlan.planId,
      removePlan.sourceVersion,
      removeEvidence.evidenceId,
    )).status).toBe("applied");
    expect(await readFile(path.join(root, "src", "Card.module.css"), "utf8"))
      .not.toContain("afrodite-motion:node.card:start");
  });
});

function resultFor(
  manifest: MotionVerificationManifest,
  hostEvidenceId: string,
): MotionVerificationResult {
  return {
    channel: "afrodite.motion-verification.v1",
    type: "motion-verification-result",
    requestId: `request-${hostEvidenceId}`,
    evidenceId: hostEvidenceId,
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
        easing: "linear",
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
  const root = await mkdtemp(path.join(os.tmpdir(), "afrodite-motion-remove-"));
  roots.push(root);
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "src", "Card.module.css"), ".card { color: white; }\n", "utf8");
  return root;
}
