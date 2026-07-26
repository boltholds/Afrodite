import {
  bindingDiscoveryResponseSchema,
  bindingMarkerPlanResponseSchema,
  bridgeApplyResponseSchema,
  bridgeHealthResponseSchema,
  bridgePlanResponseSchema,
  bridgeSourceResponseSchema,
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
} from "@afrodite/protocol";

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

  async readSource(repositoryPath: string): Promise<BridgeSourceSnapshot> {
    const response = await this.#request(
      "/api/source/read",
      { method: "POST", body: JSON.stringify({ repositoryPath }) },
      bridgeSourceResponseSchema,
    );
    if (!response.ok) throw new ProjectBridgeClientError(response.error.code, response.error.message);
    return response.source;
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
