import { randomUUID } from "node:crypto";
import { PolicyControlledAgentGateway } from "@afrodite/agent-gateway-core";
import { PolicyControlledSemanticBatchGateway } from "@afrodite/agent-gateway-core/batch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SemanticOnlyProjectBridgeClient } from "./bridgeClient.js";
import { createAfroditeAgentMcpServer } from "./mcp.js";

export interface AgentGatewaySessionOptions {
  readonly bridgeUrl: string;
  readonly token: string;
  readonly actor: string;
  readonly sessionId?: string;
  readonly verifyLiveDocument?: boolean;
}

export interface AgentGatewaySession {
  readonly server: McpServer;
  readonly bridge: SemanticOnlyProjectBridgeClient;
  readonly context: {
    readonly actor: string;
    readonly sessionId: string;
  };
}

export async function createAgentGatewaySession(
  options: AgentGatewaySessionOptions,
): Promise<AgentGatewaySession> {
  const bridge = new SemanticOnlyProjectBridgeClient(options.bridgeUrl, options.token);
  if (options.verifyLiveDocument) await bridge.readDocument();

  const gateway = new PolicyControlledAgentGateway({
    documentProvider: bridge,
    semanticPlanner: bridge,
  });
  const batchGateway = new PolicyControlledSemanticBatchGateway({
    documentProvider: bridge,
    batchPlanner: bridge,
  });
  const context = {
    actor: options.actor,
    sessionId: options.sessionId ?? randomUUID(),
  };
  return {
    bridge,
    context,
    server: createAfroditeAgentMcpServer(gateway, batchGateway, context, bridge),
  };
}
