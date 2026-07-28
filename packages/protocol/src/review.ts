import { z } from "zod";
import {
  bridgeApplyResultSchema,
  bridgeErrorSchema,
  bridgePatchPlanViewSchema,
} from "./bridge";
import {
  semanticOperationCommandSchema,
  semanticPlanViewSchema,
} from "./semantic";
import {
  bridgeTransactionApplyResultSchema,
  bridgeTransactionPlanViewSchema,
} from "./transaction";
import { uiDocumentProtocolSchema } from "./ui-document";

export const liveSessionSnapshotSchema = z.object({
  sessionId: z.string().min(1),
  revision: z.number().int().nonnegative(),
  documentVersion: z.string().min(1),
  updatedAt: z.string().datetime(),
  document: uiDocumentProtocolSchema,
});

export const liveSessionPublishRequestSchema = z.object({
  sessionId: z.string().min(1),
  revision: z.number().int().nonnegative(),
  document: uiDocumentProtocolSchema,
});

export const liveSessionResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), session: liveSessionSnapshotSchema }),
  z.object({ ok: z.literal(false), error: bridgeErrorSchema }),
]);

export const humanReviewStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "expired",
]);

export const humanReviewDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  decidedAt: z.string().datetime(),
  decidedBy: z.string().min(1),
  note: z.string().max(4_000).optional(),
});

export const reviewedDocumentComparisonSchema = z.object({
  status: z.enum(["none", "identical", "changed", "added", "removed"]),
  approvedDocumentVersion: z.string().min(1).optional(),
  freshDocumentVersion: z.string().min(1).optional(),
});

export const reviewedSourceComparisonSchema = z.object({
  repositoryPath: z.string().min(1),
  status: z.enum(["identical", "changed", "added", "removed"]),
  approvedPlanId: z.string().min(1).optional(),
  freshPlanId: z.string().min(1).optional(),
  approvedSourceVersion: z.string().min(1).optional(),
  freshSourceVersion: z.string().min(1).optional(),
});

export const reviewedExecutionComparisonSchema = z.object({
  exactMatch: z.boolean(),
  applicationModeMatches: z.boolean(),
  document: reviewedDocumentComparisonSchema,
  sources: z.array(reviewedSourceComparisonSchema),
  summary: z.string().min(1),
});

export const reviewedExecutionPreparationSchema = z.object({
  preparationId: z.string().min(1),
  preparedAt: z.string().datetime(),
  preparedBy: z.string().min(1),
  liveSessionId: z.string().min(1),
  liveRevision: z.number().int().nonnegative(),
  liveDocumentVersion: z.string().min(1),
  plan: semanticPlanViewSchema,
  comparison: reviewedExecutionComparisonSchema,
  transaction: bridgeTransactionPlanViewSchema.optional(),
});

export const reviewedExecutionSourceResultSchema = z.object({
  planId: z.string().min(1),
  repositoryPath: z.string().min(1),
  sourceVersion: z.string().min(1),
  result: bridgeApplyResultSchema,
  transactionId: z.string().min(1).optional(),
  transactionResult: bridgeTransactionApplyResultSchema.optional(),
});

export const reviewedExecutionRecordSchema = z.object({
  executionId: z.string().min(1),
  preparationId: z.string().min(1),
  executedAt: z.string().datetime(),
  executedBy: z.string().min(1),
  status: z.enum(["applied", "document-only", "source-only", "partial", "failed"]),
  documentApplied: z.boolean(),
  documentCommandId: z.string().min(1).optional(),
  documentRevision: z.number().int().nonnegative().optional(),
  documentVersionAfter: z.string().min(1).optional(),
  sourceResults: z.array(reviewedExecutionSourceResultSchema),
});

