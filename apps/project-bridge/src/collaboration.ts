import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  humanReviewDecisionRequestSchema,
  humanReviewRequestSchema,
  humanReviewSubmitRequestSchema,
  liveSessionPublishRequestSchema,
  liveSessionSnapshotSchema,
  reviewedExecutionPreparationSchema,
  reviewedExecutionRecordRequestSchema,
  reviewedExecutionRecordSchema,
  type HumanReviewDecisionRequest,
  type HumanReviewRequest,
  type HumanReviewSubmitRequest,
  type LiveSessionPublishRequest,
  type LiveSessionSnapshot,
  type ReviewedExecutionPreparation,
  type ReviewedExecutionRecordRequest,
} from "@afrodite/protocol";
import { createSemanticDocumentVersion } from "@afrodite/semantic-ops";

interface PersistedCollaborationState {
  readonly schemaVersion: 1;
  readonly liveSession?: LiveSessionSnapshot;
  readonly reviews: readonly HumanReviewRequest[];
}

const EMPTY_STATE: PersistedCollaborationState = {
  schemaVersion: 1,
  reviews: [],
};

export class ProjectCollaborationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ProjectCollaborationError";
    this.code = code;
  }
}

export class ProjectCollaborationStore {
  readonly #directory: string;
  readonly #statePath: string;
  readonly #now: () => number;
  #queue: Promise<void> = Promise.resolve();

  constructor(projectRoot: string, now: () => number = Date.now) {
    this.#directory = path.join(path.resolve(projectRoot), ".afrodite");
    this.#statePath = path.join(this.#directory, "collaboration.json");
    this.#now = now;
  }

