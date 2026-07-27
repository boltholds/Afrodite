import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  BridgeTransactionApplyResult,
  BridgeTransactionPlanView,
  HumanReviewSubmitRequest,
  ReviewedExecutionPreparation,
} from "@afrodite/protocol";
import { createSemanticDocumentVersion } from "@afrodite/semantic-ops";
import { parseUiDocument, type UiDocument } from "@afrodite/ui-ir";
import { ProjectCollaborationStore } from "../src/collaboration.js";
import { ReviewedExecutionService } from "../src/reviewExecution.js";
import { ProjectBridgeService } from "../src/service.js";

const roots: string[] = [];

const document = parseUiDocument({
  schemaVersion: 1,
  id: "document.transaction-review",
  name: "Reviewed transaction",
  root: {
    id: "node.root",
    kind: "element",
    element: "main",
    name: "Root",
    layout: {
      display: "flex",
      direction: "column",
      gap: 8,
      sizing: { width: "fill", height: "fill" },
    },
    props: {},
    children: [],
  },
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("reviewed multi-file execution", () => {
  it("records one applied transaction as bridge-generated per-plan receipts", async () => {
    const fixture = await createApprovedPreparation();
    const recorded = await fixture.execution.record({
      requestId: fixture.requestId,
      preparationId: fixture.preparation.preparationId,
      executedBy: "human",
      documentApplied: false,
      sourceResults: [],
      transactionResult: transactionResult("applied"),
    });

    expect(recorded.execution?.status).toBe("source-only");
    expect(recorded.execution?.sourceResults).toHaveLength(2);
    expect(recorded.execution?.sourceResults.every((entry) => entry.transactionId === "transaction-reviewed")).toBe(true);
    expect(recorded.execution?.sourceResults.every((entry) => entry.result.status === "applied")).toBe(true);
    expect(recorded.execution?.sourceResults.filter((entry) => entry.transactionResult)).toHaveLength(1);
    expect(recorded.execution?.sourceResults.find((entry) => entry.transactionResult)?.transactionResult?.verification[0]?.ok).toBe(true);
  });

  it("rejects browser-authored per-file receipts for a reviewed transaction", async () => {
    const fixture = await createApprovedPreparation();
    await expect(fixture.execution.record({
      requestId: fixture.requestId,
      preparationId: fixture.preparation.preparationId,
      executedBy: "human",
      documentApplied: false,
      sourceResults: [{
        planId: "plan-app",
        repositoryPath: "src/App.tsx",
        sourceVersion: "app-v1",
        result: {
          status: "applied",
          planId: "plan-app",
          beforeVersion: "app-v1",
          afterVersion: "app-v2",
          diagnostics: [],
          verification: [],
        },
      }],
      transactionResult: transactionResult("applied"),
    })).rejects.toMatchObject({ code: "REVIEW_TRANSACTION_SOURCE_RESULTS_FORGED" });
  });

  it("rejects a transaction receipt with another transaction ID", async () => {
    const fixture = await createApprovedPreparation();
    await expect(fixture.execution.record({
      requestId: fixture.requestId,
      preparationId: fixture.preparation.preparationId,
      executedBy: "human",
      documentApplied: false,
      sourceResults: [],
      transactionResult: { ...transactionResult("applied"), transactionId: "transaction-forged" },
    })).rejects.toMatchObject({ code: "REVIEW_TRANSACTION_RESULT_MISMATCH" });
  });

  it("records rollback-failed as partial when one file remains changed", async () => {
    const fixture = await createApprovedPreparation();
    const result = transactionResult("rollback-failed");
    result.files[0] = {
      repositoryPath: "src/App.tsx",
      beforeVersion: "app-v1",
      afterVersion: "app-v2",
    };
    result.files[1] = {
      repositoryPath: "src/theme.css",
      beforeVersion: "theme-v1",
      afterVersion: "theme-v2",
      restoredVersion: "theme-v1-restored",
    };

    const recorded = await fixture.execution.record({
      requestId: fixture.requestId,
      preparationId: fixture.preparation.preparationId,
      executedBy: "human",
      documentApplied: false,
      sourceResults: [],
      transactionResult: result,
    });

    expect(recorded.execution?.status).toBe("partial");
    expect(recorded.execution?.sourceResults.find((entry) => entry.repositoryPath === "src/App.tsx")?.result.status).toBe("applied");
    expect(recorded.execution?.sourceResults.find((entry) => entry.repositoryPath === "src/theme.css")?.result.status).toBe("rolled-back");
  });

  it("records a complete rollback as failed with no durable source effect", async () => {
    const fixture = await createApprovedPreparation();
    const result = transactionResult("rolled-back");
    result.files = result.files.map((file) => ({ ...file, restoredVersion: `${file.beforeVersion}-restored` }));

    const recorded = await fixture.execution.record({
      requestId: fixture.requestId,
      preparationId: fixture.preparation.preparationId,
      executedBy: "human",
      documentApplied: false,
      sourceResults: [],
      transactionResult: result,
    });

    expect(recorded.execution?.status).toBe("failed");
    expect(recorded.execution?.sourceResults.every((entry) => entry.result.status === "rolled-back")).toBe(true);
  });
});

async function createApprovedPreparation(): Promise<{
  readonly requestId: string;
  readonly preparation: ReviewedExecutionPreparation;
  readonly execution: ReviewedExecutionService;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "afrodite-reviewed-transaction-"));
  roots.push(root);
  const collaboration = new ProjectCollaborationStore(root, () => Date.parse("2026-07-27T06:00:00.000Z"));
  await collaboration.publishSession({ sessionId: "studio-transaction", revision: 7, document });
  const submitted = await collaboration.submitReview(reviewInput(document));
  const approved = await collaboration.decideReview({
    requestId: submitted.requestId,
    decision: "approved",
    decidedBy: "human",
  });
  const preparation = transactionPreparation(document);
  await collaboration.saveExecutionPreparation(approved.requestId, preparation);
  const execution = new ReviewedExecutionService({
    collaboration,
    projectBridge: new ProjectBridgeService({ projectRoot: root }),
  });
  return { requestId: approved.requestId, preparation, execution };
}