export const humanReviewRequestSchema = z.object({
  requestId: z.string().min(1),
  status: humanReviewStatusSchema,
  actor: z.string().min(1),
  agentSessionId: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  semanticPlanId: z.string().min(1),
  documentVersion: z.string().min(1),
  command: semanticOperationCommandSchema,
  rationale: z.string().max(2_000).optional(),
  applicationMode: z.enum(["document-and-source", "document-only", "informational"]),
  documentAfter: uiDocumentProtocolSchema.optional(),
  sourcePlans: z.array(bridgePatchPlanViewSchema),
  decision: humanReviewDecisionSchema.optional(),
  preparation: reviewedExecutionPreparationSchema.optional(),
  execution: reviewedExecutionRecordSchema.optional(),
  executionHistory: z.array(reviewedExecutionRecordSchema).optional(),
});

export const humanReviewSubmitRequestSchema = z.object({
  requestId: z.string().min(1),
  actor: z.string().min(1),
  agentSessionId: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  rationale: z.string().max(2_000).optional(),
  plan: semanticPlanViewSchema,
  command: semanticOperationCommandSchema,
});

export const humanReviewDecisionRequestSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
  decidedBy: z.string().min(1),
  note: z.string().max(4_000).optional(),
});

export const reviewedExecutionPrepareRequestSchema = z.object({
  requestId: z.string().min(1),
  preparedBy: z.string().min(1),
});

export const reviewedExecutionRecordRequestSchema = z.object({
  requestId: z.string().min(1),
  preparationId: z.string().min(1),
  executedBy: z.string().min(1),
  documentApplied: z.boolean(),
  documentCommandId: z.string().min(1).optional(),
  documentRevision: z.number().int().nonnegative().optional(),
  documentVersionAfter: z.string().min(1).optional(),
  sourceResults: z.array(reviewedExecutionSourceResultSchema),
  transactionResult: bridgeTransactionApplyResultSchema.optional(),
});

export const humanReviewResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), request: humanReviewRequestSchema }),
  z.object({ ok: z.literal(false), error: bridgeErrorSchema }),
]);

export const humanReviewListResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), requests: z.array(humanReviewRequestSchema) }),
  z.object({ ok: z.literal(false), error: bridgeErrorSchema }),
]);

export type LiveSessionSnapshot = z.infer<typeof liveSessionSnapshotSchema>;
export type LiveSessionPublishRequest = z.infer<typeof liveSessionPublishRequestSchema>;
export type LiveSessionResponse = z.infer<typeof liveSessionResponseSchema>;
export type HumanReviewStatus = z.infer<typeof humanReviewStatusSchema>;
export type HumanReviewDecision = z.infer<typeof humanReviewDecisionSchema>;
export type ReviewedDocumentComparison = z.infer<typeof reviewedDocumentComparisonSchema>;
export type ReviewedSourceComparison = z.infer<typeof reviewedSourceComparisonSchema>;
export type ReviewedExecutionComparison = z.infer<typeof reviewedExecutionComparisonSchema>;
export type ReviewedExecutionPreparation = z.infer<typeof reviewedExecutionPreparationSchema>;
export type ReviewedExecutionSourceResult = z.infer<typeof reviewedExecutionSourceResultSchema>;
export type ReviewedExecutionRecord = z.infer<typeof reviewedExecutionRecordSchema>;
export type HumanReviewRequest = z.infer<typeof humanReviewRequestSchema>;
export type HumanReviewSubmitRequest = z.infer<typeof humanReviewSubmitRequestSchema>;
export type HumanReviewDecisionRequest = z.infer<typeof humanReviewDecisionRequestSchema>;
export type ReviewedExecutionPrepareRequest = z.infer<typeof reviewedExecutionPrepareRequestSchema>;
export type ReviewedExecutionRecordRequest = z.infer<typeof reviewedExecutionRecordRequestSchema>;
export type HumanReviewResponse = z.infer<typeof humanReviewResponseSchema>;
export type HumanReviewListResponse = z.infer<typeof humanReviewListResponseSchema>;
