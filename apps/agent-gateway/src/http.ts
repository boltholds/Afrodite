import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { pathToFileURL } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { SemanticOnlyProjectBridgeClient } from "./bridgeClient.js";
import { createAgentGatewaySession, type AgentGatewaySession } from "./runtime.js";

export interface HttpGatewayOptions {
  readonly host: string;
  readonly port: number;
  readonly bridgeUrl: string;
  readonly token: string;
  readonly actor: string;
  readonly allowedHosts: ReadonlySet<string>;
  readonly maxBodyBytes: number;
}

export interface ActiveSession {
  readonly transport: StreamableHTTPServerTransport;
  readonly runtime: AgentGatewaySession;
}

export async function runHttpGateway(): Promise<void> {
  const options = parseOptions(process.argv.slice(2), process.env);
  const sessions = new Map<string, ActiveSession>();
  const bridgeProbe = new SemanticOnlyProjectBridgeClient(options.bridgeUrl, options.token);
  const server = createHttpGateway(options, sessions, bridgeProbe);

  server.listen(options.port, options.host, () => {
    console.error(`[afrodite-agent-gateway] Streamable HTTP listening at http://${options.host}:${options.port}/mcp`);
    console.error(`[afrodite-agent-gateway] project bridge: ${options.bridgeUrl}`);
    console.error(`[afrodite-agent-gateway] allowed hosts: ${[...options.allowedHosts].join(", ")}`);
    console.error("[afrodite-agent-gateway] HTTP transport exposes the same read/plan/review-request tools as stdio");
    console.error("[afrodite-agent-gateway] no filesystem, shell, write, apply, execution, or approval-decision tools are exposed");
  });

  const shutdown = async () => {
    server.close();
    await Promise.allSettled([...sessions.values()].flatMap(({ transport, runtime }) => [
      transport.close(),
      runtime.server.close(),
    ]));
    sessions.clear();
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}

export function createHttpGateway(
  options: HttpGatewayOptions,
  sessions: Map<string, ActiveSession>,
  bridgeProbe: SemanticOnlyProjectBridgeClient,
): Server {
  return createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");

    if (!isAllowedHost(request, options.allowedHosts)) {
      sendJson(response, 421, { ok: false, error: "HOST_NOT_ALLOWED" });
      return;
    }

    const url = new URL(request.url ?? "/", "http://localhost");
    if (request.method === "GET" && url.pathname === "/healthz") {
      sendJson(response, 200, {
        ok: true,
        service: "afrodite-agent-gateway",
        transport: "streamable-http",
        sessions: sessions.size,
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/readyz") {
      try {
        const document = await bridgeProbe.readDocument();
        sendJson(response, 200, {
          ok: true,
          bridgeUrl: options.bridgeUrl,
          documentId: document.id,
          schemaVersion: document.schemaVersion,
        });
      } catch (error) {
        sendJson(response, 503, {
          ok: false,
          error: error instanceof Error ? error.message : "Live Studio session is unavailable.",
        });
      }
      return;
    }

    if (url.pathname !== "/mcp") {
      sendJson(response, 404, { ok: false, error: "ROUTE_NOT_FOUND" });
      return;
    }

    try {
      if (request.method === "POST") {
        const body = await readJsonBody(request, options.maxBodyBytes);
        const sessionId = readSessionId(request);
        let active = sessionId ? sessions.get(sessionId) : undefined;

        if (!active) {
          if (sessionId) {
            sendMcpError(response, 404, "Unknown or expired MCP session.");
            return;
          }
          if (!isInitializeRequest(body)) {
            sendMcpError(response, 400, "An MCP initialize request is required to create a session.");
            return;
          }
          active = await createSession(options, sessions);
        }

        await active.transport.handleRequest(request, response, body);
        return;
      }

      if (request.method === "GET" || request.method === "DELETE") {
        const sessionId = readSessionId(request);
        const active = sessionId ? sessions.get(sessionId) : undefined;
        if (!active) {
          sendMcpError(response, 400, "A valid Mcp-Session-Id header is required.");
          return;
        }
        await active.transport.handleRequest(request, response);
        return;
      }

      response.setHeader("Allow", "GET, POST, DELETE");
      sendMcpError(response, 405, "Method not allowed.");
    } catch (error) {
      console.error(`[afrodite-agent-gateway] HTTP request failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
      if (!response.headersSent) {
        sendMcpError(response, 500, "Internal MCP gateway error.");
      } else if (!response.writableEnded) {
        response.end();
      }
    }
  });
}

async function createSession(
  options: HttpGatewayOptions,
  sessions: Map<string, ActiveSession>,
): Promise<ActiveSession> {
  const runtime = await createAgentGatewaySession({
    bridgeUrl: options.bridgeUrl,
    token: options.token,
    actor: options.actor,
  });
  let initializedSessionId: string | undefined;
  let active: ActiveSession;
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: randomUUID,
    enableJsonResponse: true,
    onSessionInitialized: (sessionId) => {
      initializedSessionId = sessionId;
      sessions.set(sessionId, active);
      console.error(`[afrodite-agent-gateway] initialized HTTP MCP session ${sessionId} (${runtime.context.sessionId})`);
    },
  });
  active = { transport, runtime };
  transport.onclose = () => {
    if (initializedSessionId) sessions.delete(initializedSessionId);
    void runtime.server.close();
  };
  await runtime.server.connect(transport);
  return active;
}

export function parseOptions(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): HttpGatewayOptions {
  const host = valueAfter(argv, "--host") ?? env.AFRODITE_MCP_HOST ?? "0.0.0.0";
  const portSource = valueAfter(argv, "--port") ?? env.AFRODITE_MCP_PORT ?? "8770";
  const port = Number(portSource);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid AFRODITE_MCP_PORT: ${portSource}`);
  }
  const bridgeUrl = valueAfter(argv, "--bridge-url")
    ?? env.AFRODITE_BRIDGE_URL
    ?? "http://127.0.0.1:4175";
  if (!/^https?:\/\//.test(bridgeUrl)) throw new Error("AFRODITE_BRIDGE_URL must use http:// or https://.");
  const token = env.AFRODITE_BRIDGE_TOKEN;
  if (!token || token.length < 16) {
    throw new Error("AFRODITE_BRIDGE_TOKEN must contain the project bridge token.");
  }
  const actor = (valueAfter(argv, "--actor") ?? env.AFRODITE_AGENT_ACTOR ?? "tunnel-agent").trim();
  if (!actor) throw new Error("AFRODITE_AGENT_ACTOR must not be empty.");
  const allowedHostsSource = env.AFRODITE_MCP_ALLOWED_HOSTS
    ?? `127.0.0.1:${port},localhost:${port},agent-gateway:${port}`;
  const allowedHosts = new Set(allowedHostsSource.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
  if (allowedHosts.size === 0) throw new Error("AFRODITE_MCP_ALLOWED_HOSTS must contain at least one host.");
  const maxBodySource = env.AFRODITE_MCP_MAX_BODY_BYTES ?? "1048576";
  const maxBodyBytes = Number(maxBodySource);
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 1024 || maxBodyBytes > 10 * 1024 * 1024) {
    throw new Error("AFRODITE_MCP_MAX_BODY_BYTES must be between 1024 and 10485760.");
  }
  return { host, port, bridgeUrl, token, actor, allowedHosts, maxBodyBytes };
}

function valueAfter(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function isAllowedHost(request: IncomingMessage, allowedHosts: ReadonlySet<string>): boolean {
  const host = request.headers.host?.trim().toLowerCase();
  return Boolean(host && allowedHosts.has(host));
}

function readSessionId(request: IncomingMessage): string | undefined {
  const header = request.headers["mcp-session-id"];
  return Array.isArray(header) ? header[0] : header;
}

async function readJsonBody(request: IncomingMessage, maxBodyBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) throw new Error("MCP request body exceeds the configured limit.");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(payload)}\n`);
}

function sendMcpError(response: ServerResponse, status: number, message: string): void {
  sendJson(response, status, {
    jsonrpc: "2.0",
    error: { code: -32_000, message },
    id: null,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runHttpGateway().catch((error) => {
    console.error(`[afrodite-agent-gateway] ${error instanceof Error ? error.stack ?? error.message : "Startup failed."}`);
    process.exitCode = 1;
  });
}
