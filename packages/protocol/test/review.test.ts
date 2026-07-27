import { describe, expect, it } from "vitest";
import {
  humanReviewRequestSchema,
  liveSessionPublishRequestSchema,
} from "../src/index.js";

const document = {
  schemaVersion: 1 as const,
  id: "document.live",
  name: "Live",
  root: {
    id: "node.root",
    kind: "element" as const,
    element: "main",
    name: "Root",
    layout: {
      display: "flex" as const,
      direction: "column" as const,
      sizing: { width: "fill" as const, height: "fill" as const },
    },
    props: {},
    children: [],
  },
};

describe("collaboration protocol", () => {
  it("accepts a versioned live Studio session", () => {
    expect(liveSessionPublishRequestSchema.parse({
      sessionId: "studio-1",
      revision: 7,
      document,
    }).revision).toBe(7);
  });

  it("keeps a human decision separate from source application", () => {
    const request = humanReviewRequestSchema.parse({
      requestId: "review-1",
      status: "approved",
      actor: "codex",
      createdAt: "2026-07-27T04:00:00.000Z",
      expiresAt: "2026-07-27T04:15:00.000Z",
      semanticPlanId: "semantic-1",
      documentVersion: "ui-fnv1a32:1234",
      command: { type: "convert_to_grid", nodeId: "node.root" },
      applicationMode: "document-only",
      documentAfter: document,
      sourcePlans: [],
      decision: {
        decision: "approved",
        decidedAt: "2026-07-27T04:03:00.000Z",
        decidedBy: "human",
      },
    });

    expect(request.status).toBe("approved");
    expect(request).not.toHaveProperty("apply");
    expect(request).not.toHaveProperty("approvedEdits");
  });
});
