import type { AgentSemanticPlanner } from "@afrodite/agent-gateway-core";
import {
  semanticPlanResponseSchema,
  type SemanticOperationCommand,
  type SemanticPlanView,
} from "@afrodite/protocol";
import type { UiDocument } from "@afrodite/ui-ir";

export class SemanticOnlyProjectBridgeClient implements AgentSemanticPlanner {
  readonly #baseUrl: string;
  readonly #token: string;

  constructor(baseUrl: string, token: string) {
    this.#baseUrl = baseUrl.replace(/\/+$/, "");
    this.#token = token;
  }

  async planSemanticOperation(
    document: UiDocument,
    command: SemanticOperationCommand,
  ): Promise<SemanticPlanView> {
    const response = await fetch(`${this.#baseUrl}/api/semantic/plan`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.#token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ document, command }),
    });

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`Project bridge returned a non-JSON semantic response (${response.status}).`);
    }

    if (!response.ok) {
      const candidate = payload as { error?: { code?: string; message?: string } };
      throw new Error(
        `${candidate.error?.code ?? "SEMANTIC_BRIDGE_REQUEST_FAILED"}: ${candidate.error?.message ?? `Project bridge returned ${response.status}.`}`,
      );
    }

    const parsed = semanticPlanResponseSchema.parse(payload);
    if (!parsed.ok) throw new Error(`${parsed.error.code}: ${parsed.error.message}`);
    return parsed.plan;
  }
}