  async publishSession(input: LiveSessionPublishRequest): Promise<LiveSessionSnapshot> {
    const request = liveSessionPublishRequestSchema.parse(input);
    return this.#mutate(async (state) => {
      const current = state.liveSession;
      if (
        current
        && current.sessionId === request.sessionId
        && request.revision < current.revision
      ) {
        throw new ProjectCollaborationError(
          "LIVE_SESSION_REVISION_STALE",
          `Published revision ${request.revision} is older than current revision ${current.revision}.`,
        );
      }
      const snapshot = liveSessionSnapshotSchema.parse({
        sessionId: request.sessionId,
        revision: request.revision,
        documentVersion: createSemanticDocumentVersion(request.document),
        updatedAt: new Date(this.#now()).toISOString(),
        document: request.document,
      });
      return [{ ...state, liveSession: snapshot }, snapshot];
    });
  }

  async readSession(): Promise<LiveSessionSnapshot> {
    const state = await this.#read();
    if (!state.liveSession) {
      throw new ProjectCollaborationError(
        "LIVE_SESSION_NOT_AVAILABLE",
        "Afrodite Studio has not published a live project session yet.",
      );
    }
    return clone(state.liveSession);
  }

  async submitReview(input: HumanReviewSubmitRequest): Promise<HumanReviewRequest> {
    const request = humanReviewSubmitRequestSchema.parse(input);
    return this.#mutate(async (state) => {
      const live = state.liveSession;
      if (!live) {
        throw new ProjectCollaborationError(
          "LIVE_SESSION_NOT_AVAILABLE",
          "A review request requires a live Studio session.",
        );
      }
      if (request.plan.documentVersion !== live.documentVersion) {
        throw new ProjectCollaborationError(
          "REVIEW_DOCUMENT_STALE",
          "The semantic plan no longer matches the live Studio document.",
        );
      }
      const existing = state.reviews.find((entry) => entry.requestId === request.requestId);
      if (existing) return [state, existing];

      const created = humanReviewRequestSchema.parse({
        requestId: request.requestId,
        status: "pending",
        actor: request.actor,
        ...(request.agentSessionId ? { agentSessionId: request.agentSessionId } : {}),
        createdAt: request.createdAt,
        expiresAt: request.expiresAt,
        semanticPlanId: request.plan.planId,
        documentVersion: request.plan.documentVersion,
        command: request.command,
        ...(request.rationale ? { rationale: request.rationale } : {}),
        applicationMode: request.plan.applicationMode,
        ...(request.plan.documentAfter ? { documentAfter: request.plan.documentAfter } : {}),
        sourcePlans: request.plan.sourcePlans,
      });
      const reviews = [created, ...state.reviews].slice(0, 500);
      return [{ ...state, reviews }, created];
    });
  }

  async listReviews(): Promise<readonly HumanReviewRequest[]> {
    return this.#mutate(async (state) => {
      const next = expireReviews(state, this.#now());
      return [next, next.reviews.map(clone)];
    });
  }

  async getReview(requestId: string): Promise<HumanReviewRequest> {
    const reviews = await this.listReviews();
    const request = reviews.find((entry) => entry.requestId === requestId);
    if (!request) {
      throw new ProjectCollaborationError(
        "REVIEW_REQUEST_NOT_FOUND",
        `Review request ${requestId} was not found.`,
      );
    }
    return request;
  }

  async decideReview(input: HumanReviewDecisionRequest): Promise<HumanReviewRequest> {
    const decision = humanReviewDecisionRequestSchema.parse(input);
    return this.#mutate(async (rawState) => {
      const state = expireReviews(rawState, this.#now());
      const index = state.reviews.findIndex((entry) => entry.requestId === decision.requestId);
      if (index < 0) {
        throw new ProjectCollaborationError(
          "REVIEW_REQUEST_NOT_FOUND",
          `Review request ${decision.requestId} was not found.`,
        );
      }
      const current = state.reviews[index]!;
      if (current.status !== "pending") {
        throw new ProjectCollaborationError(
          "REVIEW_REQUEST_NOT_PENDING",
          `Review request ${decision.requestId} is already ${current.status}.`,
        );
      }
      const live = state.liveSession;
      if (!live || live.documentVersion !== current.documentVersion) {
        throw new ProjectCollaborationError(
          "REVIEW_DOCUMENT_STALE",
          "The live Studio document changed after this request was planned.",
        );
      }
      const updated = humanReviewRequestSchema.parse({
        ...current,
        status: decision.decision,
        decision: {
          decision: decision.decision,
          decidedAt: new Date(this.#now()).toISOString(),
          decidedBy: decision.decidedBy,
          ...(decision.note ? { note: decision.note } : {}),
        },
      });
      const reviews = [...state.reviews];
      reviews[index] = updated;
      return [{ ...state, reviews }, updated];
    });
  }

  async saveExecutionPreparation(
    requestId: string,
    input: ReviewedExecutionPreparation,
  ): Promise<HumanReviewRequest> {
    const preparation = reviewedExecutionPreparationSchema.parse(input);
    return this.#mutate(async (state) => {
      const index = state.reviews.findIndex((entry) => entry.requestId === requestId);
      if (index < 0) {
        throw new ProjectCollaborationError(
          "REVIEW_REQUEST_NOT_FOUND",
          `Review request ${requestId} was not found.`,
        );
      }
      const current = state.reviews[index]!;
      if (current.status !== "approved") {
        throw new ProjectCollaborationError(
          "REVIEW_EXECUTION_NOT_APPROVED",
          "Only an approved review request can be prepared for execution.",
        );
      }
      if (current.execution) {
        throw new ProjectCollaborationError(
          "REVIEW_ALREADY_EXECUTED",
          `Review request ${requestId} already has execution ${current.execution.executionId}.`,
        );
      }
      const live = state.liveSession;
      if (
        !live
        || live.sessionId !== preparation.liveSessionId
        || live.revision !== preparation.liveRevision
        || live.documentVersion !== preparation.liveDocumentVersion
        || preparation.plan.documentVersion !== live.documentVersion
      ) {
        throw new ProjectCollaborationError(
          "REVIEW_PREPARATION_STALE",
          "The live Studio session changed while the execution preparation was being created.",
        );
      }
      const updated = humanReviewRequestSchema.parse({
        ...current,
        preparation,
      });
      const reviews = [...state.reviews];
      reviews[index] = updated;
      return [{ ...state, reviews }, updated];
    });
  }

  async recordExecution(input: ReviewedExecutionRecordRequest): Promise<HumanReviewRequest> {
    const request = reviewedExecutionRecordRequestSchema.parse(input);
    return this.#mutate(async (state) => {
      const index = state.reviews.findIndex((entry) => entry.requestId === request.requestId);
      if (index < 0) {
        throw new ProjectCollaborationError(
          "REVIEW_REQUEST_NOT_FOUND",
          `Review request ${request.requestId} was not found.`,
        );
      }
      const current = state.reviews[index]!;
      if (current.status !== "approved") {
        throw new ProjectCollaborationError(
          "REVIEW_EXECUTION_NOT_APPROVED",
          "Only an approved review request can record an execution.",
        );
      }
      if (current.execution) {
        throw new ProjectCollaborationError(
          "REVIEW_ALREADY_EXECUTED",
          `Review request ${request.requestId} already has execution ${current.execution.executionId}.`,
        );
      }
      const preparation = current.preparation;
      if (!preparation || preparation.preparationId !== request.preparationId) {
        throw new ProjectCollaborationError(
          "REVIEW_PREPARATION_MISMATCH",
          "The execution does not reference the latest prepared plan.",
        );
      }

      validateDocumentExecution(request, preparation);
      validateSourceExecution(request, preparation);

      const changedSourcePlans = preparation.plan.sourcePlans.filter((plan) => plan.changed);
      const appliedSourceResults = request.sourceResults.filter((entry) => entry.result.status === "applied");
      const allSourcesApplied = changedSourcePlans.length > 0
        && appliedSourceResults.length === changedSourcePlans.length;
      const someEffectApplied = request.documentApplied || appliedSourceResults.length > 0;
      const expectsDocument = preparation.plan.documentAfter !== undefined;
      const expectsSources = changedSourcePlans.length > 0;

      let status: "applied" | "document-only" | "source-only" | "partial" | "failed";
      if (expectsDocument && expectsSources && request.documentApplied && allSourcesApplied) status = "applied";
      else if (expectsDocument && !expectsSources && request.documentApplied) status = "document-only";
      else if (!expectsDocument && expectsSources && allSourcesApplied) status = "source-only";
      else if (someEffectApplied) status = "partial";
      else status = "failed";

      const execution = reviewedExecutionRecordSchema.parse({
        executionId: `execution_${randomUUID()}`,
        preparationId: request.preparationId,
        executedAt: new Date(this.#now()).toISOString(),
        executedBy: request.executedBy,
        status,
        documentApplied: request.documentApplied,
        ...(request.documentCommandId ? { documentCommandId: request.documentCommandId } : {}),
        ...(request.documentRevision === undefined ? {} : { documentRevision: request.documentRevision }),
        ...(request.documentVersionAfter ? { documentVersionAfter: request.documentVersionAfter } : {}),
        sourceResults: request.sourceResults,
      });
      const updated = humanReviewRequestSchema.parse({ ...current, execution });
      const reviews = [...state.reviews];
      reviews[index] = updated;
      return [{ ...state, reviews }, updated];
    });
  }

  async #read(): Promise<PersistedCollaborationState> {
    try {
      const raw = await readFile(this.#statePath, "utf8");
      const candidate = JSON.parse(raw) as PersistedCollaborationState;
      return {
        schemaVersion: 1,
        ...(candidate.liveSession
          ? { liveSession: liveSessionSnapshotSchema.parse(candidate.liveSession) }
          : {}),
        reviews: Array.isArray(candidate.reviews)
          ? candidate.reviews.map((entry) => humanReviewRequestSchema.parse(entry))
          : [],
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return EMPTY_STATE;
      throw error;
    }
  }

  async #write(state: PersistedCollaborationState): Promise<void> {
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
    operation: (state: PersistedCollaborationState) => Promise<readonly [PersistedCollaborationState, T]>,
  ): Promise<T> {
    let result!: T;
    const next = this.#queue.then(async () => {
      const state = await this.#read();
      const [updated, value] = await operation(state);
      if (JSON.stringify(updated) !== JSON.stringify(state)) await this.#write(updated);
      result = value;
    });
    this.#queue = next.catch(() => undefined);
    await next;
    return result;
  }
}

