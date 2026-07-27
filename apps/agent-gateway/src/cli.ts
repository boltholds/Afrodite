import { randomUUID } from "node:crypto";
import {
  PolicyControlledAgentGateway,
} from "@afrodite/agent-gateway-core";
import {
  PolicyControlledSemanticBatchGateway,
} from "@afrodite/agent-gateway-core/batch";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SemanticOnlyProjectBridgeClient } from "./bridgeClient.js";
import { createAfroditeAgentMcpServer } from "./mcp.js";

interface CliOptions {
  readonly bridgeUrl: string;
  readonly tokenEnv: string;
  readonly actor: string;
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const token = process.env[options.tokenEnv];
  if (!token || token.length < 16) {
    throw new Error(`Environment variable ${options.tokenEnv} must contain the local project bridge session token.`);
  }

  const bridge = new SemanticOnlyProjectBridgeClient(options.bridgeUrl, token);
  await bridge.readDocument();
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
    sessionId: randomUUID(),
  };
  const server = createAfroditeAgentMcpServer(gateway, batchGateway, context, bridge);
  const transport = new StdioServerTransport();

  console.error(`[afrodite-agent-gateway] policy-controlled stdio session ${context.sessionId}`);
  console.error(`[afrodite-agent-gateway] live Studio document from ${options.bridgeUrl}`);
  console.error("[afrodite-agent-gateway] bridge token remains process-private");
  console.error("[afrodite-agent-gateway] no filesystem, shell, apply, transaction, or approval-decision tools are exposed");

  await server.connect(transport);
}

function parseArguments(args: readonly string[]): CliOptions {
  let bridgeUrl = "http://127.0.0.1:4175";
  let tokenEnv = "AFRODITE_BRIDGE_TOKEN";
  let actor = "mcp-agent";

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    switch (argument) {
      case "--bridge-url":
        bridgeUrl = requireValue(argument, value);
        index += 1;
        break;
      case "--bridge-token-env":
        tokenEnv = requireValue(argument, value);
        index += 1;
        break;
      case "--actor":
        actor = requireValue(argument, value);
        index += 1;
        break;
      case "--help":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument ${argument ?? "<empty>"}. Use --help for usage.`);
    }
  }

  if (!/^https?:\/\//.test(bridgeUrl)) throw new Error("--bridge-url must be an explicit http:// or https:// URL.");
  if (!/^[A-Z_][A-Z0-9_]*$/.test(tokenEnv)) throw new Error("--bridge-token-env must be an environment-variable name.");
  if (!actor.trim()) throw new Error("--actor must not be empty.");

  return { bridgeUrl, tokenEnv, actor: actor.trim() };
}

function requireValue(argument: string, value: string | undefined): string {
  if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
  return value;
}

function printHelp(): void {
  console.error(`Afrodite policy-controlled MCP agent gateway\n\nUsage:\n  pnpm dev:agent [options]\n\nOptions:\n  --bridge-url <url>          Project bridge URL (default http://127.0.0.1:4175)\n  --bridge-token-env <name>   Environment variable holding the bridge token\n  --actor <name>              Audit actor label (default mcp-agent)\n\nStudio must be connected and must have published its live project session. The gateway exposes inspection, single and batch dry-run planning, and human review-request tools only.`);
}

main().catch((error) => {
  console.error(`[afrodite-agent-gateway] ${error instanceof Error ? error.message : "Startup failed."}`);
  process.exitCode = 1;
});
