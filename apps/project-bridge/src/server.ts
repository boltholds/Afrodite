import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  bindingDiscoveryRequestSchema,
  bindingMarkerPlanRequestSchema,
  bridgeApplyRequestSchema,
  bridgePlanRequestSchema,
  bridgeSourceRequestSchema,
  bridgeStylePlanRequestSchema,
  bridgeTransactionApplyRequestSchema,
  bridgeTransactionPlanRequestSchema,
  bridgeVariantPlanRequestSchema,
  humanReviewDecisionRequestSchema,
  humanReviewSubmitRequestSchema,
  liveSessionPublishRequestSchema,
  reviewedExecutionPrepareRequestSchema,
  reviewedExecutionRecordRequestSchema,
  screenImportRequestSchema,
  semanticPlanRequestSchema,
} from "@afrodite/protocol";
import { ZodError } from "zod";
import {
  ProjectCollaborationError,
  type ProjectCollaborationStore,
} from "./collaboration.js";
import type { ReviewedExecutionService } from "./reviewExecution.js";
import { planProjectSemanticOperation } from "./semantic.js";
import { ProjectBridgeService, ProjectBridgeServiceError } from "./service.js";

export interface ProjectBridgeServerOptions {
  readonly service: ProjectBridgeService;
  readonly collaboration: ProjectCollaborationStore;
  readonly reviewedExecution: ReviewedExecutionService;
  readonly token: string;
  readonly allowedOrigins: readonly string[];
  readonly maxBodyBytes?: number;
}

