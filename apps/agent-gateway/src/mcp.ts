import {
  PolicyControlledAgentGateway,
  type AgentGatewayCallContext,
} from "@afrodite/agent-gateway-core";
import { semanticOperationCommandSchema } from "@afrodite/protocol";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const AFRODITE_AGENT_MCP_TOOLS = [
  "afrodite_list_semantic_operations",
  "afrodite_inspect_policy",
  "afrodite_inspect_document",
  "afrodite_plan_semantic_operation",
  "afrodite_request_human_approval",
  "afrodite_get_approval_request",
] as const;

export function createAfroditeAgentMcpServer(
  gateway: PolicyControlledAgentGateway,
  context: AgentGatewayCallContext,
): McpServer {
  const server = new McpServer({
    name: "afrodite-agent-gateway",
    version: "0.1.0",
  });

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
      description: "Inspect the active agent gateway policy, limits, and explicitly denied capabilities.",
      inputSchema: {},
    },
    async () => toolResult(() => gateway.inspectPolicy(context)),
  );

  server.registerTool(
    "afrodite_inspect_document",
    {
      description: "Inspect a sanitized, bounded Semantic UI IR tree. Prop values and source excerpts are redacted.",
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
      description: "Create a dry-run semantic plan through Afrodite's existing binding, ownership, adapter, diff, and verification boundaries. The tool never applies the plan.",
      inputSchema: {
        command: semanticOperationCommandSchema,
      },
    },
    async ({ command }) => toolResult(() => gateway.planSemanticOperation(command, context)),
  );

  server.registerTool(
    "afrodite_request_human_approval",
    {
      description: "Create a pending human approval request for a semantic plan produced by this gateway process. This tool cannot approve or apply the plan.",
      inputSchema: {
        semanticPlanId: z.string().min(1),
        rationale: z.string().max(2_000).optional(),
      },
    },
    async ({ semanticPlanId, rationale }) => toolResult(() => gateway.requestHumanApproval(
      semanticPlanId,
      rationale,
      context,
    )),
  );

  server.registerTool(
    "afrodite_get_approval_request",
    {
      description: "Read the pending or expired status of a previously created approval request. No approval decision can be made through MCP.",
      inputSchema: {
        requestId: z.string().min(1),
      },
    },
    async ({ requestId }) => toolResult(() => gateway.getApprovalRequest(requestId, context)),
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
