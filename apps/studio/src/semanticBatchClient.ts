import type { SemanticOperationCommand } from "@afrodite/protocol";
import {
  semanticBatchPlanResponseSchema,
  type SemanticBatchPlanView,
} from "@afrodite/protocol/semantic-batch";
import {
  semanticBatchReviewListResponseSchema,
  semanticBatchReviewResponseSchema,
  type SemanticBatchReviewRequest,
} from "@afrodite/protocol/semantic-batch-review";
import type { UiDocument } from "@afrodite/ui-ir";
import { ProjectBridgeClientError } from "./projectBridgeClient";

interface Parser<T> {
  parse(input: unknown): T;
}

export async function planSemanticBatchThroughBridge(
  baseUrl: string,
  token: string,
  document: UiDocument,
  commands: readonly SemanticOperationCommand[],
): Promise<SemanticBatchPlanView> {
  const response = await request(
    baseUrl,
    token,
    "/api/semantic/batch/plan",
    { method: "POST", body: JSON.stringify({ document, commands }) },
    semanticBatchPlanResponseSchema,
  );
  if (!response.ok) throw new ProjectBridgeClientError(response.error.code, response.error.message);
  return response.batch;
}

export async function listSemanticBatchReviews(
  baseUrl: string,
  token: string,
): Promise<readonly SemanticBatchReviewRequest[]> {
  const response = await request(
    baseUrl,
    token,
    "/api/semantic/batch/review/list",
    { method: "GET" },
    semanticBatchReviewListResponseSchema,
  );
  if (!response.ok) throw new ProjectBridgeClientError(response.error.code, response.error.message);
  return response.requests;
}

export async function getSemanticBatchReview(
  baseUrl: string,
  token: string,
  requestId: string,
): Promise<SemanticBatchReviewRequest> {
  const response = await request(
    baseUrl,
    token,
    `/api/semantic/batch/review/get?requestId=${encodeURIComponent(requestId)}`,
    { method: "GET" },
    semanticBatchReviewResponseSchema,
  );
  if (!response.ok) throw new ProjectBridgeClientError(response.error.code, response.error.message);
  return response.request;
}

export async function decideSemanticBatchReview(
  baseUrl: string,
  token: string,
  requestId: string,
  decision: "approved" | "rejected",
  decidedBy = "afrodite-studio",
  note?: string,
): Promise<SemanticBatchReviewRequest> {
  const response = await request(
    baseUrl,
    token,
    "/api/semantic/batch/review/decide",
    {
      method: "POST",
      body: JSON.stringify({
        requestId,
        decision,
        decidedBy,
        ...(note?.trim() ? { note: note.trim() } : {}),
      }),
    },
    semanticBatchReviewResponseSchema,
  );
  if (!response.ok) throw new ProjectBridgeClientError(response.error.code, response.error.message);
  return response.request;
}

async function request<T>(
  baseUrl: string,
  token: string,
  path: string,
  init: RequestInit,
  parser: Parser<T>,
): Promise<T> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ProjectBridgeClientError(
      "INVALID_BRIDGE_RESPONSE",
      `Project bridge returned a non-JSON response (${response.status}).`,
    );
  }

  if (!response.ok) {
    const candidate = payload as { error?: { code?: string; message?: string } };
    throw new ProjectBridgeClientError(
      candidate.error?.code ?? "BRIDGE_REQUEST_FAILED",
      candidate.error?.message ?? `Project bridge request failed with status ${response.status}.`,
    );
  }

  try {
    return parser.parse(payload);
  } catch {
    throw new ProjectBridgeClientError(
      "INVALID_BRIDGE_RESPONSE",
      "Project bridge returned a semantic batch response that does not match the shared protocol.",
    );
  }
}
