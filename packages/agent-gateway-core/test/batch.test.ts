import { describe, expect, it } from "vitest";
import { parseUiDocument } from "@afrodite/ui-ir";
import {
  AgentSemanticBatchPolicyError,
  PolicyControlledSemanticBatchGateway,
} from "../src/batch";

const document = parseUiDocument({
  schemaVersion: 1,
  id: "document.agent-batch",
  name: "Agent batch",
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

const commands = [
  { type: "convert_to_grid" as const, nodeId: "node.root", gap: 16 },
];

function createGateway(overrides: {
  sourcePlans?: number;
  diffCharacters?: number;
  status?: "ready" | "blocked";
} = {}) {
  let now = Date.parse("2026-07-27T08:00:00.000Z");
  let id = 0;
  const sourcePlans = Array.from({ length: overrides.sourcePlans ?? 1 }, (_, index) => ({
    planId: `source-plan-${index}`,
    repositoryPath: `src/Target${index}.tsx`,
    sourceVersion: `source-v${index}`,
    changed: true,
    diff: "x".repeat(overrides.diffCharacters ?? 12),
    diagnostics: [],
    verification: [],
  }));
  const gateway = new PolicyControlledSemanticBatchGateway({
    documentProvider: { readDocument: async () => document },
    batchPlanner: {
      planSemanticBatch: async (_document, inputCommands) => ({
        apiVersion: 1,
        semanticApiVersion: 1,
        batchId: "semantic-batch:test",
        documentVersion: "ui-fnv1a32:test",
        status: overrides.status ?? "ready",
        applicationMode: sourcePlans.length > 0 ? "document-and-source" : "document-only",
        commands: inputCommands,
        steps: [],
        diagnostics: [],
        sourcePlans,
        ...(overrides.status === "blocked" ? {} : { documentAfter: document }),
      }),
    },
    now: () => now,
    idFactory: () => `id-${++id}`,
  });
  return {
    gateway,
    advance: (milliseconds: number) => { now += milliseconds; },
  };
}

const context = { actor: "codex", sessionId: "agent-session" };

describe("policy-controlled semantic batch gateway", () => {
  it("stores only batches created by the current gateway process", async () => {
    const { gateway } = createGateway();
    const planned = await gateway.planSemanticBatch(commands, context);
    expect(planned.reviewEligible).toBe(true);
    expect(planned.batch.batchId).toBe("semantic-batch:test");

    const request = gateway.requestSemanticBatchReview(
      planned.batch.batchId,
      "Convert the selected screen regions together.",
      context,
    );
    expect(request.status).toBe("pending");
    expect(request.batchId).toBe(planned.batch.batchId);
    expect(request.sourcePlans).toHaveLength(1);
    expect(request.humanAction).toMatch(/cannot decide or execute/i);
  });

  it("rejects forged or foreign batch IDs", () => {
    const { gateway } = createGateway();
    expect(() => gateway.requestSemanticBatchReview("semantic-batch:foreign", undefined, context))
      .toThrowError(AgentSemanticBatchPolicyError);
  });

  it("does not allow blocked batches to enter review", async () => {
    const { gateway } = createGateway({ status: "blocked" });
    const planned = await gateway.planSemanticBatch(commands, context);
    expect(planned.reviewEligible).toBe(false);
    expect(() => gateway.requestSemanticBatchReview(planned.batch.batchId, undefined, context))
      .toThrow(/cannot enter human review/i);
  });

  it("enforces command, source-plan, and diff budgets", async () => {
    const { gateway } = createGateway();
    await expect(gateway.planSemanticBatch(
      Array.from({ length: 17 }, () => commands[0]!),
      context,
    )).rejects.toMatchObject({ code: "AGENT_SEMANTIC_BATCH_COMMAND_LIMIT" });

    const tooManySources = createGateway({ sourcePlans: 9 }).gateway;
    await expect(tooManySources.planSemanticBatch(commands, context))
      .rejects.toMatchObject({ code: "AGENT_SEMANTIC_BATCH_SOURCE_PLAN_LIMIT" });

    const tooLargeDiff = createGateway({ diffCharacters: 80_001 }).gateway;
    await expect(tooLargeDiff.planSemanticBatch(commands, context))
      .rejects.toMatchObject({ code: "AGENT_SEMANTIC_BATCH_DIFF_LIMIT" });
  });

  it("expires pending local review requests", async () => {
    const { gateway, advance } = createGateway();
    const planned = await gateway.planSemanticBatch(commands, context);
    const request = gateway.requestSemanticBatchReview(planned.batch.batchId, undefined, context);
    advance(15 * 60_000 + 1);
    expect(gateway.getSemanticBatchReview(request.requestId, context).status).toBe("expired");
  });
});