function validateDocumentExecution(
  request: ReviewedExecutionRecordRequest,
  preparation: ReviewedExecutionPreparation,
): void {
  const documentAfter = preparation.plan.documentAfter;
  if (!request.documentApplied) {
    if (request.documentCommandId || request.documentRevision !== undefined || request.documentVersionAfter) {
      throw new ProjectCollaborationError(
        "REVIEW_DOCUMENT_RECEIPT_UNEXPECTED",
        "Document command metadata cannot be recorded when the document was not applied.",
      );
    }
    return;
  }
  if (!documentAfter) {
    throw new ProjectCollaborationError(
      "REVIEW_DOCUMENT_EFFECT_MISSING",
      "The fresh semantic plan does not contain a document effect.",
    );
  }
  if (!request.documentCommandId || request.documentRevision === undefined || !request.documentVersionAfter) {
    throw new ProjectCollaborationError(
      "REVIEW_DOCUMENT_RECEIPT_INCOMPLETE",
      "A reversible document execution requires command ID, revision, and resulting document version.",
    );
  }
  const expectedVersion = createSemanticDocumentVersion(documentAfter);
  if (request.documentVersionAfter !== expectedVersion) {
    throw new ProjectCollaborationError(
      "REVIEW_DOCUMENT_RESULT_MISMATCH",
      "The recorded Studio document does not match the prepared document effect.",
    );
  }
}

function validateSourceExecution(
  request: ReviewedExecutionRecordRequest,
  preparation: ReviewedExecutionPreparation,
): void {
  const changedPlans = preparation.plan.sourcePlans.filter((plan) => plan.changed);
  const resultByPlan = new Map(request.sourceResults.map((entry) => [entry.planId, entry]));
  if (resultByPlan.size !== request.sourceResults.length) {
    throw new ProjectCollaborationError(
      "REVIEW_SOURCE_RESULT_DUPLICATE",
      "Each prepared source plan may appear only once in an execution record.",
    );
  }
  if (resultByPlan.size !== changedPlans.length) {
    throw new ProjectCollaborationError(
      "REVIEW_SOURCE_RESULT_INCOMPLETE",
      "Execution must record one result for every changed source plan in the fresh preparation.",
    );
  }
  for (const plan of changedPlans) {
    const entry = resultByPlan.get(plan.planId);
    if (
      !entry
      || entry.repositoryPath !== plan.repositoryPath
      || entry.sourceVersion !== plan.sourceVersion
      || entry.result.planId !== plan.planId
    ) {
      throw new ProjectCollaborationError(
        "REVIEW_SOURCE_RESULT_MISMATCH",
        `The execution result for ${plan.repositoryPath} does not match the prepared plan and source version.`,
      );
    }
  }
}

function expireReviews(
  state: PersistedCollaborationState,
  now: number,
): PersistedCollaborationState {
  let changed = false;
  const reviews = state.reviews.map((request) => {
    if (request.status === "pending" && Date.parse(request.expiresAt) <= now) {
      changed = true;
      return { ...request, status: "expired" as const };
    }
    return request;
  });
  return changed ? { ...state, reviews } : state;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
