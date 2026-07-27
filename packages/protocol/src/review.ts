import { z } from "zod";
import { uiDocumentSchema } from "@afrodite/ui-ir";
import { bridgeErrorSchema, bridgePatchPlanViewSchema } from "./bridge";
import {
  semanticOperationCommandSchema,
  semanticPlanViewSchema,
} from "./semantic";

export const liveSessionSnapshotSchema = z.object({
  sessionId: z.string().min(1),
  revision: z.number().int().nonnegative(),
  documentVersion: z.string().min(1),
  updatedAt: z.string().datetime(),
  document: uiDocumentSchema,
});

export const liveSessionPublishRequestSchema = z.object({
  sessionId: z.string().min(1),
  revision: z.number().int().nonnegative(),
  document: uiDocumentSchema,
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
  documentAfter: uiDocumentSchema.optional(),
  sourcePlans: z.array(bridgePatchPlanViewSchema),
  decision: humanReviewDecisionSchema.optional(),
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
export type HumanReviewRequest = z.infer<typeof humanReviewRequestSchema>;
export type HumanReviewSubmitRequest = z.infer<typeof humanReviewSubmitRequestSchema>;
export type HumanReviewDecisionRequest = z.infer<typeof humanReviewDecisionRequestSchema>;
export type HumanReviewResponse = z.infer<typeof humanReviewResponseSchema>;
export type HumanReviewListResponse = z.infer<typeof humanReviewListResponseSchema>;
