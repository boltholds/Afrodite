import {
  planSemanticBatch,
  type SemanticBatchPlan as CoreSemanticBatchPlan,
} from "@afrodite/semantic-ops/batch";
import type {
  SemanticBatchPlanView,
} from "@afrodite/protocol/semantic-batch";
import type {
  BridgePatchPlanView,
  BridgeStyleOperation,
  BridgeTransactionOperation,
  BridgeTransactionPlanView,
  BridgeVariantOperation,
  SemanticOperationCommand,
} from "@afrodite/protocol";
import type { UiDocument } from "@afrodite/ui-ir";
import type { ProjectBridgeService } from "./service.js";

export async function planProjectSemanticBatch(
  service: ProjectBridgeService,
  document: UiDocument,
  commands: readonly SemanticOperationCommand[],
): Promise<SemanticBatchPlanView> {
  const semantic = planSemanticBatch(document, commands);
  let sourcePlans: BridgePatchPlanView[] = [];
  let sourceTransaction: BridgeTransactionPlanView | undefined;

  if (semantic.status === "ready" && semantic.sourceIntents.length > 1) {
    const operations: BridgeTransactionOperation[] = semantic.sourceIntents.map((intent) => (
      intent.type === "style"
        ? { type: "style", operation: intent.operation as BridgeStyleOperation }
        : { type: "variant", operation: intent.operation as BridgeVariantOperation }
    ));
    sourceTransaction = await service.planTransaction(operations);
    sourcePlans = sourceTransaction.files.map((file) => ({
      ...file,
      verification: sourceTransaction!.verification.map((step) => ({ ...step })),
    }));
  } else if (semantic.status === "ready") {
    for (const intent of semantic.sourceIntents) {
      if (intent.type === "style") {
        sourcePlans.push(await service.planStylePatch(intent.operation as BridgeStyleOperation));
      } else {
        sourcePlans.push(await service.planVariantPatch(intent.operation as BridgeVariantOperation));
      }
    }
  }

  return toProtocolView(semantic, sourcePlans, sourceTransaction);
}

function toProtocolView(
  semantic: CoreSemanticBatchPlan,
  sourcePlans: readonly BridgePatchPlanView[],
  sourceTransaction?: BridgeTransactionPlanView,
): SemanticBatchPlanView {
  return {
    apiVersion: 1,
    semanticApiVersion: 1,
    batchId: semantic.batchId,
    documentVersion: semantic.documentVersion,
    status: semantic.status,
    applicationMode: semantic.applicationMode,
    commands: semantic.commands.map(cloneJson),
    steps: semantic.steps.map((step) => ({
      index: step.index,
      command: cloneJson(step.command),
      planId: step.planId,
      status: step.status,
      applicationMode: step.applicationMode,
      documentVersionBefore: step.documentVersionBefore,
      ...(step.documentVersionAfter ? { documentVersionAfter: step.documentVersionAfter } : {}),
      sourceIntentCount: step.sourceIntentCount,
      diagnostics: step.diagnostics.map(cloneJson),
    })),
    diagnostics: semantic.diagnostics.map(cloneJson),
    sourcePlans: sourcePlans.map(cloneJson),
    ...(sourceTransaction ? { sourceTransaction: cloneJson(sourceTransaction) } : {}),
    ...(semantic.documentAfter ? { documentAfter: cloneJson(semantic.documentAfter) } : {}),
  };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
