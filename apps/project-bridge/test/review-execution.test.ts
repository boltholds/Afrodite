import { describe, expect, it } from "vitest";
import type {
  BridgePatchPlanView,
  HumanReviewRequest,
  SemanticPlanView,
} from "@afrodite/protocol";
import { parseUiDocument } from "@afrodite/ui-ir";
import { compareReviewedEffects } from "../src/reviewExecution.js";

const before = parseUiDocument({
  schemaVersion: 1,
  id: "document.review",
  name: "Before",
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

const after = parseUiDocument({
  ...before,
  name: "After",
  root: {
    ...before.root,
    layout: { ...before.root.layout, display: "grid" },
  },
});

const sourcePlan: BridgePatchPlanView = {
  planId: "source-approved",
  repositoryPath: "src/App.tsx",
  sourceVersion: "source-v1",
  changed: true,
  diff: "@@ -1 +1 @@\n-flex\n+grid",
  diagnostics: [],
  verification: [{ kind: "typecheck", command: "pnpm typecheck", required: true }],
};

const review: HumanReviewRequest = {
  requestId: "review-1",
  status: "approved",
  actor: "codex",
  createdAt: "2026-07-27T05:00:00.000Z",
  expiresAt: "2026-07-27T05:15:00.000Z",
  semanticPlanId: "semantic-approved",
  documentVersion: "document-v1",
  command: { type: "convert_to_grid", nodeId: "node.root" },
  applicationMode: "document-and-source",
  documentAfter: after,
  sourcePlans: [sourcePlan],
  decision: {
    decision: "approved",
    decidedAt: "2026-07-27T05:02:00.000Z",
    decidedBy: "human",
  },
};

function freshPlan(overrides: Partial<SemanticPlanView> = {}): SemanticPlanView {
  return {
    apiVersion: 1,
    planId: "semantic-fresh",
    documentVersion: "document-v1",
    status: "ready",
    applicationMode: "document-and-source",
    capabilities: {
      documentMutation: true,
      sourcePlanning: true,
      sourceRepresentation: "inline",
      requirements: [],
    },
    diagnostics: [],
    documentAfter: after,
    sourcePlans: [{ ...sourcePlan, planId: "source-fresh" }],
    ...overrides,
  };
}

describe("reviewed execution comparison", () => {
  it("treats regenerated plan IDs as the same reviewed effect", () => {
    const comparison = compareReviewedEffects(review, freshPlan());
    expect(comparison.exactMatch).toBe(true);
    expect(comparison.document.status).toBe("identical");
    expect(comparison.sources[0]?.status).toBe("identical");
  });

  it("surfaces document and source drift independently", () => {
    const changedDocument = parseUiDocument({
      ...after,
      root: {
        ...after.root,
        layout: { ...after.root.layout, gap: 24 },
      },
    });
    const comparison = compareReviewedEffects(review, freshPlan({
      documentAfter: changedDocument,
      sourcePlans: [{
        ...sourcePlan,
        planId: "source-fresh",
        sourceVersion: "source-v2",
        diff: "@@ -1 +1 @@\n-flex\n+grid gap-6",
      }],
    }));

    expect(comparison.exactMatch).toBe(false);
    expect(comparison.document.status).toBe("changed");
    expect(comparison.sources[0]?.status).toBe("changed");
  });

  it("blocks exact execution when fresh semantic planning is not ready", () => {
    const comparison = compareReviewedEffects(review, freshPlan({
      status: "blocked",
      documentAfter: undefined,
      sourcePlans: [],
    }));
    expect(comparison.exactMatch).toBe(false);
    expect(comparison.summary).toContain("blocked");
  });
});
