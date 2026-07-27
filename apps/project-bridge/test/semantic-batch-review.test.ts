import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSemanticDocumentVersion } from "@afrodite/semantic-ops";
import { parseUiDocument } from "@afrodite/ui-ir";
import { ProjectCollaborationStore } from "../src/collaboration.js";
import {
  SemanticBatchReviewError,
  SemanticBatchReviewStore,
} from "../src/semanticBatchReview.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const document = parseUiDocument({
  schemaVersion: 1,
  id: "document.batch-review-store",
  name: "Batch review store",
  root: {
    id: "node.root",
    kind: "element",
    element: "main",
    name: "Root",
    layout: {
      display: "flex",
      direction: "column",
      sizing: { width: "fill", height: "fill" },
    },
    props: {},
    children: [],
  },
});

function batch() {
  return {
    apiVersion: 1 as const,
    semanticApiVersion: 1 as const,
    batchId: "semantic-batch:store",
    documentVersion: createSemanticDocumentVersion(document),
    status: "ready" as const,
    applicationMode: "document-only" as const,
    commands: [{ type: "convert_to_grid" as const, nodeId: "node.root" }],
    steps: [{
      index: 0,
      command: { type: "convert_to_grid" as const, nodeId: "node.root" },
      planId: "semantic:step",
      status: "ready" as const,
      applicationMode: "document-only" as const,
      documentVersionBefore: createSemanticDocumentVersion(document),
      documentVersionAfter: "ui-fnv1a32:after",
      sourceIntentCount: 0,
      diagnostics: [],
    }],
    diagnostics: [],
    sourcePlans: [],
    documentAfter: parseUiDocument({
      ...document,
      root: {
        ...document.root,
        layout: { ...document.root.layout, display: "grid" as const },
      },
    }),
  };
}

async function fixture(now: () => number = Date.now) {
  const root = await mkdtemp(path.join(os.tmpdir(), "afrodite-batch-review-"));
  roots.push(root);
  const collaboration = new ProjectCollaborationStore(root, now);
  await collaboration.publishSession({
    sessionId: "studio-session",
    revision: 3,
    document,
  });
  return {
    root,
    collaboration,
    store: new SemanticBatchReviewStore(root, collaboration, now),
  };
}

describe("durable semantic batch review store", () => {
  it("persists an exact pending batch and reloads it from a new store instance", async () => {
    const { root, collaboration, store } = await fixture();
    const created = await store.submit({
      requestId: "batch-review-1",
      actor: "codex",
      agentSessionId: "agent-session",
      createdAt: "2026-07-27T08:00:00.000Z",
      expiresAt: "2026-07-27T09:00:00.000Z",
      rationale: "Coordinated update",
      batch: batch(),
    });

    const restored = new SemanticBatchReviewStore(root, collaboration);
    expect((await restored.get(created.requestId)).batch).toEqual(batch());
    const persisted = JSON.parse(await readFile(
      path.join(root, ".afrodite", "semantic-batch-reviews.json"),
      "utf8",
    )) as { requests: unknown[] };
    expect(persisted.requests).toHaveLength(1);
  });

  it("rejects stale batch submissions and stale human decisions", async () => {
    const { collaboration, store } = await fixture();
    const stale = batch();
    stale.documentVersion = "ui-fnv1a32:stale";
    await expect(store.submit({
      requestId: "batch-review-stale",
      actor: "codex",
      createdAt: "2026-07-27T08:00:00.000Z",
      expiresAt: "2026-07-27T09:00:00.000Z",
      batch: stale,
    })).rejects.toMatchObject({ code: "SEMANTIC_BATCH_REVIEW_STALE" });

    await store.submit({
      requestId: "batch-review-current",
      actor: "codex",
      createdAt: "2026-07-27T08:00:00.000Z",
      expiresAt: "2026-07-27T09:00:00.000Z",
      batch: batch(),
    });
    await collaboration.publishSession({
      sessionId: "studio-session",
      revision: 4,
      document: parseUiDocument({ ...document, name: "Changed" }),
    });
    await expect(store.decide({
      requestId: "batch-review-current",
      decision: "approved",
      decidedBy: "reviewer",
    })).rejects.toMatchObject({ code: "SEMANTIC_BATCH_REVIEW_STALE" });
  });

  it("records one irreversible human decision without executing effects", async () => {
    const { store } = await fixture();
    await store.submit({
      requestId: "batch-review-decision",
      actor: "codex",
      createdAt: "2026-07-27T08:00:00.000Z",
      expiresAt: "2026-07-27T09:00:00.000Z",
      batch: batch(),
    });
    const approved = await store.decide({
      requestId: "batch-review-decision",
      decision: "approved",
      decidedBy: "reviewer",
      note: "Reviewed exact batch and diffs.",
    });
    expect(approved.status).toBe("approved");
    expect(approved.decision?.decision).toBe("approved");
    await expect(store.decide({
      requestId: "batch-review-decision",
      decision: "rejected",
      decidedBy: "reviewer",
    })).rejects.toBeInstanceOf(SemanticBatchReviewError);
  });

  it("expires pending requests", async () => {
    let now = Date.parse("2026-07-27T08:00:00.000Z");
    const fixtureState = await fixture(() => now);
    await fixtureState.store.submit({
      requestId: "batch-review-expiry",
      actor: "codex",
      createdAt: "2026-07-27T08:00:00.000Z",
      expiresAt: "2026-07-27T08:15:00.000Z",
      batch: batch(),
    });
    now = Date.parse("2026-07-27T08:15:00.001Z");
    expect((await fixtureState.store.get("batch-review-expiry")).status).toBe("expired");
  });
});
