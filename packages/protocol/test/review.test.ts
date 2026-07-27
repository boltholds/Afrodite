import { describe, expect, it } from "vitest";
import {
  humanReviewRequestSchema,
  liveSessionPublishRequestSchema,
  reviewedExecutionPreparationSchema,
  reviewedExecutionRecordSchema,
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

const semanticPlan = {
  apiVersion: 1 as const,
  planId: "semantic-fresh",
  documentVersion: "ui-fnv1a32:before",
  status: "ready" as const,
  applicationMode: "document-only" as const,
  capabilities: {
    documentMutation: true,
    sourcePlanning: false,
    requirements: [],
  },
  diagnostics: [],
  documentAfter: document,
  sourcePlans: [],
};

const verificationStep = {
  kind: "typecheck" as const,
  command: "pnpm typecheck",
  required: true,
};

const transactionFiles = [
  {
    planId: "plan-app",
    repositoryPath: "src/App.tsx",
    sourceVersion: "app-v1",
    changed: true,
    diff: "@@ app",
    diagnostics: [],
  },
  {
    planId: "plan-theme",
    repositoryPath: "src/theme.css",
    sourceVersion: "theme-v1",
    changed: true,
    diff: "@@ theme",
    diagnostics: [],
  },
];

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

  it("validates a fresh preparation and an independent execution receipt", () => {
    const preparation = reviewedExecutionPreparationSchema.parse({
      preparationId: "preparation-1",
      preparedAt: "2026-07-27T04:05:00.000Z",
      preparedBy: "human",
      liveSessionId: "studio-1",
      liveRevision: 8,
      liveDocumentVersion: "ui-fnv1a32:before",
      plan: semanticPlan,
      comparison: {
        exactMatch: true,
        applicationModeMatches: true,
        document: {
          status: "identical",
          approvedDocumentVersion: "ui-fnv1a32:after",
          freshDocumentVersion: "ui-fnv1a32:after",
        },
        sources: [],
        summary: "Fresh effects match.",
      },
    });
    const execution = reviewedExecutionRecordSchema.parse({
      executionId: "execution-1",
      preparationId: preparation.preparationId,
      executedAt: "2026-07-27T04:06:00.000Z",
      executedBy: "human",
      status: "document-only",
      documentApplied: true,
      documentCommandId: "command:replace:1",
      documentRevision: 9,
      documentVersionAfter: "ui-fnv1a32:after",
      sourceResults: [],
    });

    expect(execution.status).toBe("document-only");
    expect(execution.preparationId).toBe(preparation.preparationId);
  });

  it("preserves one reviewed transaction and one shared durable receipt", () => {
    const sourcePlans = transactionFiles.map((file) => ({
      ...file,
      verification: [verificationStep],
    }));
    const preparation = reviewedExecutionPreparationSchema.parse({
      preparationId: "preparation-transaction",
      preparedAt: "2026-07-27T04:05:00.000Z",
      preparedBy: "human",
      liveSessionId: "studio-1",
      liveRevision: 8,
      liveDocumentVersion: "ui-fnv1a32:before",
      plan: {
        apiVersion: 1,
        planId: "semantic-transaction",
        documentVersion: "ui-fnv1a32:before",
        status: "ready",
        applicationMode: "document-and-source",
        capabilities: {
          documentMutation: false,
          sourcePlanning: true,
          sourceRepresentation: "inline",
          requirements: [],
        },
        diagnostics: [],
        sourcePlans,
      },
      comparison: {
        exactMatch: true,
        applicationModeMatches: true,
        document: { status: "none" },
        sources: transactionFiles.map((file) => ({
          repositoryPath: file.repositoryPath,
          status: "identical",
          approvedPlanId: file.planId,
          freshPlanId: file.planId,
          approvedSourceVersion: file.sourceVersion,
          freshSourceVersion: file.sourceVersion,
        })),
        summary: "Fresh transaction matches.",
      },
      transaction: {
        transactionId: "transaction-reviewed",
        files: transactionFiles,
        changedFiles: 2,
        diagnostics: [],
        verification: [verificationStep],
      },
    });

    const transactionResult = {
      status: "applied" as const,
      transactionId: "transaction-reviewed",
      files: [
        { repositoryPath: "src/App.tsx", beforeVersion: "app-v1", afterVersion: "app-v2" },
        { repositoryPath: "src/theme.css", beforeVersion: "theme-v1", afterVersion: "theme-v2" },
      ],
      diagnostics: [],
      verification: [{
        step: verificationStep,
        ok: true,
        exitCode: 0,
        stdout: "",
        stderr: "",
      }],
    };
    const execution = reviewedExecutionRecordSchema.parse({
      executionId: "execution-transaction",
      preparationId: preparation.preparationId,
      executedAt: "2026-07-27T04:06:00.000Z",
      executedBy: "human",
      status: "source-only",
      documentApplied: false,
      sourceResults: sourcePlans.map((plan, index) => ({
        planId: plan.planId,
        repositoryPath: plan.repositoryPath,
        sourceVersion: plan.sourceVersion,
        transactionId: transactionResult.transactionId,
        ...(index === 0 ? { transactionResult } : {}),
        result: {
          status: "applied",
          planId: plan.planId,
          beforeVersion: plan.sourceVersion,
          afterVersion: `${plan.sourceVersion}-after`,
          diagnostics: [],
          verification: transactionResult.verification,
        },
      })),
    });

    expect(preparation.transaction?.changedFiles).toBe(2);
    expect(execution.sourceResults.filter((entry) => entry.transactionResult)).toHaveLength(1);
    expect(execution.sourceResults.every((entry) => entry.transactionId === preparation.transaction?.transactionId)).toBe(true);
  });
});
