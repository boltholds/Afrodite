import { randomUUID } from "node:crypto";
import {
  reviewedExecutionPreparationSchema,
  reviewedExecutionPrepareRequestSchema,
  type BridgePatchPlanView,
  type HumanReviewRequest,
  type ReviewedDocumentComparison,
  type ReviewedExecutionComparison,
  type ReviewedExecutionPrepareRequest,
  type ReviewedSourceComparison,
  type SemanticPlanView,
} from "@afrodite/protocol";
import { createSemanticDocumentVersion } from "@afrodite/semantic-ops";
import {
  ProjectCollaborationError,
  type ProjectCollaborationStore,
} from "./collaboration.js";
import { planProjectSemanticOperation } from "./semantic.js";
import type { ProjectBridgeService } from "./service.js";

export interface ReviewedExecutionServiceOptions {
  readonly collaboration: ProjectCollaborationStore;
  readonly projectBridge: ProjectBridgeService;
  readonly now?: () => number;
  readonly idFactory?: () => string;
}

export class ReviewedExecutionService {
  readonly #collaboration: ProjectCollaborationStore;
  readonly #projectBridge: ProjectBridgeService;
  readonly #now: () => number;
  readonly #idFactory: () => string;

  constructor(options: ReviewedExecutionServiceOptions) {
    this.#collaboration = options.collaboration;
    this.#projectBridge = options.projectBridge;
    this.#now = options.now ?? Date.now;
    this.#idFactory = options.idFactory ?? randomUUID;
  }

