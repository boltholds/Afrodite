import { describe, expect, it } from "vitest";
import {
  semanticBatchReviewDecisionRequestSchema,
  semanticBatchReviewRequestSchema,
  semanticBatchReviewSubmitRequestSchema,
} from "../src/semantic-batch-review";

const document = {
  schemaVersion: 1 as const,
  id: "document.batch-review",
  name: "Batch review",
  root: {
    id: "node.root",
    kind: "element" as const,
    element: "main",
    name: "Root",
    layout: {
      display: "grid" as const,
      direction: "column" as const,
      sizing: { width: "fill" as const, height: "fill" as const },
    },
    props: {},
    children: [],
  },
};

const batch = {
  apiVersion: 1 as const,
  semanticApiVersion: 1 as const,
  batchId: "semantic-batch:review",
  documentVersion: "ui-fnv1a32:input",
  status: "ready" as const,
  applicationMode: "document-only" as const,
  commands: [{ type: "convert_to_grid" as const, nodeId: "node.root" }],
  steps: [{
    index: 0,
    command: { type: "convert_to_grid" as const, nodeId: "node.root" },
    planId: "semantic:step",
    status: "ready" as const,
    applicationMode: "document-only" as const,
    documentVersionBefore: "ui-fnv1a32:input",
    documentVersionAfter: "ui-fnv1a32:output",
    sourceIntentCount: 0,
    diagnostics: [],
  }],
  diagnostics: [],
  sourcePlans: [],
  documentAfter: document,
};

describe("semantic batch review protocol", () => {
  it("stores the exact batch plan in a pending request", () => {
    const submitted = semanticBatchReviewSubmitRequestSchema.parse({
      requestId: "batch-review-1",
      actor: "codex",
      agentSessionId: "session-1",
      createdAt: "2026-07-27T08:00:00.000Z",
      expiresAt: "2026-07-27T08:15:00.000Z",
      rationale: "Review the coordinated screen update.",
      batch,
    });
    const request = semanticBatchReviewRequestSchema.parse({
      ...submitted,
      status: "pending",
    });

    expect(request.batch.batchId).toBe(batch.batchId);
    expect(request.batch.documentAfter).toEqual(document);
    expect(request.status).toBe("pending");
  });

  it("accepts only explicit human approve or reject decisions", () => {
    expect(semanticBatchReviewDecisionRequestSchema.parse({
      requestId: "batch-review-1",
      decision: "approved",
      decidedBy: "afrodite-studio",
    }).decision).toBe("approved");

    expect(() => semanticBatchReviewDecisionRequestSchema.parse({
      requestId: "batch-review-1",
      decision: "apply",
      decidedBy: "agent",
    })).toThrow();
  });
});
