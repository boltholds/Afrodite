import type {
  AgentDocumentProvider,
  AgentSemanticPlanner,
} from "@afrodite/agent-gateway-core";
import type { AgentSemanticBatchPlanner } from "@afrodite/agent-gateway-core/batch";
import {
  humanReviewResponseSchema,
  liveSessionResponseSchema,
  semanticPlanResponseSchema,
  type HumanReviewRequest,
  type HumanReviewSubmitRequest,
  type SemanticOperationCommand,
  type SemanticPlanView,
} from "@afrodite/protocol";
import {
  semanticBatchPlanResponseSchema,
  type SemanticBatchPlanView,
} from "@afrodite/protocol/semantic-batch";
import {
  semanticBatchReviewResponseSchema,
  type SemanticBatchReviewRequest,
  type SemanticBatchReviewSubmitRequest,
} from "@afrodite/protocol/semantic-batch-review";
import type { UiDocument } from "@afrodite/ui-ir";

export interface AgentReviewClient {
  submitReview(request: HumanReviewSubmitRequest): Promise<HumanReviewRequest>;
  getReview(requestId: string): Promise<HumanReviewRequest>;
}

export interface AgentSemanticBatchReviewClient {
  submitSemanticBatchReview(request: SemanticBatchReviewSubmitRequest): Promise<SemanticBatchReviewRequest>;
  getSemanticBatchReview(requestId: string): Promise<SemanticBatchReviewRequest>;
}

export class SemanticOnlyProjectBridgeClient
  implements
    AgentSemanticPlanner,
    AgentSemanticBatchPlanner,
    AgentDocumentProvider,
    AgentReviewClient,
    AgentSemanticBatchReviewClient {
  readonly #baseUrl: string;
  readonly #token: string;

  constructor(baseUrl: string, token: string) {
    this.#baseUrl = baseUrl.replace(/\/+$/, "");
    this.#token = token;
  }

  async readDocument(): Promise<UiDocument> {
    const payload = await this.#request("/api/session/current", { method: "GET" });
    const parsed = liveSessionResponseSchema.parse(payload);
    if (!parsed.ok) throw new Error(`${parsed.error.code}: ${parsed.error.message}`);
    return parsed.session.document;
  }

  async planSemanticOperation(
    document: UiDocument,
    command: SemanticOperationCommand,
  ): Promise<SemanticPlanView> {
    const payload = await this.#request("/api/semantic/plan", {
      method: "POST",
      body: JSON.stringify({ document, command }),
    });
    const parsed = semanticPlanResponseSchema.parse(payload);
    if (!parsed.ok) throw new Error(`${parsed.error.code}: ${parsed.error.message}`);
    return parsed.plan;
  }

  async planSemanticBatch(
    document: UiDocument,
    commands: readonly SemanticOperationCommand[],
  ): Promise<SemanticBatchPlanView> {
    const payload = await this.#request("/api/semantic/batch/plan", {
      method: "POST",
      body: JSON.stringify({ document, commands }),
    });
    const parsed = semanticBatchPlanResponseSchema.parse(payload);
    if (!parsed.ok) throw new Error(`${parsed.error.code}: ${parsed.error.message}`);
    return parsed.batch;
  }

  async submitReview(request: HumanReviewSubmitRequest): Promise<HumanReviewRequest> {
    const payload = await this.#request("/api/review/submit", {
      method: "POST",
      body: JSON.stringify(request),
    });
    const parsed = humanReviewResponseSchema.parse(payload);
    if (!parsed.ok) throw new Error(`${parsed.error.code}: ${parsed.error.message}`);
    return parsed.request;
  }

  async getReview(requestId: string): Promise<HumanReviewRequest> {
    const payload = await this.#request(`/api/review/get?requestId=${encodeURIComponent(requestId)}`, {
      method: "GET",
    });
    const parsed = humanReviewResponseSchema.parse(payload);
    if (!parsed.ok) throw new Error(`${parsed.error.code}: ${parsed.error.message}`);
    return parsed.request;
  }

  async submitSemanticBatchReview(
    request: SemanticBatchReviewSubmitRequest,
  ): Promise<SemanticBatchReviewRequest> {
    const payload = await this.#request("/api/semantic/batch/review/submit", {
      method: "POST",
      body: JSON.stringify(request),
    });
    const parsed = semanticBatchReviewResponseSchema.parse(payload);
    if (!parsed.ok) throw new Error(`${parsed.error.code}: ${parsed.error.message}`);
    return parsed.request;
  }

  async getSemanticBatchReview(requestId: string): Promise<SemanticBatchReviewRequest> {
    const payload = await this.#request(
      `/api/semantic/batch/review/get?requestId=${encodeURIComponent(requestId)}`,
      { method: "GET" },
    );
    const parsed = semanticBatchReviewResponseSchema.parse(payload);
    if (!parsed.ok) throw new Error(`${parsed.error.code}: ${parsed.error.message}`);
    return parsed.request;
  }

  async #request(path: string, init: RequestInit): Promise<unknown> {
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
      throw new Error(`Project bridge returned a non-JSON response (${response.status}).`);
    }

    if (!response.ok) {
      const candidate = payload as { error?: { code?: string; message?: string } };
      throw new Error(
        `${candidate.error?.code ?? "AGENT_BRIDGE_REQUEST_FAILED"}: ${candidate.error?.message ?? `Project bridge returned ${response.status}.`}`,
      );
    }
    return payload;
  }
}
