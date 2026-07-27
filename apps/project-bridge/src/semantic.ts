import {
  planSemanticOperation,
  type SemanticOperationCommand as CoreSemanticOperationCommand,
} from "@afrodite/semantic-ops";
import type {
  BridgePatchPlanView,
  BridgeStyleOperation,
  BridgeTransactionOperation,
  BridgeTransactionPlanView,
  BridgeVariantOperation,
  SemanticOperationCommand,
  SemanticPlanView,
} from "@afrodite/protocol";
import type { UiDocument } from "@afrodite/ui-ir";
import type { ProjectBridgeService } from "./service.js";

export interface ProjectSemanticPlanBundle {
  readonly plan: SemanticPlanView;
  readonly transaction?: BridgeTransactionPlanView;
}

export async function planProjectSemanticOperation(
  service: ProjectBridgeService,
  document: UiDocument,
  command: SemanticOperationCommand,
): Promise<SemanticPlanView> {
  return (await planProjectSemanticOperationBundle(service, document, command)).plan;
}

export async function planProjectSemanticOperationBundle(
  service: ProjectBridgeService,
  document: UiDocument,
  command: SemanticOperationCommand,
): Promise<ProjectSemanticPlanBundle> {
  const semantic = planSemanticOperation(
    document,
    command as CoreSemanticOperationCommand,
  );

  let sourcePlans: BridgePatchPlanView[] = [];
  let transaction: BridgeTransactionPlanView | undefined;

  if (semantic.sourceIntents.length > 1) {
    const operations: BridgeTransactionOperation[] = semantic.sourceIntents.map((intent) => (
      intent.type === "style"
        ? { type: "style", operation: intent.operation as BridgeStyleOperation }
        : { type: "variant", operation: intent.operation as BridgeVariantOperation }
    ));
    transaction = await service.planTransaction(operations);
    sourcePlans = transaction.files.map((file) => ({
      ...file,
      verification: transaction!.verification.map((step) => ({ ...step })),
    }));
  } else {
    for (const intent of semantic.sourceIntents) {
      if (intent.type === "style") {
        sourcePlans.push(await service.planStylePatch(intent.operation as BridgeStyleOperation));
      } else {
        sourcePlans.push(await service.planVariantPatch(intent.operation as BridgeVariantOperation));
      }
    }
  }

  const plan: SemanticPlanView = {
    apiVersion: 1,
    planId: semantic.planId,
    documentVersion: semantic.documentVersion,
    status: semantic.status,
    applicationMode: semantic.applicationMode,
    capabilities: {
      documentMutation: semantic.capabilities.documentMutation,
      sourcePlanning: semantic.capabilities.sourcePlanning,
      ...(semantic.capabilities.sourceRepresentation
        ? { sourceRepresentation: semantic.capabilities.sourceRepresentation }
        : {}),
      requirements: [...semantic.capabilities.requirements],
    },
    diagnostics: semantic.diagnostics.map((diagnostic) => ({ ...diagnostic })),
    ...(semantic.documentAfter ? { documentAfter: semantic.documentAfter } : {}),
    ...(semantic.explanation
      ? {
          explanation: {
            summary: semantic.explanation.summary,
            facts: [...semantic.explanation.facts],
            nextActions: [...semantic.explanation.nextActions],
          },
        }
      : {}),
    sourcePlans,
  };

  return {
    plan,
    ...(transaction ? { transaction } : {}),
  };
}
