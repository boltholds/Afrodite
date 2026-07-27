import {
  semanticBatchPlanResponseSchema,
  type SemanticBatchPlanView,
} from "@afrodite/protocol/semantic-batch";
import type { SemanticOperationCommand } from "@afrodite/protocol";
import type { UiDocument } from "@afrodite/ui-ir";
import { ProjectBridgeClientError } from "./projectBridgeClient";

export async function planSemanticBatchThroughBridge(
  baseUrl: string,
  token: string,
  document: UiDocument,
  commands: readonly SemanticOperationCommand[],
): Promise<SemanticBatchPlanView> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/semantic/batch/plan`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ document, commands }),
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

  const parsed = semanticBatchPlanResponseSchema.parse(payload);
  if (!parsed.ok) throw new ProjectBridgeClientError(parsed.error.code, parsed.error.message);
  return parsed.batch;
}
