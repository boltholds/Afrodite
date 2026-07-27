import { z } from "zod";
import {
  animationClipsSchema,
  sourceBindingSchema,
} from "@afrodite/ui-ir";
import {
  bridgeApplyResultSchema,
  bridgeDiagnosticSchema,
  bridgeErrorSchema,
  bridgePatchPlanViewSchema,
  bridgeVerificationStepSchema,
} from "./bridge";
import {
  motionVerificationManifestSchema,
  motionVerificationResultSchema,
} from "./motion-verification";

export const motionOwnershipSchema = z.object({
  strategy: z.literal("css-keyframes"),
  stylesheetPath: z.string().min(1),
  className: z.string().regex(/^[A-Za-z_][A-Za-z0-9_-]*$/),
  managedClipIds: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9._-]*$/)).min(1).max(32),
}).superRefine((ownership, context) => {
  if (new Set(ownership.managedClipIds).size !== ownership.managedClipIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["managedClipIds"],
      message: "Managed motion clip IDs must be unique.",
    });
  }
});

export const bridgeMotionOperationSchema = z.object({
  kind: z.literal("update-motion"),
  nodeId: z.string().min(1),
  binding: sourceBindingSchema,
  ownership: motionOwnershipSchema,
  before: animationClipsSchema,
  after: animationClipsSchema,
});

export const bridgeMotionPlanRequestSchema = z.object({
  operation: bridgeMotionOperationSchema,
});

export const bridgeMotionPlanViewSchema = bridgePatchPlanViewSchema.extend({
  runtimeVerification: motionVerificationManifestSchema.optional(),
});

export const bridgeMotionPlanResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), plan: bridgeMotionPlanViewSchema }),
  z.object({ ok: z.literal(false), error: bridgeErrorSchema }),
]);

export const bridgeMotionRuntimeEvidenceRecordRequestSchema = z.object({
  result: motionVerificationResultSchema,
});

export const bridgeMotionRuntimeEvidenceSchema = z.object({
  evidenceId: z.string().min(1),
  planId: z.string().min(1),
  sourceVersion: z.string().min(1),
  cssFingerprint: z.string().regex(/^motion-css-v1:[0-9a-f]{8}$/),
  verifiedAt: z.string().datetime(),
  sampleCount: z.number().int().positive(),
  diagnostics: z.array(bridgeDiagnosticSchema),
  verification: z.array(bridgeVerificationStepSchema).default([]),
});

export const bridgeMotionRuntimeEvidenceRecordResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), evidence: bridgeMotionRuntimeEvidenceSchema }),
  z.object({ ok: z.literal(false), error: bridgeErrorSchema }),
]);

export const bridgeMotionApplyRequestSchema = z.object({
  planId: z.string().min(1),
  sourceVersion: z.string().min(1),
  runtimeEvidenceId: z.string().min(1),
  approvedBy: z.string().min(1).max(120).optional(),
});

export const bridgeMotionApplyResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), result: bridgeApplyResultSchema }),
  z.object({ ok: z.literal(false), error: bridgeErrorSchema }),
]);

export type MotionOwnership = z.infer<typeof motionOwnershipSchema>;
export type BridgeMotionOperation = z.infer<typeof bridgeMotionOperationSchema>;
export type BridgeMotionPlanRequest = z.infer<typeof bridgeMotionPlanRequestSchema>;
export type BridgeMotionPlanView = z.infer<typeof bridgeMotionPlanViewSchema>;
export type BridgeMotionPlanResponse = z.infer<typeof bridgeMotionPlanResponseSchema>;
export type BridgeMotionRuntimeEvidenceRecordRequest = z.infer<typeof bridgeMotionRuntimeEvidenceRecordRequestSchema>;
export type BridgeMotionRuntimeEvidence = z.infer<typeof bridgeMotionRuntimeEvidenceSchema>;
export type BridgeMotionRuntimeEvidenceRecordResponse = z.infer<typeof bridgeMotionRuntimeEvidenceRecordResponseSchema>;
export type BridgeMotionApplyRequest = z.infer<typeof bridgeMotionApplyRequestSchema>;
export type BridgeMotionApplyResponse = z.infer<typeof bridgeMotionApplyResponseSchema>;
