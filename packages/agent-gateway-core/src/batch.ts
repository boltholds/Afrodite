import type { SemanticOperationCommand } from "@afrodite/protocol";
import type { SemanticBatchPlanView } from "@afrodite/protocol/semantic-batch";
import type { UiDocument } from "@afrodite/ui-ir";
import type {
  AgentDocumentProvider,
  AgentGatewayCallContext,
} from "./index";

export const AGENT_SEMANTIC_BATCH_TOOL_NAMES = [
  "plan_semantic_batch",
  "request_semantic_batch_review",
  "get_semantic_batch_review",
] as const;

export type AgentSemanticBatchToolName = typeof AGENT_SEMANTIC_BATCH_TOOL_NAMES[number];

export interface AgentSemanticBatchPolicy {
  readonly policyId: string;
  readonly allowedTools: readonly AgentSemanticBatchToolName[];
  readonly maxCommands: number;
  readonly maxSourcePlans: number;
  readonly maxDiffCharacters: number;
  readonly reviewRequestTtlMs: number;
}

export const DEFAULT_AGENT_SEMANTIC_BATCH_POLICY: AgentSemanticBatchPolicy = Object.freeze({
  policyId: "afrodite.agent.semantic-batch.read-plan-request.v1",
  allowedTools: AGENT_SEMANTIC_BATCH_TOOL_NAMES,
  maxCommands: 16,
  maxSourcePlans: 8,
  maxDiffCharacters: 80_000,
  reviewRequestTtlMs: 15 * 60_000,
});

export interface AgentSemanticBatchPlanner {
  planSemanticBatch(
    document: UiDocument,
    commands: readonly SemanticOperationCommand[],
  ): Promise<SemanticBatchPlanView>;
}

export interface AgentSemanticBatchGatewayDependencies {
  readonly documentProvider: AgentDocumentProvider;
  readonly batchPlanner: AgentSemanticBatchPlanner;
  readonly policy?: AgentSemanticBatchPolicy;
  readonly now?: () => number;
  readonly idFactory?: () => string;
}

export interface AgentPlannedSemanticBatch {
  readonly commands: readonly SemanticOperationCommand[];
  readonly batch: SemanticBatchPlanView;
  readonly reviewEligible: boolean;
  readonly policyId: string;
}

export interface AgentSemanticBatchReviewRequest {
  readonly requestId: string;
  readonly status: "pending" | "expired";
  readonly actor: string;
  readonly sessionId?: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly batchId: string;
  readonly documentVersion: string;
  readonly commands: readonly SemanticOperationCommand[];
  readonly rationale?: string;
  readonly sourcePlans: readonly {
    readonly planId: string;
    readonly repositoryPath: string;
    readonly sourceVersion: string;
    readonly changed: boolean;
  }[];
  readonly sourceTransactionId?: string;
  readonly humanAction: string;
}

export class AgentSemanticBatchPolicyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AgentSemanticBatchPolicyError";
    this.code = code;
  }
}

export class PolicyControlledSemanticBatchGateway {
  readonly #documentProvider: AgentDocumentProvider;
  readonly #batchPlanner: AgentSemanticBatchPlanner;
  readonly #policy: AgentSemanticBatchPolicy;
  readonly #now: () => number;
  readonly #idFactory: () => string;
  readonly #plans = new Map<string, AgentPlannedSemanticBatch>();
  readonly #requests = new Map<string, AgentSemanticBatchReviewRequest>();

  constructor(dependencies: AgentSemanticBatchGatewayDependencies) {
    this.#documentProvider = dependencies.documentProvider;
    this.#batchPlanner = dependencies.batchPlanner;
    this.#policy = normalizePolicy(dependencies.policy ?? DEFAULT_AGENT_SEMANTIC_BATCH_POLICY);
    this.#now = dependencies.now ?? Date.now;
    this.#idFactory = dependencies.idFactory ?? randomId;
  }

  async planSemanticBatch(
    commands: readonly SemanticOperationCommand[],
    context: AgentGatewayCallContext,
  ): Promise<AgentPlannedSemanticBatch> {
    this.#authorize("plan_semantic_batch");
    if (commands.length === 0 || commands.length > this.#policy.maxCommands) {
      throw new AgentSemanticBatchPolicyError(
        "AGENT_SEMANTIC_BATCH_COMMAND_LIMIT",
        `A semantic batch must contain 1-${this.#policy.maxCommands} typed commands.`,
      );
    }

    const document = await this.#documentProvider.readDocument();
    const batch = await this.#batchPlanner.planSemanticBatch(document, commands);
    if (batch.sourcePlans.length > this.#policy.maxSourcePlans) {
      throw new AgentSemanticBatchPolicyError(
        "AGENT_SEMANTIC_BATCH_SOURCE_PLAN_LIMIT",
        `The batch created ${batch.sourcePlans.length} source plans; policy allows ${this.#policy.maxSourcePlans}.`,
      );
    }
    const diffCharacters = batch.sourcePlans.reduce((total, source) => total + source.diff.length, 0);
    if (diffCharacters > this.#policy.maxDiffCharacters) {
      throw new AgentSemanticBatchPolicyError(
        "AGENT_SEMANTIC_BATCH_DIFF_LIMIT",
        `The batch diff contains ${diffCharacters} characters; policy allows ${this.#policy.maxDiffCharacters}.`,
      );
    }

    const planned: AgentPlannedSemanticBatch = {
      commands: commands.map(cloneJson),
      batch: cloneJson(batch),
      reviewEligible: batch.status === "ready" && batch.documentAfter !== undefined,
      policyId: this.#policy.policyId,
    };
    this.#plans.set(batch.batchId, planned);
    void context;
    return cloneJson(planned);
  }

