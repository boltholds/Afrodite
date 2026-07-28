import { createServer as createNodeServer, request, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { SemanticOnlyProjectBridgeClient } from "../src/bridgeClient.js";
import {
  createHttpGateway,
  parseOptions,
  type ActiveSession,
} from "../src/http.js";
import { AFRODITE_AGENT_MCP_TOOLS } from "../src/mcp.js";

const servers: Server[] = [];
const sessionMaps: Array<Map<string, ActiveSession>> = [];

const document = {
  schemaVersion: 1 as const,
  id: "document.http-test",
  name: "HTTP test document",
  root: {
    id: "root",
    name: "Root",
    kind: "element" as const,
    element: "div",
    layout: {
      display: "block" as const,
      direction: "column" as const,
      sizing: { width: "fill" as const, height: "hug" as const },
    },
    props: {},
    children: [],
  },
};

const token = "test-bridge-token-with-enough-entropy";

afterEach(async () => {
  for (const sessions of sessionMaps.splice(0)) {
    await Promise.allSettled([...sessions.values()].flatMap(({ transport, runtime }) => [
      transport.close(),
      runtime.server.close(),
    ]));
    sessions.clear();
  }
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("Streamable HTTP agent gateway", () => {
  it("creates a stateful session and exposes only the policy-controlled tool surface", async () => {
    const bridge = await startBridge();
    const sessions = new Map<string, ActiveSession>();
    sessionMaps.push(sessions);
    const gateway = createHttpGateway({
      host: "127.0.0.1",
      port: 8770,
      bridgeUrl: bridge.url,
      token,
      actor: "http-test",
      allowedHosts: new Set(["agent-gateway:8770"]),
      maxBodyBytes: 1024 * 1024,
    }, sessions, new SemanticOnlyProjectBridgeClient(bridge.url, token));
    const port = await listen(gateway);

    const health = await exchange(port, "GET", "/healthz");
    expect(health.status).toBe(200);
    expect(health.json).toMatchObject({ ok: true, transport: "streamable-http", sessions: 0 });

    const ready = await exchange(port, "GET", "/readyz");
    expect(ready.status).toBe(200);
    expect(ready.json).toMatchObject({ ok: true, documentId: document.id, schemaVersion: 1 });

    const initialized = await exchange(port, "POST", "/mcp", {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "afrodite-http-test", version: "1.0.0" },
      },
    });
    expect(initialized.status).toBe(200);
    const sessionId = initialized.headers["mcp-session-id"];
    expect(typeof sessionId).toBe("string");
    expect(initialized.json).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: { serverInfo: { name: "afrodite-agent-gateway" } },
    });

    const listed = await exchange(port, "POST", "/mcp", {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    }, { "Mcp-Session-Id": String(sessionId) });
    expect(listed.status).toBe(200);
    const names = ((listed.json as { result?: { tools?: Array<{ name: string }> } }).result?.tools ?? [])
      .map((tool) => tool.name)
      .sort();
    expect(names).toEqual([...AFRODITE_AGENT_MCP_TOOLS].sort());
    expect(names.some((name) => /(apply|execute|write|approve|shell|filesystem|commit|merge)/i.test(name))).toBe(false);
    expect(sessions.size).toBe(1);

    const missingSession = await exchange(port, "POST", "/mcp", {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/list",
      params: {},
    });
    expect(missingSession.status).toBe(400);
  });

  it("rejects unapproved host headers before health or MCP routing", async () => {
    const bridge = await startBridge();
    const sessions = new Map<string, ActiveSession>();
    sessionMaps.push(sessions);
    const gateway = createHttpGateway({
      host: "127.0.0.1",
      port: 8770,
      bridgeUrl: bridge.url,
      token,
      actor: "http-test",
      allowedHosts: new Set(["agent-gateway:8770"]),
      maxBodyBytes: 1024 * 1024,
    }, sessions, new SemanticOnlyProjectBridgeClient(bridge.url, token));
    const port = await listen(gateway);

    const response = await exchange(port, "GET", "/healthz", undefined, {}, "attacker.invalid");
    expect(response.status).toBe(421);
    expect(response.json).toEqual({ ok: false, error: "HOST_NOT_ALLOWED" });
  });

  it("parses Docker defaults and rejects missing secrets or invalid limits", () => {
    expect(parseOptions([], {
      AFRODITE_BRIDGE_TOKEN: token,
    })).toMatchObject({
      host: "0.0.0.0",
      port: 8770,
      bridgeUrl: "http://127.0.0.1:4175",
      actor: "tunnel-agent",
      maxBodyBytes: 1_048_576,
    });
    expect(() => parseOptions([], {})).toThrow(/AFRODITE_BRIDGE_TOKEN/);
    expect(() => parseOptions([], {
      AFRODITE_BRIDGE_TOKEN: token,
      AFRODITE_MCP_MAX_BODY_BYTES: "12",
    })).toThrow(/between 1024/);
  });
});

async function startBridge(): Promise<{ url: string }> {
  const server = createNodeServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: { code: "UNAUTHORIZED", message: "bad token" } }));
      return;
    }
    if (req.method === "GET" && req.url === "/api/session/current") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: true,
        session: {
          sessionId: "studio.http-test",
          revision: 1,
          documentVersion: "ui-document-v1:http-test",
          updatedAt: "2026-07-27T20:00:00.000Z",
          document,
        },
      }));
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: { code: "NOT_FOUND", message: "not found" } }));
  });
  const port = await listen(server);
  return { url: `http://127.0.0.1:${port}` };
}

async function listen(server: Server): Promise<number> {
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP server address.");
  return address.port;
}

interface ExchangeResult {
  readonly status: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly json: unknown;
}

function exchange(
  port: number,
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
  hostHeader = "agent-gateway:8770",
): Promise<ExchangeResult> {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port,
      path,
      method,
      headers: {
        Host: hostHeader,
        Accept: "application/json, text/event-stream",
        ...(payload ? {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload).toString(),
        } : {}),
        ...extraHeaders,
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8").trim();
        let json: unknown = undefined;
        if (text) {
          try {
            json = JSON.parse(text);
          } catch (error) {
            reject(new Error(`Expected JSON response, received: ${text}`, { cause: error }));
            return;
          }
        }
        resolve({ status: res.statusCode ?? 0, headers: res.headers, json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}
