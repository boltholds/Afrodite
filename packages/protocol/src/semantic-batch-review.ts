import { z } from "zod";
import { bridgeErrorSchema } from "./bridge";
import { semanticBatchPlanViewSchema } from "./semantic-batch";

export const semanticBatchReviewStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "expired",
]);

export const semanticBatchReviewDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  decidedAt: z.string().datetime(),
  decidedBy: z.string().min(1),
  note: z.string().max(4_000).optional(),
});

export const semanticBatchReviewRequestSchema = z.object({
  requestId: z.string().min(1),
  status: semanticBatchReviewStatusSchema,
  actor: z.string().min(1),
  agentSessionId: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  rationale: z.string().max(2_000).optional(),
  batch: semanticBatchPlanViewSchema,
  decision: semanticBatchReviewDecisionSchema.optional(),
});

export const semanticBatchReviewSubmitRequestSchema = z.object({
  requestId: z.string().min(1),
  actor: z.string().min(1),
  agentSessionId: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  rationale: z.string().max(2_000).optional(),
  batch: semanticBatchPlanViewSchema,
});

export const semanticBatchReviewDecisionRequestSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
  decidedBy: z.string().min(1),
  note: z.string().max(4_000).optional(),
});

export const semanticBatchReviewResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), request: semanticBatchReviewRequestSchema }),
  z.object({ ok: z.literal(false), error: bridgeErrorSchema }),
]);

export const semanticBatchReviewListResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), requests: z.array(semanticBatchReviewRequestSchema) }),
  z.object({ ok: z.literal(false), error: bridgeErrorSchema }),
]);

export type SemanticBatchReviewStatus = z.infer<typeof semanticBatchReviewStatusSchema>;
export type SemanticBatchReviewDecision = z.infer<typeof semanticBatchReviewDecisionSchema>;
export type SemanticBatchReviewRequest = z.infer<typeof semanticBatchReviewRequestSchema>;
export type SemanticBatchReviewSubmitRequest = z.infer<typeof semanticBatchReviewSubmitRequestSchema>;
export type SemanticBatchReviewDecisionRequest = z.infer<typeof semanticBatchReviewDecisionRequestSchema>;
export type SemanticBatchReviewResponse = z.infer<typeof semanticBatchReviewResponseSchema>;
export type SemanticBatchReviewListResponse = z.infer<typeof semanticBatchReviewListResponseSchema>;
