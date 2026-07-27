import { animationClipsSchema } from "@afrodite/ui-ir";
import { z } from "zod";

export const MOTION_VERIFICATION_CHANNEL = "afrodite.motion-verification.v1" as const;

export const motionVerificationActivationSchema = z.object({
  hover: z.boolean().default(false),
  focus: z.boolean().default(false),
  state: z.string().min(1).max(80).optional(),
});

export const motionVerificationScenarioSchema = z.object({
  scenarioId: z.string().regex(/^[A-Za-z][A-Za-z0-9._-]*$/),
  selector: z.string().min(1).max(240),
  activation: motionVerificationActivationSchema,
  activeClipIds: z.array(z.string().min(1)).min(1).max(8),
  sampleTimesMs: z.array(z.number().finite().nonnegative().max(600_000)).min(1).max(12),
}).superRefine((scenario, context) => {
  if (new Set(scenario.activeClipIds).size !== scenario.activeClipIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["activeClipIds"],
      message: "Motion verification active clip IDs must be unique.",
    });
  }
  if (new Set(scenario.sampleTimesMs).size !== scenario.sampleTimesMs.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sampleTimesMs"],
      message: "Motion verification sample times must be unique.",
    });
  }
  for (let index = 1; index < scenario.sampleTimesMs.length; index += 1) {
    if (scenario.sampleTimesMs[index]! < scenario.sampleTimesMs[index - 1]!) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sampleTimesMs", index],
        message: "Motion verification sample times must be sorted.",
      });
    }
  }
});

export const motionVerificationManifestSchema = z.object({
  version: z.literal(1),
  planId: z.string().min(1),
  sourceVersion: z.string().min(1),
  nodeId: z.string().min(1),
  className: z.string().regex(/^[A-Za-z_][A-Za-z0-9_-]*$/),
  managedClipIds: z.array(z.string().min(1)).min(1).max(8),
  clips: animationClipsSchema.max(8),
  cssRegion: z.string().min(1).max(100_000),
  cssFingerprint: z.string().regex(/^motion-css-v1:[0-9a-f]{8}$/),
  challenge: z.string().regex(/^[A-Za-z0-9_-]{16,120}$/),
  scenarios: z.array(motionVerificationScenarioSchema).min(1).max(32),
}).superRefine((manifest, context) => {
  if (createMotionCssFingerprint(manifest.cssRegion) !== manifest.cssFingerprint) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["cssFingerprint"],
      message: "Motion verification CSS fingerprint does not match cssRegion.",
    });
  }
  const managed = new Set(manifest.managedClipIds);
  if (managed.size !== manifest.managedClipIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["managedClipIds"],
      message: "Managed verification clip IDs must be unique.",
    });
  }
  const clips = new Set(manifest.clips.map((clip) => clip.id));
  for (const clipId of manifest.managedClipIds) {
    if (!clips.has(clipId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["managedClipIds"],
        message: `Managed verification clip ${clipId} is absent from the manifest clips.`,
      });
    }
  }
  const scenarioIds = manifest.scenarios.map((scenario) => scenario.scenarioId);
  if (new Set(scenarioIds).size !== scenarioIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scenarios"],
      message: "Motion verification scenario IDs must be unique.",
    });
  }
  for (const [scenarioIndex, scenario] of manifest.scenarios.entries()) {
    for (const clipId of scenario.activeClipIds) {
      if (!managed.has(clipId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["scenarios", scenarioIndex, "activeClipIds"],
          message: `Scenario references unmanaged clip ${clipId}.`,
        });
      }
    }
  }
});

export const motionVerificationMatrixSchema = z.object({
  a: z.number().finite(),
  b: z.number().finite(),
  c: z.number().finite(),
  d: z.number().finite(),
  e: z.number().finite(),
  f: z.number().finite(),
});

export const motionVerificationStyleSchema = z.object({
  opacity: z.number().finite(),
  transform: motionVerificationMatrixSchema,
  borderRadius: z.number().finite().nonnegative(),
  backgroundColor: z.string().min(1),
});