  requestSemanticBatchReview(
    batchId: string,
    rationale: string | undefined,
    context: AgentGatewayCallContext,
  ): AgentSemanticBatchReviewRequest {
    this.#authorize("request_semantic_batch_review");
    this.#expireRequests();
    const planned = this.#plans.get(batchId);
    if (!planned) {
      throw new AgentSemanticBatchPolicyError(
        "AGENT_SEMANTIC_BATCH_NOT_FOUND",
        "The batch is missing or belongs to another gateway process. Run a fresh batch dry run first.",
      );
    }
    if (!planned.reviewEligible) {
      throw new AgentSemanticBatchPolicyError(
        "AGENT_SEMANTIC_BATCH_NOT_REVIEW_ELIGIBLE",
        "Blocked or effect-free batches cannot enter human review.",
      );
    }

    const createdAtMs = this.#now();
    const request: AgentSemanticBatchReviewRequest = {
      requestId: `batch_review_${this.#idFactory()}`,
      status: "pending",
      actor: context.actor,
      ...(context.sessionId ? { sessionId: context.sessionId } : {}),
      createdAt: new Date(createdAtMs).toISOString(),
      expiresAt: new Date(createdAtMs + this.#policy.reviewRequestTtlMs).toISOString(),
      batchId,
      documentVersion: planned.batch.documentVersion,
      commands: planned.commands.map(cloneJson),
      ...(rationale?.trim() ? { rationale: rationale.trim() } : {}),
      sourcePlans: planned.batch.sourcePlans.map((source) => ({
        planId: source.planId,
        repositoryPath: source.repositoryPath,
        sourceVersion: source.sourceVersion,
        changed: source.changed,
      })),
      ...(planned.batch.sourceTransaction
        ? { sourceTransactionId: planned.batch.sourceTransaction.transactionId }
        : {}),
      humanAction: "Review the exact ordered commands, combined document, every source diff, and the optional atomic transaction in Afrodite Studio. The agent cannot decide or execute the batch.",
    };
    this.#requests.set(request.requestId, request);
    return cloneJson(request);
  }

  getSemanticBatchReview(
    requestId: string,
    _context: AgentGatewayCallContext,
  ): AgentSemanticBatchReviewRequest {
    this.#authorize("get_semantic_batch_review");
    this.#expireRequests();
    const request = this.#requests.get(requestId);
    if (!request) {
      throw new AgentSemanticBatchPolicyError(
        "AGENT_SEMANTIC_BATCH_REVIEW_NOT_FOUND",
        `Semantic batch review ${requestId} was not found.`,
      );
    }
    return cloneJson(request);
  }

  getPlannedBatch(batchId: string): AgentPlannedSemanticBatch | undefined {
    const planned = this.#plans.get(batchId);
    return planned ? cloneJson(planned) : undefined;
  }

  #authorize(tool: AgentSemanticBatchToolName): void {
    if (this.#policy.allowedTools.includes(tool)) return;
    throw new AgentSemanticBatchPolicyError(
      "AGENT_SEMANTIC_BATCH_TOOL_DENIED",
      `Tool ${tool} is disabled by policy ${this.#policy.policyId}.`,
    );
  }

  #expireRequests(): void {
    const now = this.#now();
    for (const [id, request] of this.#requests) {
      if (request.status === "pending" && Date.parse(request.expiresAt) <= now) {
        this.#requests.set(id, { ...request, status: "expired" });
      }
    }
  }
}

function normalizePolicy(policy: AgentSemanticBatchPolicy): AgentSemanticBatchPolicy {
  return Object.freeze({
    policyId: policy.policyId,
    allowedTools: policy.allowedTools.filter((tool, index, values) => values.indexOf(tool) === index),
    maxCommands: positiveInteger(policy.maxCommands, "maxCommands"),
    maxSourcePlans: positiveInteger(policy.maxSourcePlans, "maxSourcePlans"),
    maxDiffCharacters: positiveInteger(policy.maxDiffCharacters, "maxDiffCharacters"),
    reviewRequestTtlMs: positiveInteger(policy.reviewRequestTtlMs, "reviewRequestTtlMs"),
  });
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  return value;
}

function randomId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