  async prepare(input: ReviewedExecutionPrepareRequest): Promise<HumanReviewRequest> {
    const request = reviewedExecutionPrepareRequestSchema.parse(input);
    const review = await this.#collaboration.getReview(request.requestId);
    if (review.status !== "approved") {
      throw new ProjectCollaborationError(
        "REVIEW_EXECUTION_NOT_APPROVED",
        "Only an approved review request can be prepared for execution.",
      );
    }
    if (review.execution) {
      throw new ProjectCollaborationError(
        "REVIEW_ALREADY_EXECUTED",
        `Review request ${review.requestId} already has execution ${review.execution.executionId}.`,
      );
    }

    const live = await this.#collaboration.readSession();
    const freshPlan = await planProjectSemanticOperation(
      this.#projectBridge,
      live.document,
      review.command,
    );
    const preparation = reviewedExecutionPreparationSchema.parse({
      preparationId: `preparation_${this.#idFactory()}`,
      preparedAt: new Date(this.#now()).toISOString(),
      preparedBy: request.preparedBy,
      liveSessionId: live.sessionId,
      liveRevision: live.revision,
      liveDocumentVersion: live.documentVersion,
      plan: freshPlan,
      comparison: compareReviewedEffects(review, freshPlan),
    });
    return this.#collaboration.saveExecutionPreparation(review.requestId, preparation);
  }
}

export function compareReviewedEffects(
  review: HumanReviewRequest,
  freshPlan: SemanticPlanView,
): ReviewedExecutionComparison {
  const document = compareDocuments(review, freshPlan);
  const sources = compareSources(review.sourcePlans, freshPlan.sourcePlans);
  const applicationModeMatches = review.applicationMode === freshPlan.applicationMode;
  const exactMatch = freshPlan.status === "ready"
    && applicationModeMatches
    && (document.status === "none" || document.status === "identical")
    && sources.every((source) => source.status === "identical");

  let summary: string;
  if (freshPlan.status !== "ready") {
    summary = `Fresh planning returned ${freshPlan.status}; execution is blocked until the semantic command becomes ready.`;
  } else if (exactMatch) {
    summary = "Fresh planning reproduced the exact reviewed document and source effects.";
  } else {
    const changedSources = sources.filter((source) => source.status !== "identical").length;
    const documentChanged = document.status !== "none" && document.status !== "identical";
    summary = `Fresh planning differs from the approved snapshot${documentChanged ? " in the document effect" : ""}${documentChanged && changedSources ? " and" : ""}${changedSources ? ` in ${changedSources} source effect${changedSources === 1 ? "" : "s"}` : ""}. Review the fresh result before execution.`;
  }

  return {
    exactMatch,
    applicationModeMatches,
    document,
    sources,
    summary,
  };
}

function compareDocuments(
  review: HumanReviewRequest,
  freshPlan: SemanticPlanView,
): ReviewedDocumentComparison {
  const approved = review.documentAfter;
  const fresh = freshPlan.documentAfter;
  if (!approved && !fresh) return { status: "none" };
  if (!approved && fresh) {
    return {
      status: "added",
      freshDocumentVersion: createSemanticDocumentVersion(fresh),
    };
  }
  if (approved && !fresh) {
    return {
      status: "removed",
      approvedDocumentVersion: createSemanticDocumentVersion(approved),
    };
  }
  const approvedDocumentVersion = createSemanticDocumentVersion(approved!);
  const freshDocumentVersion = createSemanticDocumentVersion(fresh!);
  return {
    status: approvedDocumentVersion === freshDocumentVersion ? "identical" : "changed",
    approvedDocumentVersion,
    freshDocumentVersion,
  };
}

function compareSources(
  approvedPlans: readonly BridgePatchPlanView[],
  freshPlans: readonly BridgePatchPlanView[],
): ReviewedSourceComparison[] {
  const approved = [...approvedPlans].sort(comparePlanIdentity);
  const fresh = [...freshPlans].sort(comparePlanIdentity);
  const paths = [...new Set([
    ...approved.map((plan) => plan.repositoryPath),
    ...fresh.map((plan) => plan.repositoryPath),
  ])].sort();
  const comparisons: ReviewedSourceComparison[] = [];

  for (const repositoryPath of paths) {
    const approvedAtPath = approved.filter((plan) => plan.repositoryPath === repositoryPath);
    const freshAtPath = fresh.filter((plan) => plan.repositoryPath === repositoryPath);
    const count = Math.max(approvedAtPath.length, freshAtPath.length);
    for (let index = 0; index < count; index += 1) {
      const approvedPlan = approvedAtPath[index];
      const freshPlan = freshAtPath[index];
      if (!approvedPlan && freshPlan) {
        comparisons.push({
          repositoryPath,
          status: "added",
          freshPlanId: freshPlan.planId,
          freshSourceVersion: freshPlan.sourceVersion,
        });
      } else if (approvedPlan && !freshPlan) {
        comparisons.push({
          repositoryPath,
          status: "removed",
          approvedPlanId: approvedPlan.planId,
          approvedSourceVersion: approvedPlan.sourceVersion,
        });
      } else if (approvedPlan && freshPlan) {
        comparisons.push({
          repositoryPath,
          status: sameSourceEffect(approvedPlan, freshPlan) ? "identical" : "changed",
          approvedPlanId: approvedPlan.planId,
          freshPlanId: freshPlan.planId,
          approvedSourceVersion: approvedPlan.sourceVersion,
          freshSourceVersion: freshPlan.sourceVersion,
        });
      }
    }
  }
  return comparisons;
}

function sameSourceEffect(
  approved: BridgePatchPlanView,
  fresh: BridgePatchPlanView,
): boolean {
  return JSON.stringify(normalizeSourceEffect(approved)) === JSON.stringify(normalizeSourceEffect(fresh));
}

function normalizeSourceEffect(plan: BridgePatchPlanView) {
  return {
    repositoryPath: plan.repositoryPath,
    sourceVersion: plan.sourceVersion,
    changed: plan.changed,
    diff: plan.diff,
    diagnostics: plan.diagnostics,
    verification: plan.verification,
  };
}

function comparePlanIdentity(left: BridgePatchPlanView, right: BridgePatchPlanView): number {
  return left.repositoryPath.localeCompare(right.repositoryPath)
    || left.planId.localeCompare(right.planId);
}
