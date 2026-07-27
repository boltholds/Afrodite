import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  semanticBatchReviewDecisionRequestSchema,
  semanticBatchReviewRequestSchema,
  semanticBatchReviewSubmitRequestSchema,
  type SemanticBatchReviewDecisionRequest,
  type SemanticBatchReviewRequest,
  type SemanticBatchReviewSubmitRequest,
} from "@afrodite/protocol/semantic-batch-review";
import type { ProjectCollaborationStore } from "./collaboration.js";

interface PersistedSemanticBatchReviewState {
  readonly schemaVersion: 1;
  readonly requests: readonly SemanticBatchReviewRequest[];
}

const EMPTY_STATE: PersistedSemanticBatchReviewState = {
  schemaVersion: 1,
  requests: [],
};

export class SemanticBatchReviewError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SemanticBatchReviewError";
    this.code = code;
  }
}

export class SemanticBatchReviewStore {
  readonly #directory: string;
  readonly #statePath: string;
  readonly #collaboration: ProjectCollaborationStore;
  readonly #now: () => number;
  #queue: Promise<void> = Promise.resolve();

  constructor(
    projectRoot: string,
    collaboration: ProjectCollaborationStore,
    now: () => number = Date.now,
  ) {
    this.#directory = path.join(path.resolve(projectRoot), ".afrodite");
    this.#statePath = path.join(this.#directory, "semantic-batch-reviews.json");
    this.#collaboration = collaboration;
    this.#now = now;
  }

  async submit(input: SemanticBatchReviewSubmitRequest): Promise<SemanticBatchReviewRequest> {
    const request = semanticBatchReviewSubmitRequestSchema.parse(input);
    const live = await this.#collaboration.readSession();
    if (request.batch.status !== "ready" || !request.batch.documentAfter) {
      throw new SemanticBatchReviewError(
        "SEMANTIC_BATCH_REVIEW_NOT_ELIGIBLE",
        "Only a ready batch with a document effect can enter human review.",
      );
    }
    if (request.batch.documentVersion !== live.documentVersion) {
      throw new SemanticBatchReviewError(
        "SEMANTIC_BATCH_REVIEW_STALE",
        "The semantic batch no longer matches the live Studio document.",
      );
    }

    return this.#mutate(async (state) => {
      const existing = state.requests.find((entry) => entry.requestId === request.requestId);
      if (existing) return [state, existing];
      const created = semanticBatchReviewRequestSchema.parse({
        requestId: request.requestId,
        status: "pending",
        actor: request.actor,
        ...(request.agentSessionId ? { agentSessionId: request.agentSessionId } : {}),
        createdAt: request.createdAt,
        expiresAt: request.expiresAt,
        ...(request.rationale ? { rationale: request.rationale } : {}),
        batch: request.batch,
      });
      return [{ ...state, requests: [created, ...state.requests].slice(0, 500) }, created];
    });
  }

  async list(): Promise<readonly SemanticBatchReviewRequest[]> {
    return this.#mutate(async (state) => {
      const next = expireRequests(state, this.#now());
      return [next, next.requests.map(cloneJson)];
    });
  }

  async get(requestId: string): Promise<SemanticBatchReviewRequest> {
    const requests = await this.list();
    const request = requests.find((entry) => entry.requestId === requestId);
    if (!request) {
      throw new SemanticBatchReviewError(
        "SEMANTIC_BATCH_REVIEW_NOT_FOUND",
        `Semantic batch review ${requestId} was not found.`,
      );
    }
    return request;
  }

  async decide(input: SemanticBatchReviewDecisionRequest): Promise<SemanticBatchReviewRequest> {
    const decision = semanticBatchReviewDecisionRequestSchema.parse(input);
    const live = await this.#collaboration.readSession();
    return this.#mutate(async (rawState) => {
      const state = expireRequests(rawState, this.#now());
      const index = state.requests.findIndex((entry) => entry.requestId === decision.requestId);
      if (index < 0) {
        throw new SemanticBatchReviewError(
          "SEMANTIC_BATCH_REVIEW_NOT_FOUND",
          `Semantic batch review ${decision.requestId} was not found.`,
        );
      }
      const current = state.requests[index]!;
      if (current.status !== "pending") {
        throw new SemanticBatchReviewError(
          "SEMANTIC_BATCH_REVIEW_NOT_PENDING",
          `Semantic batch review ${decision.requestId} is already ${current.status}.`,
        );
      }
      if (current.batch.documentVersion !== live.documentVersion) {
        throw new SemanticBatchReviewError(
          "SEMANTIC_BATCH_REVIEW_STALE",
          "The live Studio document changed after this batch was planned.",
        );
      }
      const updated = semanticBatchReviewRequestSchema.parse({
        ...current,
        status: decision.decision,
        decision: {
          decision: decision.decision,
          decidedAt: new Date(this.#now()).toISOString(),
          decidedBy: decision.decidedBy,
          ...(decision.note ? { note: decision.note } : {}),
        },
      });
      const requests = [...state.requests];
      requests[index] = updated;
      return [{ ...state, requests }, updated];
    });
  }

  async #read(): Promise<PersistedSemanticBatchReviewState> {
    try {
      const raw = await readFile(this.#statePath, "utf8");
      const candidate = JSON.parse(raw) as PersistedSemanticBatchReviewState;
      return {
        schemaVersion: 1,
        requests: Array.isArray(candidate.requests)
          ? candidate.requests.map((entry) => semanticBatchReviewRequestSchema.parse(entry))
          : [],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return EMPTY_STATE;
      throw error;
    }
  }

  async #write(state: PersistedSemanticBatchReviewState): Promise<void> {
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.#statePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(
      temporaryPath,
      `${JSON.stringify(state, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    await rename(temporaryPath, this.#statePath);
  }

  async #mutate<T>(
    operation: (state: PersistedSemanticBatchReviewState) => Promise<readonly [PersistedSemanticBatchReviewState, T]>,
  ): Promise<T> {
    let result!: T;
    const next = this.#queue.then(async () => {
      const state = await this.#read();
      const [updated, value] = await operation(state);
      await this.#write(updated);
      result = value;
    });
    this.#queue = next.catch(() => undefined);
    await next;
    return result;
  }
}

function expireRequests(
  state: PersistedSemanticBatchReviewState,
  now: number,
): PersistedSemanticBatchReviewState {
  let changed = false;
  const requests = state.requests.map((request) => {
    if (request.status !== "pending" || Date.parse(request.expiresAt) > now) return request;
    changed = true;
    return semanticBatchReviewRequestSchema.parse({ ...request, status: "expired" });
  });
  return changed ? { ...state, requests } : state;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