export const motionVerificationDifferenceSchema = z.object({
  property: z.enum(["opacity", "transform", "borderRadius", "backgroundColor", "animationCount"]),
  expected: z.string(),
  actual: z.string(),
  delta: z.number().finite().nonnegative().optional(),
  tolerance: z.number().finite().nonnegative().optional(),
});

export const motionVerificationSampleSchema = z.object({
  scenarioId: z.string().min(1),
  sampleTimeMs: z.number().finite().nonnegative(),
  expectedAnimationCount: z.number().int().nonnegative(),
  actualAnimationCount: z.number().int().nonnegative(),
  expected: motionVerificationStyleSchema,
  actual: motionVerificationStyleSchema,
  matched: z.boolean(),
  differences: z.array(motionVerificationDifferenceSchema).max(8),
});

export const motionVerificationDiagnosticSchema = z.object({
  code: z.enum([
    "INVALID_MANIFEST",
    "CSS_FINGERPRINT_MISMATCH",
    "RUNTIME_API_UNAVAILABLE",
    "SCENARIO_SETUP_FAILED",
    "SAMPLE_FAILED",
    "STYLE_MISMATCH",
  ]),
  severity: z.enum(["warning", "error"]),
  message: z.string().min(1),
  scenarioId: z.string().min(1).optional(),
  sampleTimeMs: z.number().finite().nonnegative().optional(),
});

export const motionVerificationRequestSchema = z.object({
  channel: z.literal(MOTION_VERIFICATION_CHANNEL),
  type: z.literal("verify-motion"),
  requestId: z.string().min(1),
  manifest: motionVerificationManifestSchema,
});

export const motionVerificationResultSchema = z.object({
  channel: z.literal(MOTION_VERIFICATION_CHANNEL),
  type: z.literal("motion-verification-result"),
  requestId: z.string().min(1),
  evidenceId: z.string().min(1),
  planId: z.string().min(1),
  sourceVersion: z.string().min(1),
  cssFingerprint: z.string().regex(/^motion-css-v1:[0-9a-f]{8}$/),
  challenge: z.string().min(16),
  hostVersion: z.literal(1),
  ok: z.boolean(),
  samples: z.array(motionVerificationSampleSchema).max(384),
  diagnostics: z.array(motionVerificationDiagnosticSchema).max(128),
});

export const motionVerificationMessageSchema = z.discriminatedUnion("type", [
  motionVerificationRequestSchema,
  motionVerificationResultSchema,
]);

export type MotionVerificationActivation = z.infer<typeof motionVerificationActivationSchema>;
export type MotionVerificationScenario = z.infer<typeof motionVerificationScenarioSchema>;
export type MotionVerificationManifest = z.infer<typeof motionVerificationManifestSchema>;
export type MotionVerificationMatrix = z.infer<typeof motionVerificationMatrixSchema>;
export type MotionVerificationStyle = z.infer<typeof motionVerificationStyleSchema>;
export type MotionVerificationDifference = z.infer<typeof motionVerificationDifferenceSchema>;
export type MotionVerificationSample = z.infer<typeof motionVerificationSampleSchema>;
export type MotionVerificationDiagnostic = z.infer<typeof motionVerificationDiagnosticSchema>;
export type MotionVerificationRequest = z.infer<typeof motionVerificationRequestSchema>;
export type MotionVerificationResult = z.infer<typeof motionVerificationResultSchema>;
export type MotionVerificationMessage = z.infer<typeof motionVerificationMessageSchema>;

export function decodeMotionVerificationMessage(input: unknown): MotionVerificationMessage | undefined {
  const parsed = motionVerificationMessageSchema.safeParse(input);
  return parsed.success ? parsed.data : undefined;
}

export function createMotionVerificationRequest(
  requestId: string,
  manifest: MotionVerificationManifest,
): MotionVerificationRequest {
  return motionVerificationRequestSchema.parse({
    channel: MOTION_VERIFICATION_CHANNEL,
    type: "verify-motion",
    requestId,
    manifest,
  });
}

export function createMotionCssFingerprint(cssRegion: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < cssRegion.length; index += 1) {
    hash ^= cssRegion.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `motion-css-v1:${hash.toString(16).padStart(8, "0")}`;
}