function reviewInput(current: UiDocument): HumanReviewSubmitRequest {
  return {
    requestId: "review-transaction",
    actor: "codex",
    createdAt: "2026-07-27T06:00:00.000Z",
    expiresAt: "2026-07-27T06:15:00.000Z",
    plan: {
      apiVersion: 1,
      planId: "semantic-approved-transaction",
      documentVersion: createSemanticDocumentVersion(current),
      status: "ready",
      applicationMode: "document-and-source",
      capabilities: {
        documentMutation: false,
        sourcePlanning: true,
        sourceRepresentation: "inline",
        requirements: [],
      },
      diagnostics: [],
      sourcePlans: sourcePlans(),
    },
    command: { type: "explain_unpatchable_region", nodeId: "node.root" },
  };
}

function transactionPreparation(current: UiDocument): ReviewedExecutionPreparation {
  const transaction = transactionPlan();
  return {
    preparationId: "preparation-transaction",
    preparedAt: "2026-07-27T06:03:00.000Z",
    preparedBy: "human",
    liveSessionId: "studio-transaction",
    liveRevision: 7,
    liveDocumentVersion: createSemanticDocumentVersion(current),
    plan: {
      apiVersion: 1,
      planId: "semantic-fresh-transaction",
      documentVersion: createSemanticDocumentVersion(current),
      status: "ready",
      applicationMode: "document-and-source",
      capabilities: {
        documentMutation: false,
        sourcePlanning: true,
        sourceRepresentation: "inline",
        requirements: [],
      },
      diagnostics: [],
      sourcePlans: sourcePlans(),
    },
    comparison: {
      exactMatch: true,
      applicationModeMatches: true,
      document: { status: "none" },
      sources: sourcePlans().map((plan) => ({
        repositoryPath: plan.repositoryPath,
        status: "identical" as const,
        approvedPlanId: plan.planId,
        freshPlanId: plan.planId,
        approvedSourceVersion: plan.sourceVersion,
        freshSourceVersion: plan.sourceVersion,
      })),
      summary: "Fresh transaction matches the approved effects.",
    },
    transaction,
  };
}

function sourcePlans() {
  const verification = [{ kind: "typecheck" as const, command: "pnpm typecheck", required: true }];
  return [
    {
      planId: "plan-app",
      repositoryPath: "src/App.tsx",
      sourceVersion: "app-v1",
      changed: true,
      diff: "@@ -1 +1 @@\n-old app\n+new app",
      diagnostics: [],
      verification,
    },
    {
      planId: "plan-theme",
      repositoryPath: "src/theme.css",
      sourceVersion: "theme-v1",
      changed: true,
      diff: "@@ -1 +1 @@\n-old theme\n+new theme",
      diagnostics: [],
      verification,
    },
  ];
}

function transactionPlan(): BridgeTransactionPlanView {
  return {
    transactionId: "transaction-reviewed",
    files: sourcePlans().map(({ verification: _verification, ...file }) => file),
    changedFiles: 2,
    diagnostics: [],
    verification: [{ kind: "typecheck", command: "pnpm typecheck", required: true }],
  };
}

function transactionResult(
  status: BridgeTransactionApplyResult["status"],
): BridgeTransactionApplyResult {
  return {
    status,
    transactionId: "transaction-reviewed",
    files: [
      {
        repositoryPath: "src/App.tsx",
        beforeVersion: "app-v1",
        afterVersion: "app-v2",
      },
      {
        repositoryPath: "src/theme.css",
        beforeVersion: "theme-v1",
        afterVersion: "theme-v2",
      },
    ],
    diagnostics: [],
    verification: [{
      step: { kind: "typecheck", command: "pnpm typecheck", required: true },
      ok: status === "applied",
      exitCode: status === "applied" ? 0 : 1,
      stdout: "",
      stderr: status === "applied" ? "" : "failed",
    }],
  };
}
