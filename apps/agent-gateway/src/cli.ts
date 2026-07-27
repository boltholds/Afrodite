import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  PolicyControlledAgentGateway,
  type AgentDocumentProvider,
} from "@afrodite/agent-gateway-core";
import { parseUiDocument, type UiDocument } from "@afrodite/ui-ir";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SemanticOnlyProjectBridgeClient } from "./bridgeClient.js";
import { createAfroditeAgentMcpServer } from "./mcp.js";

interface CliOptions {
  readonly documentPath: string;
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

  const document = await loadDocumentSnapshot(options.documentPath);
  const provider: AgentDocumentProvider = {
    readDocument: async () => cloneDocument(document),
  };
  const gateway = new PolicyControlledAgentGateway({
    documentProvider: provider,
    semanticPlanner: new SemanticOnlyProjectBridgeClient(options.bridgeUrl, token),
  });
  const context = {
    actor: options.actor,
    sessionId: randomUUID(),
  };
  const server = createAfroditeAgentMcpServer(gateway, context);
  const transport = new StdioServerTransport();

  console.error(`[afrodite-agent-gateway] policy-controlled stdio session ${context.sessionId}`);
  console.error(`[afrodite-agent-gateway] document ${path.resolve(options.documentPath)}`);
  console.error(`[afrodite-agent-gateway] bridge ${options.bridgeUrl}; token remains process-private`);
  console.error("[afrodite-agent-gateway] no filesystem, shell, apply, transaction, or approval-decision tools are exposed");

  await server.connect(transport);
}

function parseArguments(args: readonly string[]): CliOptions {
  let documentPath = "";
  let bridgeUrl = "http://127.0.0.1:4175";
  let tokenEnv = "AFRODITE_BRIDGE_TOKEN";
  let actor = "mcp-agent";

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    switch (argument) {
      case "--document":
        documentPath = requireValue(argument, value);
        index += 1;
        break;
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

  if (!documentPath) throw new Error("--document is required and must point to a reviewed Semantic UI IR JSON file.");
  if (!/^https?:\/\//.test(bridgeUrl)) throw new Error("--bridge-url must be an explicit http:// or https:// URL.");
  if (!/^[A-Z_][A-Z0-9_]*$/.test(tokenEnv)) throw new Error("--bridge-token-env must be an environment-variable name.");
  if (!actor.trim()) throw new Error("--actor must not be empty.");

  return { documentPath, bridgeUrl, tokenEnv, actor: actor.trim() };
}

function requireValue(argument: string, value: string | undefined): string {
  if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
  return value;
}

async function loadDocumentSnapshot(documentPath: string): Promise<UiDocument> {
  const raw = await readFile(path.resolve(documentPath), "utf8");
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    throw new Error(`Document ${documentPath} is not valid JSON.`);
  }
  return parseUiDocument(candidate);
}

function cloneDocument(document: UiDocument): UiDocument {
  return parseUiDocument(JSON.parse(JSON.stringify(document)));
}

function printHelp(): void {
  console.error(`Afrodite policy-controlled MCP agent gateway\n\nUsage:\n  pnpm dev:agent --document ./screen.afrodite.json [options]\n\nOptions:\n  --document <path>           Required reviewed Semantic UI IR snapshot\n  --bridge-url <url>          Project bridge URL (default http://127.0.0.1:4175)\n  --bridge-token-env <name>   Environment variable holding the bridge token\n  --actor <name>              Audit actor label (default mcp-agent)\n\nThe gateway exposes inspection, dry-run planning, and approval-request tools only.`);
}

main().catch((error) => {
  console.error(`[afrodite-agent-gateway] ${error instanceof Error ? error.message : "Startup failed."}`);
  process.exitCode = 1;
});
