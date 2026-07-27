import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  HumanReviewSubmitRequest,
  ReviewedExecutionPreparation,
  SemanticPlanView,
} from "@afrodite/protocol";
import { createSemanticDocumentVersion } from "@afrodite/semantic-ops";
import { parseUiDocument, type UiDocument } from "@afrodite/ui-ir";
import { ProjectCollaborationStore } from "../src/collaboration.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("reviewed execution persistence", () => {
  it("records a reversible document execution against the latest preparation", async () => {
    const root = await createRoot();
    const document = fixtureDocument("flex");
    const after = fixtureDocument("grid");
    const store = new ProjectCollaborationStore(root, () => Date.parse("2026-07-27T05:00:00.000Z"));
    await store.publishSession({ sessionId: "studio-1", revision: 3, document });
    const review = await approveReview(store, document, after);
    const preparation = documentPreparation(document, after, "preparation-1");
    await store.saveExecutionPreparation(review.requestId, preparation);

    const recorded = await store.recordExecution({
      requestId: review.requestId,
      preparationId: preparation.preparationId,
      executedBy: "human",
      documentApplied: true,
      documentCommandId: "command:replace:1",
      documentRevision: 4,
      documentVersionAfter: createSemanticDocumentVersion(after),
      sourceResults: [],
    });

    expect(recorded.execution?.status).toBe("document-only");
    expect(recorded.execution?.documentCommandId).toBe("command:replace:1");
    await expect(store.saveExecutionPreparation(
      review.requestId,
      { ...preparation, preparationId: "preparation-2" },
    )).rejects.toMatchObject({ code: "REVIEW_ALREADY_EXECUTED" });
  });

  it("preserves failed attempts and allows a fresh preparation", async () => {
    const root = await createRoot();
    const document = fixtureDocument("flex");
    const store = new ProjectCollaborationStore(root, () => Date.parse("2026-07-27T05:00:00.000Z"));
    await store.publishSession({ sessionId: "studio-1", revision: 3, document });
    const review = await approveSourceReview(store, document);
    const first = sourcePreparation(document, "preparation-1", "source-plan-1");
    await store.saveExecutionPreparation(review.requestId, first);
    const failed = await store.recordExecution({
      requestId: review.requestId,
      preparationId: first.preparationId,
      executedBy: "human",
      documentApplied: false,
      sourceResults: [{
        planId: "source-plan-1",
        repositoryPath: "src/App.tsx",
        sourceVersion: "source-v1",
        result: {
          status: "rolled-back",
          planId: "source-plan-1",
          beforeVersion: "source-v1",
          restoredVersion: "source-v1",
          diagnostics: [],
          verification: [{
            step: { kind: "typecheck", command: "pnpm typecheck", required: true },
            ok: false,
            exitCode: 1,
            stdout: "",
            stderr: "failed",
          }],
        },
      }],
    });
    expect(failed.execution?.status).toBe("failed");

    const second = sourcePreparation(document, "preparation-2", "source-plan-2");
    const retried = await store.saveExecutionPreparation(review.requestId, second);
    expect(retried.execution).toBeUndefined();
    expect(retried.executionHistory).toHaveLength(1);
    expect(retried.executionHistory?.[0]?.status).toBe("failed");
    expect(retried.preparation?.preparationId).toBe("preparation-2");
  });

  it("rejects document and source receipts that do not match the preparation", async () => {
    const root = await createRoot();
    const document = fixtureDocument("flex");
    const after = fixtureDocument("grid");
    const store = new ProjectCollaborationStore(root, () => Date.parse("2026-07-27T05:00:00.000Z"));
    await store.publishSession({ sessionId: "studio-1", revision: 3, document });
    const review = await approveReview(store, document, after);
    const preparation = documentPreparation(document, after, "preparation-1");
    await store.saveExecutionPreparation(review.requestId, preparation);

    await expect(store.recordExecution({
      requestId: review.requestId,
      preparationId: preparation.preparationId,
      executedBy: "human",
      documentApplied: true,
      documentCommandId: "command:replace:1",
      documentRevision: 4,
      documentVersionAfter: "wrong-version",
      sourceResults: [],
    })).rejects.toMatchObject({ code: "REVIEW_DOCUMENT_RESULT_MISMATCH" });
  });
});

async function createRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "afrodite-reviewed-execution-"));
  roots.push(root);
  return root;
}

async function approveReview(
  store: ProjectCollaborationStore,
  document: UiDocument,
  after: UiDocument,
) {
  const review = await store.submitReview(reviewInput(document, after));
  return store.decideReview({
    requestId: review.requestId,
    decision: "approved",
    decidedBy: "human",
  });
}

