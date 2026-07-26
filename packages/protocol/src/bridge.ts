import { layoutSchema, sourceBindingSchema } from "@afrodite/ui-ir";
import { z } from "zod";
import {
  diagnosticSeveritySchema,
  frameworkCapabilitiesSchema,
  frameworkIdSchema,
} from "./catalog";

export const PROJECT_BRIDGE_VERSION = 1 as const;

export const bridgeErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
});

export const bridgeAdapterSchema = z.object({
  frameworkId: frameworkIdSchema,
  adapterId: z.string().min(1),
  displayName: z.string().min(1),
  capabilities: frameworkCapabilitiesSchema,
});

export const bridgeHealthResponseSchema = z.object({
  ok: z.literal(true),
  bridgeVersion: z.literal(PROJECT_BRIDGE_VERSION),
  projectName: z.string().min(1),
  adapters: z.array(bridgeAdapterSchema),
});

export const bridgeSourceRequestSchema = z.object({
  repositoryPath: z.string().min(1),
});

export const bridgeSourceSnapshotSchema = z.object({
  repositoryPath: z.string().min(1),
  content: z.string(),
  version: z.string().min(1),
});

export const bridgeSourceResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), source: bridgeSourceSnapshotSchema }),
  z.object({ ok: z.literal(false), error: bridgeErrorSchema }),
]);

export const bridgeOperationSchema = z.object({
  kind: z.literal("update-layout"),
  nodeId: z.string().min(1),
  binding: sourceBindingSchema,
  before: layoutSchema,
  after: layoutSchema,
});

export const bridgeDiagnosticSchema = z.object({
  code: z.string().min(1),
  severity: diagnosticSeveritySchema,
  message: z.string().min(1),
  repositoryPath: z.string().min(1).optional(),
  nodeId: z.string().min(1).optional(),
});

export const bridgeVerificationStepSchema = z.object({
  kind: z.enum(["format", "typecheck", "test", "build", "custom"]),
  command: z.string().min(1),
  cwd: z.string().min(1).optional(),
  required: z.boolean(),
});

export const bridgeVerificationExecutionSchema = z.object({
  step: bridgeVerificationStepSchema,
  ok: z.boolean(),
  exitCode: z.number().int().optional(),
  stdout: z.string(),
  stderr: z.string(),
});

export const bridgePlanRequestSchema = z.object({
  operation: bridgeOperationSchema,
});

export const bridgePatchPlanViewSchema = z.object({
  planId: z.string().min(1),
  repositoryPath: z.string().min(1),
  sourceVersion: z.string().min(1),
  changed: z.boolean(),
  diff: z.string(),
  diagnostics: z.array(bridgeDiagnosticSchema),
  verification: z.array(bridgeVerificationStepSchema),
});

export const bridgePlanResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), plan: bridgePatchPlanViewSchema }),
  z.object({ ok: z.literal(false), error: bridgeErrorSchema }),
]);

export const bridgeApplyRequestSchema = z.object({
  planId: z.string().min(1),
  sourceVersion: z.string().min(1),
  approvedBy: z.string().min(1).max(120).optional(),
});

export const bridgeApplyResultSchema = z.object({
  status: z.enum(["applied", "rejected", "rolled-back", "rollback-failed"]),
  planId: z.string().min(1),
  beforeVersion: z.string().min(1),
  afterVersion: z.string().min(1).optional(),
  restoredVersion: z.string().min(1).optional(),
  diagnostics: z.array(bridgeDiagnosticSchema),
  verification: z.array(bridgeVerificationExecutionSchema),
});

export const bridgeApplyResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), result: bridgeApplyResultSchema }),
  z.object({ ok: z.literal(false), error: bridgeErrorSchema }),
]);

export type BridgeAdapter = z.infer<typeof bridgeAdapterSchema>;
export type BridgeHealthResponse = z.infer<typeof bridgeHealthResponseSchema>;
export type BridgeSourceRequest = z.infer<typeof bridgeSourceRequestSchema>;
export type BridgeSourceSnapshot = z.infer<typeof bridgeSourceSnapshotSchema>;
export type BridgeSourceResponse = z.infer<typeof bridgeSourceResponseSchema>;
export type BridgeOperation = z.infer<typeof bridgeOperationSchema>;
export type BridgeDiagnostic = z.infer<typeof bridgeDiagnosticSchema>;
export type BridgeVerificationStep = z.infer<typeof bridgeVerificationStepSchema>;
export type BridgeVerificationExecution = z.infer<typeof bridgeVerificationExecutionSchema>;
export type BridgePlanRequest = z.infer<typeof bridgePlanRequestSchema>;
export type BridgePatchPlanView = z.infer<typeof bridgePatchPlanViewSchema>;
export type BridgePlanResponse = z.infer<typeof bridgePlanResponseSchema>;
export type BridgeApplyRequest = z.infer<typeof bridgeApplyRequestSchema>;
export type BridgeApplyResult = z.infer<typeof bridgeApplyResultSchema>;
export type BridgeApplyResponse = z.infer<typeof bridgeApplyResponseSchema>;