export function createProjectBridgeServer(options: ProjectBridgeServerOptions): Server {
  const maxBodyBytes = options.maxBodyBytes ?? 1024 * 1024;
  const allowedOrigins = new Set(options.allowedOrigins);

  return createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (origin && !allowedOrigins.has(origin)) {
      sendJson(response, 403, {
        ok: false,
        error: { code: "ORIGIN_NOT_ALLOWED", message: "This Studio origin is not allowed." },
      });
      return;
    }

    if (origin) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
    }
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Cache-Control", "no-store");

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    if (!isAuthorized(request, options.token)) {
      sendJson(response, 401, {
        ok: false,
        error: { code: "UNAUTHORIZED", message: "A valid project bridge session token is required." },
      });
      return;
    }

    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");

      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, options.service.health());
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/session/publish") {
        const input = liveSessionPublishRequestSchema.parse(await readJsonBody(request, maxBodyBytes));
        const session = await options.collaboration.publishSession(input);
        sendJson(response, 200, { ok: true, session });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/session/current") {
        const session = await options.collaboration.readSession();
        sendJson(response, 200, { ok: true, session });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/review/submit") {
        const input = humanReviewSubmitRequestSchema.parse(await readJsonBody(request, maxBodyBytes));
        const review = await options.collaboration.submitReview(input);
        sendJson(response, 200, { ok: true, request: review });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/review/list") {
        const requests = await options.collaboration.listReviews();
        sendJson(response, 200, { ok: true, requests });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/review/get") {
        const requestId = url.searchParams.get("requestId");
        if (!requestId) throw new HttpRequestError("REQUEST_ID_REQUIRED", "requestId is required.", 400);
        const review = await options.collaboration.getReview(requestId);
        sendJson(response, 200, { ok: true, request: review });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/review/decide") {
        const input = humanReviewDecisionRequestSchema.parse(await readJsonBody(request, maxBodyBytes));
        const review = await options.collaboration.decideReview(input);
        sendJson(response, 200, { ok: true, request: review });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/review/prepare-execution") {
        const input = reviewedExecutionPrepareRequestSchema.parse(await readJsonBody(request, maxBodyBytes));
        const review = await options.reviewedExecution.prepare(input);
        sendJson(response, 200, { ok: true, request: review });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/review/record-execution") {
        const input = reviewedExecutionRecordRequestSchema.parse(await readJsonBody(request, maxBodyBytes));
        const review = await options.collaboration.recordExecution(input);
        sendJson(response, 200, { ok: true, request: review });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/source/read") {
        const input = bridgeSourceRequestSchema.parse(await readJsonBody(request, maxBodyBytes));
        const source = await options.service.readSource(input.repositoryPath);
        sendJson(response, 200, { ok: true, source });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/semantic/plan") {
        const input = semanticPlanRequestSchema.parse(await readJsonBody(request, maxBodyBytes));
        const plan = await planProjectSemanticOperation(options.service, input.document, input.command);
        sendJson(response, 200, { ok: true, plan });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/import/screen") {
        const input = screenImportRequestSchema.parse(await readJsonBody(request, maxBodyBytes));
        const result = await options.service.importScreen(input);
        sendJson(response, 200, { ok: true, result });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/binding/discover") {
        const input = bindingDiscoveryRequestSchema.parse(await readJsonBody(request, maxBodyBytes));
        const discovery = await options.service.discoverBindings(input);
        sendJson(response, 200, { ok: true, discovery });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/binding/plan") {
        const input = bindingMarkerPlanRequestSchema.parse(await readJsonBody(request, maxBodyBytes));
        const plan = await options.service.planBinding(input);
        sendJson(response, 200, { ok: true, plan });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/style/plan") {
        const input = bridgeStylePlanRequestSchema.parse(await readJsonBody(request, maxBodyBytes));
        const plan = await options.service.planStylePatch(input.operation);
        sendJson(response, 200, { ok: true, plan });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/variant/plan") {
        const input = bridgeVariantPlanRequestSchema.parse(await readJsonBody(request, maxBodyBytes));
        const plan = await options.service.planVariantPatch(input.operation);
        sendJson(response, 200, { ok: true, plan });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/patch/plan") {
        const input = bridgePlanRequestSchema.parse(await readJsonBody(request, maxBodyBytes));
        const plan = await options.service.planPatch(input.operation);
        sendJson(response, 200, { ok: true, plan });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/patch/apply") {
        const input = bridgeApplyRequestSchema.parse(await readJsonBody(request, maxBodyBytes));
        const result = await options.service.applyPatch(
          input.planId,
          input.sourceVersion,
          input.approvedBy,
        );
        sendJson(response, 200, { ok: true, result });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/transaction/plan") {
        const input = bridgeTransactionPlanRequestSchema.parse(await readJsonBody(request, maxBodyBytes));
        const transaction = await options.service.planTransaction(input.operations);
        sendJson(response, 200, { ok: true, transaction });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/transaction/apply") {
        const input = bridgeTransactionApplyRequestSchema.parse(await readJsonBody(request, maxBodyBytes));
        const result = await options.service.applyTransaction(
          input.transactionId,
          input.sources,
          input.approvedBy,
        );
        sendJson(response, 200, { ok: true, result });
        return;
      }

      sendJson(response, 404, {
        ok: false,
        error: { code: "ROUTE_NOT_FOUND", message: "The requested project bridge route does not exist." },
      });
    } catch (error) {
      const normalized = normalizeError(error);
      sendJson(response, normalized.status, {
        ok: false,
        error: { code: normalized.code, message: normalized.message },
      });
    }
  });
}

function isAuthorized(request: IncomingMessage, expectedToken: string): boolean {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(authorization.slice("Bearer ".length), "utf8");
  const expected = Buffer.from(expectedToken, "utf8");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

async function readJsonBody(request: IncomingMessage, maxBodyBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) {
      throw new HttpRequestError("REQUEST_TOO_LARGE", "The request body exceeds the bridge limit.", 413);
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) return {};
  const source = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(source);
  } catch {
    throw new HttpRequestError("INVALID_JSON", "The request body is not valid JSON.", 400);
  }
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(payload)}\n`);
}

class HttpRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function normalizeError(error: unknown): { code: string; message: string; status: number } {
  if (error instanceof HttpRequestError) return { code: error.code, message: error.message, status: error.status };
  if (error instanceof ProjectBridgeServiceError) return { code: error.code, message: error.message, status: 409 };
  if (error instanceof ProjectCollaborationError) return { code: error.code, message: error.message, status: 409 };
  if (error instanceof ZodError) {
    return {
      code: "INVALID_REQUEST",
      message: error.issues.map((issue) => `${issue.path.join(".") || "$"}: ${issue.message}`).join("; "),
      status: 400,
    };
  }
  return {
    code: "BRIDGE_REQUEST_FAILED",
    message: error instanceof Error ? error.message : "The project bridge request failed.",
    status: 500,
  };
}
