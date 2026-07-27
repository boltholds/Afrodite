import {
  uiDocumentSchema,
  type UiDocument,
  type UiDocumentInput,
} from "@afrodite/ui-ir";
import { z } from "zod";
import { bridgeErrorSchema, bridgePatchPlanViewSchema } from "./bridge";
import { bridgeTransactionPlanViewSchema } from "./transaction";
import {
  SEMANTIC_OPERATION_API_VERSION,
  semanticDiagnosticSchema,
  semanticOperationCommandSchema,
} from "./semantic";

export const SEMANTIC_BATCH_API_VERSION = 1 as const;
export const SEMANTIC_BATCH_MAX_COMMANDS = 16 as const;

const portableUiDocumentSchema: z.ZodType<UiDocument, z.ZodTypeDef, UiDocumentInput> = uiDocumentSchema;

export const semanticBatchDiagnosticSchema = semanticDiagnosticSchema.extend({
  commandIndex: z.number().int().nonnegative().optional(),
  conflictKey: z.string().min(1).optional(),
});

export const semanticBatchStepPlanSchema = z.object({
  index: z.number().int().nonnegative(),
  command: semanticOperationCommandSchema,
  planId: z.string().min(1),
  status: z.enum(["ready", "blocked", "informational"]),
  applicationMode: z.enum(["document-and-source", "document-only", "informational"]),
  documentVersionBefore: z.string().min(1),
  documentVersionAfter: z.string().min(1).optional(),
  sourceIntentCount: z.number().int().nonnegative(),
  diagnostics: z.array(semanticBatchDiagnosticSchema),
});

export const semanticBatchPlanRequestSchema = z.object({
  apiVersion: z.literal(SEMANTIC_BATCH_API_VERSION).default(SEMANTIC_BATCH_API_VERSION),
  semanticApiVersion: z.literal(SEMANTIC_OPERATION_API_VERSION).default(SEMANTIC_OPERATION_API_VERSION),
  document: portableUiDocumentSchema,
  commands: z.array(semanticOperationCommandSchema).min(1).max(SEMANTIC_BATCH_MAX_COMMANDS),
});

export const semanticBatchPlanViewSchema = z.object({
  apiVersion: z.literal(SEMANTIC_BATCH_API_VERSION),
  semanticApiVersion: z.literal(SEMANTIC_OPERATION_API_VERSION),
  batchId: z.string().min(1),
  documentVersion: z.string().min(1),
  status: z.enum(["ready", "blocked"]),
  applicationMode: z.enum(["document-and-source", "document-only", "mixed"]),
  commands: z.array(semanticOperationCommandSchema).min(1).max(SEMANTIC_BATCH_MAX_COMMANDS),
  steps: z.array(semanticBatchStepPlanSchema).max(SEMANTIC_BATCH_MAX_COMMANDS),
  diagnostics: z.array(semanticBatchDiagnosticSchema),
  sourcePlans: z.array(bridgePatchPlanViewSchema),
  sourceTransaction: bridgeTransactionPlanViewSchema.optional(),
  documentAfter: portableUiDocumentSchema.optional(),
});

export const semanticBatchPlanResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), batch: semanticBatchPlanViewSchema }),
  z.object({ ok: z.literal(false), error: bridgeErrorSchema }),
]);

export type SemanticBatchDiagnostic = z.infer<typeof semanticBatchDiagnosticSchema>;
export type SemanticBatchStepPlan = z.infer<typeof semanticBatchStepPlanSchema>;
export type SemanticBatchPlanRequest = z.infer<typeof semanticBatchPlanRequestSchema>;
export type SemanticBatchPlanView = z.infer<typeof semanticBatchPlanViewSchema>;
export type SemanticBatchPlanResponse = z.infer<typeof semanticBatchPlanResponseSchema>;
