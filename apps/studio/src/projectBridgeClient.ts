import {
  bindingDiscoveryResponseSchema,
  bindingMarkerPlanResponseSchema,
  bridgeApplyResponseSchema,
  bridgeHealthResponseSchema,
  bridgePlanResponseSchema,
  bridgeSourceResponseSchema,
  bridgeTransactionApplyResponseSchema,
  bridgeTransactionPlanResponseSchema,
  humanReviewListResponseSchema,
  humanReviewResponseSchema,
  liveSessionResponseSchema,
  screenImportResponseSchema,
  semanticPlanResponseSchema,
  type BindingDiscoveryRequest,
  type BindingDiscoveryResult,
  type BindingMarkerPlanRequest,
  type BindingPatchPlanView,
  type BridgeApplyResult,
  type BridgeHealthResponse,
  type BridgeOperation,
  type BridgePatchPlanView,
  type BridgeSourceSnapshot,
  type BridgeStyleOperation,
  type BridgeTransactionApplyResult,
  type BridgeTransactionOperation,
  type BridgeTransactionPlanView,
  type BridgeTransactionSourceApproval,
  type BridgeVariantOperation,
  type HumanReviewRequest,
  type LiveSessionSnapshot,
  type ScreenImportRequest,
  type ScreenImportResult,
  type SemanticOperationCommand,
  type SemanticPlanView,
} from "@afrodite/protocol";
import type { UiDocument } from "@afrodite/ui-ir";

interface Parser<T> {
  parse(input: unknown): T;
}

export class ProjectBridgeClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ProjectBridgeClientError";
    this.code = code;
  }
}

export class ProjectBridgeClient {
  readonly #baseUrl: string;
  readonly #token: string;

  constructor(baseUrl: string, token: string) {
    this.#baseUrl = baseUrl.replace(/\/+$/, "");
    this.#token = token;
  }

  health(): Promise<BridgeHealthResponse> {
    return this.#request("/api/health", { method: "GET" }, bridgeHealthResponseSchema);
  }

