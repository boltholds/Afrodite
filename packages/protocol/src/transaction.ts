import { z } from "zod";
import {
  bridgeDiagnosticSchema,
  bridgeErrorSchema,
  bridgeOperationSchema,
  bridgeVerificationExecutionSchema,
  bridgeVerificationStepSchema,
} from "./bridge";
import { bridgeStyleOperationSchema } from "./style";
import { bridgeVariantOperationSchema } from "./variant";

export const bridgeTransactionOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("layout"),
    operation: bridgeOperationSchema,
  }),
  z.object({
    type: z.literal("style"),
    operation: bridgeStyleOperationSchema,
  }),
  z.object({
    type: z.literal("variant"),
    operation: bridgeVariantOperationSchema,
  }),
]);

export const bridgeTransactionPlanRequestSchema = z.object({
  operations: z.array(bridgeTransactionOperationSchema).min(2).max(32),
});

export const bridgeTransactionFilePlanViewSchema = z.object({
  planId: z.string().min(1),
  repositoryPath: z.string().min(1),
  sourceVersion: z.string().min(1),
  changed: z.boolean(),
  diff: z.string(),
  diagnostics: z.array(bridgeDiagnosticSchema),
});

export const bridgeTransactionPlanViewSchema = z.object({
  transactionId: z.string().min(1),
  files: z.array(bridgeTransactionFilePlanViewSchema).min(1),
  changedFiles: z.number().int().nonnegative(),
  diagnostics: z.array(bridgeDiagnosticSchema),
  verification: z.array(bridgeVerificationStepSchema),
});

export const bridgeTransactionPlanResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), transaction: bridgeTransactionPlanViewSchema }),
  z.object({ ok: z.literal(false), error: bridgeErrorSchema }),
]);

export const bridgeTransactionSourceApprovalSchema = z.object({
  repositoryPath: z.string().min(1),
  sourceVersion: z.string().min(1),
});

export const bridgeTransactionApplyRequestSchema = z.object({
  transactionId: z.string().min(1),
  sources: z.array(bridgeTransactionSourceApprovalSchema).min(2).max(32),
  approvedBy: z.string().min(1).max(120).optional(),
});

export const bridgeTransactionFileResultSchema = z.object({
  repositoryPath: z.string().min(1),
  beforeVersion: z.string().min(1),
  afterVersion: z.string().min(1).optional(),
  restoredVersion: z.string().min(1).optional(),
});

export const bridgeTransactionApplyResultSchema = z.object({
  status: z.enum(["applied", "rejected", "rolled-back", "rollback-failed"]),
  transactionId: z.string().min(1),
  files: z.array(bridgeTransactionFileResultSchema),
  diagnostics: z.array(bridgeDiagnosticSchema),
  verification: z.array(bridgeVerificationExecutionSchema),
});

export const bridgeTransactionApplyResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), result: bridgeTransactionApplyResultSchema }),
  z.object({ ok: z.literal(false), error: bridgeErrorSchema }),
]);

export type BridgeTransactionOperation = z.infer<typeof bridgeTransactionOperationSchema>;
export type BridgeTransactionPlanRequest = z.infer<typeof bridgeTransactionPlanRequestSchema>;
export type BridgeTransactionFilePlanView = z.infer<typeof bridgeTransactionFilePlanViewSchema>;
export type BridgeTransactionPlanView = z.infer<typeof bridgeTransactionPlanViewSchema>;
export type BridgeTransactionPlanResponse = z.infer<typeof bridgeTransactionPlanResponseSchema>;
export type BridgeTransactionSourceApproval = z.infer<typeof bridgeTransactionSourceApprovalSchema>;
export type BridgeTransactionApplyRequest = z.infer<typeof bridgeTransactionApplyRequestSchema>;
export type BridgeTransactionFileResult = z.infer<typeof bridgeTransactionFileResultSchema>;
export type BridgeTransactionApplyResult = z.infer<typeof bridgeTransactionApplyResultSchema>;
export type BridgeTransactionApplyResponse = z.infer<typeof bridgeTransactionApplyResponseSchema>;
