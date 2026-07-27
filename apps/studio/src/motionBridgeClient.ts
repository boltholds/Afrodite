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

export const MOTION_RUNTIME_MANIFEST_KEY = "afrodite.motion.runtime-manifest.v1";
export const MOTION_RUNTIME_BRIDGE_URL_KEY = "afrodite.motion.runtime-bridge-url.v1";
export const MOTION_RUNTIME_EVIDENCE_PREFIX = "afrodite.motion.runtime-evidence.v1.";

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
  clearRuntimeEvidence(parsed.plan.planId);
  if (parsed.plan.runtimeVerification) {
    sessionStorage.setItem(MOTION_RUNTIME_MANIFEST_KEY, JSON.stringify(parsed.plan.runtimeVerification));
    sessionStorage.setItem(MOTION_RUNTIME_BRIDGE_URL_KEY, baseUrl);
  } else {
    sessionStorage.removeItem(MOTION_RUNTIME_MANIFEST_KEY);
  }
  window.dispatchEvent(new Event("afrodite-motion-runtime-plan"));
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
  sessionStorage.setItem(
    `${MOTION_RUNTIME_EVIDENCE_PREFIX}${parsed.evidence.planId}`,
    parsed.evidence.evidenceId,
  );
  window.dispatchEvent(new Event("afrodite-motion-runtime-evidence"));
  return parsed.evidence;
}

export async function applyMotionPatch(
  baseUrl: string,
  token: string,
  planId: string,
  sourceVersion: string,
  runtimeEvidenceId?: string,
): Promise<BridgeApplyResult> {
  const evidenceId = runtimeEvidenceId
    ?? sessionStorage.getItem(`${MOTION_RUNTIME_EVIDENCE_PREFIX}${planId}`)
    ?? "";
  if (!evidenceId) {
    throw new MotionBridgeClientError(
      "MOTION_RUNTIME_EVIDENCE_REQUIRED",
      "Run and record isolated runtime verification for this exact motion plan before apply.",
    );
  }
  const payload = await request(baseUrl, token, "/api/motion/apply", {
    planId,
    sourceVersion,
    runtimeEvidenceId: evidenceId,
    approvedBy: "afrodite-studio-motion",
  });
  const parsed = bridgeMotionApplyResponseSchema.parse(payload);
  if (!parsed.ok) throw new MotionBridgeClientError(parsed.error.code, parsed.error.message);
  clearRuntimeEvidence(planId);
  sessionStorage.removeItem(MOTION_RUNTIME_MANIFEST_KEY);
  window.dispatchEvent(new Event("afrodite-motion-runtime-plan"));
  return parsed.result;
}

function clearRuntimeEvidence(planId: string): void {
  sessionStorage.removeItem(`${MOTION_RUNTIME_EVIDENCE_PREFIX}${planId}`);
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