  async publishLiveSession(
    sessionId: string,
    revision: number,
    document: UiDocument,
  ): Promise<LiveSessionSnapshot> {
    const response = await this.#request(
      "/api/session/publish",
      { method: "POST", body: JSON.stringify({ sessionId, revision, document }) },
      liveSessionResponseSchema,
    );
    if (!response.ok) throw new ProjectBridgeClientError(response.error.code, response.error.message);
    return response.session;
  }

  async readLiveSession(): Promise<LiveSessionSnapshot> {
    const response = await this.#request(
      "/api/session/current",
      { method: "GET" },
      liveSessionResponseSchema,
    );
    if (!response.ok) throw new ProjectBridgeClientError(response.error.code, response.error.message);
    return response.session;
  }

  async listReviewRequests(): Promise<readonly HumanReviewRequest[]> {
    const response = await this.#request(
      "/api/review/list",
      { method: "GET" },
      humanReviewListResponseSchema,
    );
    if (!response.ok) throw new ProjectBridgeClientError(response.error.code, response.error.message);
    return response.requests;
  }

  async decideReviewRequest(
    requestId: string,
    decision: "approved" | "rejected",
    decidedBy: string,
    note?: string,
  ): Promise<HumanReviewRequest> {
    const response = await this.#request(
      "/api/review/decide",
      {
        method: "POST",
        body: JSON.stringify({
          requestId,
          decision,
          decidedBy,
          ...(note?.trim() ? { note: note.trim() } : {}),
        }),
      },
      humanReviewResponseSchema,
    );
    if (!response.ok) throw new ProjectBridgeClientError(response.error.code, response.error.message);
    return response.request;
  }

  async readSource(repositoryPath: string): Promise<BridgeSourceSnapshot> {
    const response = await this.#request(
      "/api/source/read",
      { method: "POST", body: JSON.stringify({ repositoryPath }) },
      bridgeSourceResponseSchema,
    );
    if (!response.ok) throw new ProjectBridgeClientError(response.error.code, response.error.message);
    return response.source;
  }

  async planSemanticOperation(
    document: UiDocument,
    command: SemanticOperationCommand,
  ): Promise<SemanticPlanView> {
    const response = await this.#request(
      "/api/semantic/plan",
      { method: "POST", body: JSON.stringify({ document, command }) },
      semanticPlanResponseSchema,
    );
    if (!response.ok) throw new ProjectBridgeClientError(response.error.code, response.error.message);
    return response.plan;
  }

  async importScreen(request: ScreenImportRequest): Promise<ScreenImportResult> {
    const response = await this.#request(
      "/api/import/screen",
      { method: "POST", body: JSON.stringify(request) },
      screenImportResponseSchema,
    );
    if (!response.ok) throw new ProjectBridgeClientError(response.error.code, response.error.message);
    return response.result;
  }

  async discoverBindings(request: BindingDiscoveryRequest): Promise<BindingDiscoveryResult> {
    const response = await this.#request(
      "/api/binding/discover",
      { method: "POST", body: JSON.stringify(request) },
      bindingDiscoveryResponseSchema,
    );
    if (!response.ok) throw new ProjectBridgeClientError(response.error.code, response.error.message);
    return response.discovery;
  }

  async planBinding(request: BindingMarkerPlanRequest): Promise<BindingPatchPlanView> {
    const response = await this.#request(
      "/api/binding/plan",
      { method: "POST", body: JSON.stringify(request) },
      bindingMarkerPlanResponseSchema,
    );
    if (!response.ok) throw new ProjectBridgeClientError(response.error.code, response.error.message);
    return response.plan;
  }

  async planPatch(operation: BridgeOperation): Promise<BridgePatchPlanView> {
    const response = await this.#request(
      "/api/patch/plan",
      { method: "POST", body: JSON.stringify({ operation }) },
      bridgePlanResponseSchema,
    );
    if (!response.ok) throw new ProjectBridgeClientError(response.error.code, response.error.message);
    return response.plan;
  }

  async planStylePatch(operation: BridgeStyleOperation): Promise<BridgePatchPlanView> {
    const response = await this.#request(
      "/api/style/plan",
      { method: "POST", body: JSON.stringify({ operation }) },
      bridgePlanResponseSchema,
    );
    if (!response.ok) throw new ProjectBridgeClientError(response.error.code, response.error.message);
    return response.plan;
  }

  async planVariantPatch(operation: BridgeVariantOperation): Promise<BridgePatchPlanView> {
    const response = await this.#request(
      "/api/variant/plan",
      { method: "POST", body: JSON.stringify({ operation }) },
      bridgePlanResponseSchema,
    );
    if (!response.ok) throw new ProjectBridgeClientError(response.error.code, response.error.message);
    return response.plan;
  }

  async applyPatch(
    planId: string,
    sourceVersion: string,
    approvedBy = "afrodite-studio",
  ): Promise<BridgeApplyResult> {
    const response = await this.#request(
      "/api/patch/apply",
      {
        method: "POST",
        body: JSON.stringify({ planId, sourceVersion, approvedBy }),
      },
      bridgeApplyResponseSchema,
    );
    if (!response.ok) throw new ProjectBridgeClientError(response.error.code, response.error.message);
    return response.result;
  }

  async planTransaction(
    operations: readonly BridgeTransactionOperation[],
  ): Promise<BridgeTransactionPlanView> {
    const response = await this.#request(
      "/api/transaction/plan",
      { method: "POST", body: JSON.stringify({ operations }) },
      bridgeTransactionPlanResponseSchema,
    );
    if (!response.ok) throw new ProjectBridgeClientError(response.error.code, response.error.message);
    return response.transaction;
  }

  async applyTransaction(
    transactionId: string,
    sources: readonly BridgeTransactionSourceApproval[],
    approvedBy = "afrodite-studio",
  ): Promise<BridgeTransactionApplyResult> {
    const response = await this.#request(
      "/api/transaction/apply",
      {
        method: "POST",
        body: JSON.stringify({ transactionId, sources, approvedBy }),
      },
      bridgeTransactionApplyResponseSchema,
    );
    if (!response.ok) throw new ProjectBridgeClientError(response.error.code, response.error.message);
    return response.result;
  }

  async #request<T>(path: string, init: RequestInit, parser: Parser<T>): Promise<T> {
    const response = await fetch(`${this.#baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.#token}`,
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
        "Project bridge response does not match the expected protocol.",
      );
    }
  }
}