async function approveSourceReview(store: ProjectCollaborationStore, document: UiDocument) {
  const plan: SemanticPlanView = {
    apiVersion: 1,
    planId: "semantic-source",
    documentVersion: createSemanticDocumentVersion(document),
    status: "ready",
    applicationMode: "document-and-source",
    capabilities: {
      documentMutation: true,
      sourcePlanning: true,
      sourceRepresentation: "inline",
      requirements: [],
    },
    diagnostics: [],
    documentAfter: fixtureDocument("grid"),
    sourcePlans: [sourcePatch("source-plan-approved")],
  };
  const review = await store.submitReview({
    requestId: "review-source",
    actor: "codex",
    createdAt: "2026-07-27T05:00:00.000Z",
    expiresAt: "2026-07-27T05:15:00.000Z",
    plan,
    command: { type: "convert_to_grid", nodeId: "node.root" },
  });
  return store.decideReview({
    requestId: review.requestId,
    decision: "approved",
    decidedBy: "human",
  });
}

function reviewInput(document: UiDocument, after: UiDocument): HumanReviewSubmitRequest {
  return {
    requestId: "review-document",
    actor: "codex",
    createdAt: "2026-07-27T05:00:00.000Z",
    expiresAt: "2026-07-27T05:15:00.000Z",
    plan: {
      apiVersion: 1,
      planId: "semantic-document",
      documentVersion: createSemanticDocumentVersion(document),
      status: "ready",
      applicationMode: "document-only",
      capabilities: { documentMutation: true, sourcePlanning: false, requirements: [] },
      diagnostics: [],
      documentAfter: after,
      sourcePlans: [],
    },
    command: { type: "convert_to_grid", nodeId: "node.root" },
  };
}

function documentPreparation(
  document: UiDocument,
  after: UiDocument,
  preparationId: string,
): ReviewedExecutionPreparation {
  return {
    preparationId,
    preparedAt: "2026-07-27T05:03:00.000Z",
    preparedBy: "human",
    liveSessionId: "studio-1",
    liveRevision: 3,
    liveDocumentVersion: createSemanticDocumentVersion(document),
    plan: {
      apiVersion: 1,
      planId: `semantic-${preparationId}`,
      documentVersion: createSemanticDocumentVersion(document),
      status: "ready",
      applicationMode: "document-only",
      capabilities: { documentMutation: true, sourcePlanning: false, requirements: [] },
      diagnostics: [],
      documentAfter: after,
      sourcePlans: [],
    },
    comparison: {
      exactMatch: true,
      applicationModeMatches: true,
      document: {
        status: "identical",
        approvedDocumentVersion: createSemanticDocumentVersion(after),
        freshDocumentVersion: createSemanticDocumentVersion(after),
      },
      sources: [],
      summary: "Exact match.",
    },
  };
}

function sourcePreparation(
  document: UiDocument,
  preparationId: string,
  planId: string,
): ReviewedExecutionPreparation {
  return {
    preparationId,
    preparedAt: "2026-07-27T05:03:00.000Z",
    preparedBy: "human",
    liveSessionId: "studio-1",
    liveRevision: 3,
    liveDocumentVersion: createSemanticDocumentVersion(document),
    plan: {
      apiVersion: 1,
      planId: `semantic-${preparationId}`,
      documentVersion: createSemanticDocumentVersion(document),
      status: "ready",
      applicationMode: "document-and-source",
      capabilities: {
        documentMutation: true,
        sourcePlanning: true,
        sourceRepresentation: "inline",
        requirements: [],
      },
      diagnostics: [],
      documentAfter: fixtureDocument("grid"),
      sourcePlans: [sourcePatch(planId)],
    },
    comparison: {
      exactMatch: false,
      applicationModeMatches: true,
      document: { status: "identical" },
      sources: [{
        repositoryPath: "src/App.tsx",
        status: "changed",
        approvedPlanId: "source-plan-approved",
        freshPlanId: planId,
        approvedSourceVersion: "source-v1",
        freshSourceVersion: "source-v1",
      }],
      summary: "Fresh plan was reviewed.",
    },
  };
}

function sourcePatch(planId: string) {
  return {
    planId,
    repositoryPath: "src/App.tsx",
    sourceVersion: "source-v1",
    changed: true,
    diff: "@@ -1 +1 @@\n-flex\n+grid",
    diagnostics: [],
    verification: [{ kind: "typecheck" as const, command: "pnpm typecheck", required: true }],
  };
}

function fixtureDocument(display: "flex" | "grid"): UiDocument {
  return parseUiDocument({
    schemaVersion: 1,
    id: "document.live",
    name: "Live document",
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
