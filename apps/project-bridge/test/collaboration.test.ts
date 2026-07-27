import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  HumanReviewSubmitRequest,
  SemanticPlanView,
} from "@afrodite/protocol";
import { createSemanticDocumentVersion } from "@afrodite/semantic-ops";
import { parseUiDocument, type UiDocument } from "@afrodite/ui-ir";
import {
  ProjectCollaborationError,
  ProjectCollaborationStore,
} from "../src/collaboration.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("ProjectCollaborationStore", () => {
  it("persists a live session and review decision across store instances", async () => {
    const root = await createRoot();
    const document = fixtureDocument("flex");
    const store = new ProjectCollaborationStore(root, () => Date.parse("2026-07-27T04:00:00.000Z"));
    const session = await store.publishSession({ sessionId: "studio-1", revision: 4, document });
    expect(session.documentVersion).toBe(createSemanticDocumentVersion(document));

    const review = await store.submitReview(reviewInput(document));
    expect(review.status).toBe("pending");

    const reopened = new ProjectCollaborationStore(root, () => Date.parse("2026-07-27T04:01:00.000Z"));
    expect((await reopened.readSession()).revision).toBe(4);
    expect((await reopened.listReviews())).toHaveLength(1);

    const decided = await reopened.decideReview({
      requestId: review.requestId,
      decision: "approved",
      decidedBy: "human-reviewer",
      note: "Reviewed exact semantic mutation.",
    });
    expect(decided.status).toBe("approved");
    expect(decided.decision?.decidedBy).toBe("human-reviewer");
  });

  it("rejects stale Studio revisions", async () => {
    const root = await createRoot();
    const store = new ProjectCollaborationStore(root);
    await store.publishSession({ sessionId: "studio-1", revision: 3, document: fixtureDocument("flex") });

    await expect(store.publishSession({
      sessionId: "studio-1",
      revision: 2,
      document: fixtureDocument("grid"),
    })).rejects.toMatchObject({ code: "LIVE_SESSION_REVISION_STALE" });
  });

  it("rejects a review planned against an older live document", async () => {
    const root = await createRoot();
    const store = new ProjectCollaborationStore(root);
    const before = fixtureDocument("flex");
    await store.publishSession({ sessionId: "studio-1", revision: 1, document: before });
    const request = reviewInput(before);
    await store.publishSession({ sessionId: "studio-1", revision: 2, document: fixtureDocument("grid") });

    await expect(store.submitReview(request)).rejects.toMatchObject({ code: "REVIEW_DOCUMENT_STALE" });
  });

  it("expires pending requests and refuses a later decision", async () => {
    const root = await createRoot();
    let now = Date.parse("2026-07-27T04:00:00.000Z");
    const document = fixtureDocument("flex");
    const store = new ProjectCollaborationStore(root, () => now);
    await store.publishSession({ sessionId: "studio-1", revision: 1, document });
    const review = await store.submitReview(reviewInput(document));
    now = Date.parse("2026-07-27T05:00:00.000Z");

    expect((await store.getReview(review.requestId)).status).toBe("expired");
    await expect(store.decideReview({
      requestId: review.requestId,
      decision: "approved",
      decidedBy: "human-reviewer",
    })).rejects.toBeInstanceOf(ProjectCollaborationError);
  });
});

async function createRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "afrodite-collaboration-"));
  roots.push(root);
  return root;
}

function fixtureDocument(display: "flex" | "grid"): UiDocument {
  return parseUiDocument({
    schemaVersion: 1,
    id: "document.live",
    name: "Live collaboration document",
    root: {
      id: "node.root",
      kind: "element",
      element: "main",
      name: "Root",
      layout: {
        display,
        direction: "column",
        gap: 8,
        sizing: { width: "fill", height: "fill" },
      },
      props: {},
      children: [],
    },
  });
}

function reviewInput(document: UiDocument): HumanReviewSubmitRequest {
  const after = fixtureDocument("grid");
  const plan: SemanticPlanView = {
    apiVersion: 1,
    planId: "semantic-plan-1",
    documentVersion: createSemanticDocumentVersion(document),
    status: "ready",
    applicationMode: "document-only",
    capabilities: {
      documentMutation: true,
      sourcePlanning: false,
      requirements: ["Human review"],
    },
    diagnostics: [],
    documentAfter: after,
    sourcePlans: [],
  };
  return {
    requestId: "review-1",
    actor: "codex",
    agentSessionId: "agent-session-1",
    createdAt: "2026-07-27T04:00:00.000Z",
    expiresAt: "2026-07-27T04:15:00.000Z",
    rationale: "Convert the selected container to grid.",
    plan,
    command: { type: "convert_to_grid", nodeId: "node.root" },
  };
}
