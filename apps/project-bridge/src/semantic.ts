import {
  planSemanticOperation,
  type SemanticOperationCommand as CoreSemanticOperationCommand,
} from "@afrodite/semantic-ops";
import type {
  BridgeStyleOperation,
  BridgeVariantOperation,
  SemanticOperationCommand,
  SemanticPlanView,
} from "@afrodite/protocol";
import type { UiDocument } from "@afrodite/ui-ir";
import type { ProjectBridgeService } from "./service.js";

export async function planProjectSemanticOperation(
  service: ProjectBridgeService,
  document: UiDocument,
  command: SemanticOperationCommand,
): Promise<SemanticPlanView> {
  const semantic = planSemanticOperation(
    document,
    command as CoreSemanticOperationCommand,
  );
  const sourcePlans = [];

  for (const intent of semantic.sourceIntents) {
    if (intent.type === "style") {
      sourcePlans.push(await service.planStylePatch(intent.operation as BridgeStyleOperation));
    } else {
      sourcePlans.push(await service.planVariantPatch(intent.operation as BridgeVariantOperation));
    }
  }

  return {
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
}
