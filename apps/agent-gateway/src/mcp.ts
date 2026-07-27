import {
  PolicyControlledAgentGateway,
  type AgentGatewayCallContext,
  type AgentPlannedOperation,
} from "@afrodite/agent-gateway-core";
import {
  PolicyControlledSemanticBatchGateway,
  type AgentPlannedSemanticBatch,
} from "@afrodite/agent-gateway-core/batch";
import { semanticOperationCommandSchema } from "@afrodite/protocol";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type {
  AgentReviewClient,
  AgentSemanticBatchReviewClient,
} from "./bridgeClient.js";

export const AFRODITE_AGENT_MCP_TOOLS = [
  "afrodite_list_semantic_operations",
  "afrodite_inspect_policy",
  "afrodite_inspect_document",
  "afrodite_plan_semantic_operation",
  "afrodite_request_human_approval",
  "afrodite_get_approval_request",
  "afrodite_plan_semantic_batch",
  "afrodite_request_semantic_batch_review",
  "afrodite_get_semantic_batch_review",
] as const;

type ReviewClient = AgentReviewClient & AgentSemanticBatchReviewClient;

export function createAfroditeAgentMcpServer(
  gateway: PolicyControlledAgentGateway,
  batchGateway: PolicyControlledSemanticBatchGateway,
  context: AgentGatewayCallContext,
  reviewClient?: ReviewClient,
): McpServer {
  const server = new McpServer({
    name: "afrodite-agent-gateway",
    version: "0.3.0",
  });
  const plannedOperations = new Map<string, AgentPlannedOperation>();
  const plannedBatches = new Map<string, AgentPlannedSemanticBatch>();

  server.registerTool(
    "afrodite_list_semantic_operations",
    {
      description: "List the constrained Afrodite semantic commands available to an agent. This tool cannot mutate UI IR or source code.",
      inputSchema: {},
    },
    async () => toolResult(() => gateway.listSemanticOperations(context)),
  );

  server.registerTool(
    "afrodite_inspect_policy",
    {
      description: "Inspect the active single-operation and semantic-batch agent policies, limits, and explicitly denied capabilities.",
      inputSchema: {},
    },
    async () => toolResult(() => ({
      singleOperation: gateway.inspectPolicy(context),
      semanticBatch: batchGateway.inspectPolicy(),
    })),
  );

  server.registerTool(
    "afrodite_inspect_document",
    {
      description: "Inspect the current sanitized, bounded Studio project session. Prop values and source excerpts are redacted.",
      inputSchema: {
        nodeId: z.string().min(1).optional(),
        maxDepth: z.number().int().nonnegative().optional(),
      },
    },
    async ({ nodeId, maxDepth }) => toolResult(() => gateway.inspectDocument(
      {
        ...(nodeId ? { nodeId } : {}),
        ...(maxDepth === undefined ? {} : { maxDepth }),
      },
      context,
    )),
  );

  server.registerTool(
    "afrodite_plan_semantic_operation",
    {
      description: "Create a dry-run semantic plan against the current live Studio document. The tool never applies the plan.",
      inputSchema: {
        command: semanticOperationCommandSchema,
      },
    },
    async ({ command }) => toolResult(async () => {
      const planned = await gateway.planSemanticOperation(command, context);
      plannedOperations.set(planned.plan.planId, planned);
      return planned;
    }),
  );

  server.registerTool(
    "afrodite_request_human_approval",
    {
      description: "Submit a pending review request to Afrodite Studio for a semantic plan produced by this gateway process. This tool cannot approve or apply the plan.",
      inputSchema: {
        semanticPlanId: z.string().min(1),
        rationale: z.string().max(2_000).optional(),
      },
    },
    async ({ semanticPlanId, rationale }) => toolResult(async () => {
      const local = gateway.requestHumanApproval(
        semanticPlanId,
        rationale,
        context,
      );
      if (!reviewClient) return local;
      const planned = plannedOperations.get(semanticPlanId);
      if (!planned) throw new Error("The exact dry-run plan is no longer available in this MCP session.");
      return reviewClient.submitReview({
        requestId: local.requestId,
        actor: local.actor,
        ...(local.sessionId ? { agentSessionId: local.sessionId } : {}),
        createdAt: local.createdAt,
        expiresAt: local.expiresAt,
        ...(local.rationale ? { rationale: local.rationale } : {}),
        plan: planned.plan,
        command: planned.command,
      });
    }),
  );

  server.registerTool(
    "afrodite_get_approval_request",
    {
      description: "Read the human inbox status of a review request. No approval decision can be made through MCP.",
      inputSchema: {
        requestId: z.string().min(1),
      },
    },
    async ({ requestId }) => toolResult(() => reviewClient
      ? reviewClient.getReview(requestId)
      : gateway.getApprovalRequest(requestId, context)),
  );

  server.registerTool(
    "afrodite_plan_semantic_batch",
    {
      description: "Dry-run a bounded ordered list of existing typed semantic commands. The result contains one combined document effect and, when proven, one atomic source transaction. Nothing is applied.",
      inputSchema: {
        commands: semanticOperationCommandSchema.array().min(1).max(16),
      },
    },
    async ({ commands }) => toolResult(async () => {
      const planned = await batchGateway.planSemanticBatch(commands, context);
      plannedBatches.set(planned.batch.batchId, planned);
      return planned;
    }),
  );

  server.registerTool(
    "afrodite_request_semantic_batch_review",
    {
      description: "Submit one exact batch dry run to the durable Afrodite Studio batch-review inbox. The tool cannot approve or execute it.",
      inputSchema: {
        batchId: z.string().min(1),
        rationale: z.string().max(2_000).optional(),
      },
    },
    async ({ batchId, rationale }) => toolResult(async () => {
      const local = batchGateway.requestSemanticBatchReview(batchId, rationale, context);
      if (!reviewClient) return local;
      const planned = plannedBatches.get(batchId);
      if (!planned) throw new Error("The exact semantic batch is no longer available in this MCP session.");
      return reviewClient.submitSemanticBatchReview({
        requestId: local.requestId,
        actor: local.actor,
        ...(local.sessionId ? { agentSessionId: local.sessionId } : {}),
        createdAt: local.createdAt,
        expiresAt: local.expiresAt,
        ...(local.rationale ? { rationale: local.rationale } : {}),
        batch: planned.batch,
      });
    }),
  );

  server.registerTool(
    "afrodite_get_semantic_batch_review",
    {
      description: "Read the durable human decision for a semantic batch review request. This tool cannot make the decision or apply the batch.",
      inputSchema: {
        requestId: z.string().min(1),
      },
    },
    async ({ requestId }) => toolResult(() => reviewClient
      ? reviewClient.getSemanticBatchReview(requestId)
      : batchGateway.getSemanticBatchReview(requestId, context)),
  );

  return server;
}

async function toolResult<T>(operation: () => T | Promise<T>) {
  try {
    const value = await operation();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    };
  } catch (error) {
    const candidate = error as { code?: string; message?: string };
    return {
      isError: true,
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          ok: false,
          error: {
            code: candidate.code ?? "AFRODITE_AGENT_TOOL_FAILED",
            message: candidate.message ?? "The agent gateway tool failed.",
          },
        }, null, 2),
      }],
    };
  }
}
