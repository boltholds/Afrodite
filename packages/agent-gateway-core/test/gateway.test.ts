import { describe, expect, it } from "vitest";
import type { SemanticPlanView } from "@afrodite/protocol";
import type { UiDocument } from "@afrodite/ui-ir";
import {
  DEFAULT_AGENT_GATEWAY_POLICY,
  PolicyControlledAgentGateway,
  type AgentGatewayPolicy,
} from "../src/index.js";

const document: UiDocument = {
  schemaVersion: 1,
  id: "doc.agent",
  name: "Agent fixture",
  root: {
    id: "root",
    name: "Root",
    kind: "element",
    element: "main",
    layout: { display: "flex", direction: "column", gap: 8, sizing: { width: "fill", height: "hug" } },
    props: { secret: "do-not-return", title: "Dashboard" },
    children: [
      {
        id: "card",
        name: "Card",
        kind: "element",
        element: "section",
        layout: { display: "block", direction: "column", sizing: { width: "fill", height: "hug" } },
        props: { apiKey: "hidden" },
        sourceBinding: {
          frameworkId: "react",
          adapterId: "afrodite.adapter.react",
          repositoryPath: "src/Card.tsx",
          stableMarker: "card.primary",
          styleOwnership: {
            strategy: "utility",
            dialect: "tailwind",
            attribute: "className",
            managedProperties: ["display", "gap"],
          },
        },
        children: [],
      },
      {
        id: "condition",
        name: "Conditional region",
        kind: "source-region",
        regionKind: "conditional",
        layout: { display: "block", direction: "column", sizing: { width: "hug", height: "hug" } },
        props: {},
        sourceRegion: {
          frameworkId: "react",
          adapterId: "afrodite.adapter.react",
          repositoryPath: "src/Card.tsx",
          sourceVersion: "fnv1a32:test",
          start: 10,
          end: 40,
          line: 2,
          column: 3,
          mode: "read-only",
          regionKind: "conditional",
          excerpt: "secret ? <A /> : <B />",
          reason: "Conditional rendering remains source-controlled.",
        },
        children: [],
      },
    ],
  },
};

describe("PolicyControlledAgentGateway", () => {
  it("returns a sanitized bounded document view", async () => {
    const gateway = createGateway();
    const inspection = await gateway.inspectDocument({}, { actor: "agent:test" });

    expect(inspection.root.propKeys).toEqual(["secret", "title"]);
    expect(JSON.stringify(inspection)).not.toContain("do-not-return");
    expect(JSON.stringify(inspection)).not.toContain("hidden");
    expect(JSON.stringify(inspection)).not.toContain("secret ? <A />");
    expect(inspection.root.children[0]?.binding?.repositoryPath).toBe("src/Card.tsx");
    expect(inspection.redactions).toHaveLength(3);
  });

  it("enforces inspection node and depth budgets", async () => {
    const policy: AgentGatewayPolicy = {
      ...DEFAULT_AGENT_GATEWAY_POLICY,
      maxInspectionNodes: 1,
      maxInspectionDepth: 1,
    };
    const gateway = createGateway(policy);
    const inspection = await gateway.inspectDocument({ maxDepth: 50 }, { actor: "agent:test" });

    expect(inspection.returnedNodes).toBe(1);
    expect(inspection.truncated).toBe(true);
    expect(inspection.root.children).toEqual([]);
    expect(inspection.root.omittedChildren).toBe(2);
  });

  it("stores a dry run and creates only a pending human approval request", async () => {
    const gateway = createGateway();
    const planned = await gateway.planSemanticOperation(
      { type: "convert_to_grid", nodeId: "card", gap: 16 },
      { actor: "agent:test", sessionId: "session-1" },
    );
    const request = gateway.requestHumanApproval(
      planned.plan.planId,
      "Please review the exact grid diff.",
      { actor: "agent:test", sessionId: "session-1" },
    );

    expect(planned.approvalEligible).toBe(true);
    expect(request.status).toBe("pending");
    expect(request.sourcePlans[0]?.planId).toBe("source-plan-1");
    expect(request.humanAction).toContain("cannot approve or apply");
    expect(gateway.getApprovalRequest(request.requestId, { actor: "agent:test" }).status).toBe("pending");
  });

  it("denies tools disabled by policy", () => {
    const gateway = createGateway({
      ...DEFAULT_AGENT_GATEWAY_POLICY,
      allowedTools: ["inspect_policy"],
    });

    expect(() => gateway.listSemanticOperations({ actor: "agent:test" })).toThrow(/disabled by policy/);
    expect(gateway.listAuditEvents().at(-1)?.outcome).toBe("denied");
  });

  it("rejects dry runs that exceed the diff policy", async () => {
    const gateway = createGateway({
      ...DEFAULT_AGENT_GATEWAY_POLICY,
      maxDiffCharacters: 4,
    });

    await expect(gateway.planSemanticOperation(
      { type: "convert_to_grid", nodeId: "card" },
      { actor: "agent:test" },
    )).rejects.toThrow(/diff contains/);
  });
});

function createGateway(policy: AgentGatewayPolicy = DEFAULT_AGENT_GATEWAY_POLICY) {
  return new PolicyControlledAgentGateway({
    documentProvider: { readDocument: async () => document },
    semanticPlanner: {
      planSemanticOperation: async (_document, command): Promise<SemanticPlanView> => ({
        planId: "semantic-plan-1",
        documentVersion: "ui-fnv1a32:test",
        status: "ready",
        applicationMode: "document-and-source",
        capabilities: {
          documentMutation: true,
          sourcePlanning: true,
          sourceRepresentation: "utility",
          requirements: [],
        },
        diagnostics: [],
        documentAfter: document,
        sourcePlans: [{
          planId: "source-plan-1",
          repositoryPath: "src/Card.tsx",
          sourceVersion: "fnv1a32:source",
          changed: true,
          diff: `--- src/Card.tsx\n+++ src/Card.tsx\n+${command.type}`,
          diagnostics: [],
          verification: [],
        }],
      }),
    },
    policy,
    now: () => Date.parse("2026-07-27T03:30:00.000Z"),
    idFactory: (() => {
      let id = 0;
      return () => String(++id);
    })(),
  });
}
