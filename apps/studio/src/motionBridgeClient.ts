import {
  bridgeMotionApplyResponseSchema,
  bridgeMotionPlanResponseSchema,
  bridgeMotionRuntimeEvidenceRecordResponseSchema,
  type BridgeApplyResult,
  type BridgeMotionOperation,
  type BridgeMotionPlanView,
  type BridgeMotionRuntimeEvidence,
} from "@afrodite/protocol";
import type { MotionVerificationResult } from "@afrodite/protocol/motion-verification";

export class MotionBridgeClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MotionBridgeClientError";
    this.code = code;
  }
}

export async function planMotionPatch(
  baseUrl: string,
  token: string,
  operation: BridgeMotionOperation,
): Promise<BridgeMotionPlanView> {
  const payload = await request(baseUrl, token, "/api/motion/plan", {
    operation,
  });
  const parsed = bridgeMotionPlanResponseSchema.parse(payload);
  if (!parsed.ok) throw new MotionBridgeClientError(parsed.error.code, parsed.error.message);
  return parsed.plan;
}

export async function recordMotionRuntimeEvidence(
  baseUrl: string,
  token: string,
  result: MotionVerificationResult,
): Promise<BridgeMotionRuntimeEvidence> {
  const payload = await request(baseUrl, token, "/api/motion/runtime-evidence", {
    result,
  });
  const parsed = bridgeMotionRuntimeEvidenceRecordResponseSchema.parse(payload);
  if (!parsed.ok) throw new MotionBridgeClientError(parsed.error.code, parsed.error.message);
  return parsed.evidence;
}

export async function applyMotionPatch(
  baseUrl: string,
  token: string,
  planId: string,
  sourceVersion: string,
  runtimeEvidenceId: string,
): Promise<BridgeApplyResult> {
  const payload = await request(baseUrl, token, "/api/motion/apply", {
    planId,
    sourceVersion,
    runtimeEvidenceId,
    approvedBy: "afrodite-studio-motion",
  });
  const parsed = bridgeMotionApplyResponseSchema.parse(payload);
  if (!parsed.ok) throw new MotionBridgeClientError(parsed.error.code, parsed.error.message);
  return parsed.result;
}

async function request(
  baseUrl: string,
  token: string,
  path: string,
  body: unknown,
): Promise<unknown> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new MotionBridgeClientError(
      "INVALID_BRIDGE_RESPONSE",
      `Project bridge returned a non-JSON response (${response.status}).`,
    );
  }
  if (!response.ok) {
    const candidate = payload as { error?: { code?: string; message?: string } };
    throw new MotionBridgeClientError(
      candidate.error?.code ?? "MOTION_BRIDGE_REQUEST_FAILED",
      candidate.error?.message ?? `Project bridge returned ${response.status}.`,
    );
  }
  return payload;
}
