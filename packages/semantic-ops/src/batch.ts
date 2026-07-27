import { parseUiDocument, type UiDocument } from "@afrodite/ui-ir";
import {
  applySemanticDocumentPlan,
  createSemanticDocumentVersion,
  planSemanticOperation,
  type SemanticApplicationMode,
  type SemanticDiagnostic,
  type SemanticOperationCommand,
  type SemanticOperationPlan,
  type SemanticSourceIntent,
} from "./index";

export const SEMANTIC_BATCH_MAX_COMMANDS = 16 as const;

export type SemanticBatchStatus = "ready" | "blocked";
export type SemanticBatchApplicationMode =
  | "document-and-source"
  | "document-only"
  | "mixed";

export interface SemanticBatchDiagnostic extends SemanticDiagnostic {
  readonly commandIndex?: number;
  readonly conflictKey?: string;
}

export interface SemanticBatchStepPlan {
  readonly index: number;
  readonly command: SemanticOperationCommand;
  readonly planId: string;
  readonly status: SemanticOperationPlan["status"];
  readonly applicationMode: SemanticApplicationMode;
  readonly documentVersionBefore: string;
  readonly documentVersionAfter?: string;
  readonly sourceIntentCount: number;
  readonly diagnostics: readonly SemanticBatchDiagnostic[];
}

export interface SemanticBatchPlan {
  readonly batchId: string;
  readonly documentVersion: string;
  readonly status: SemanticBatchStatus;
  readonly applicationMode: SemanticBatchApplicationMode;
  readonly commands: readonly SemanticOperationCommand[];
  readonly steps: readonly SemanticBatchStepPlan[];
  readonly diagnostics: readonly SemanticBatchDiagnostic[];
  readonly sourceIntents: readonly SemanticSourceIntent[];
  readonly sourceTargetPaths: readonly string[];
  readonly documentAfter?: UiDocument;
}

export interface SemanticBatchPlannerOptions {
  readonly maxCommands?: number;
}

export function planSemanticBatch(
  documentInput: UiDocument,
  commandsInput: readonly SemanticOperationCommand[],
  options: SemanticBatchPlannerOptions = {},
): SemanticBatchPlan {
  const document = parseUiDocument(documentInput);
  const documentVersion = createSemanticDocumentVersion(document);
  const commands = commandsInput.map(cloneJson);
  const maxCommands = normalizeMaxCommands(options.maxCommands);
  const diagnostics: SemanticBatchDiagnostic[] = [];

  if (commands.length === 0) {
    diagnostics.push(batchDiagnostic(
      "SEMANTIC_BATCH_EMPTY",
      "error",
      "A semantic batch requires at least one typed command.",
    ));
  }
  if (commands.length > maxCommands) {
    diagnostics.push(batchDiagnostic(
      "SEMANTIC_BATCH_LIMIT_EXCEEDED",
      "error",
      `The batch contains ${commands.length} commands; the current limit is ${maxCommands}.`,
    ));
  }

  diagnostics.push(...detectCommandConflicts(commands));

  const preflightSteps: SemanticBatchStepPlan[] = [];
  if (!hasErrors(diagnostics)) {
    commands.forEach((command, index) => {
      if (command.type === "explain_unpatchable_region") {
        const item = batchDiagnostic(
          "SEMANTIC_BATCH_INFORMATIONAL_COMMAND",
          "error",
          "Informational explanation commands cannot be mixed into an atomic mutation batch.",
          index,
          command.nodeId,
          "Run explain_unpatchable_region as a separate read-only operation.",
        );
        diagnostics.push(item);
        preflightSteps.push(blockedStep(index, command, documentVersion, [item]));
        return;
      }

      const preflight = planSemanticOperation(document, command);
      const stepDiagnostics = preflight.diagnostics.map((item) => withCommandIndex(item, index));
      preflightSteps.push(stepFromPlan(index, command, preflight, stepDiagnostics));
      if (preflight.status !== "ready") {
        diagnostics.push(batchDiagnostic(
          "SEMANTIC_BATCH_PREFLIGHT_BLOCKED",
          "error",
          `Command ${index + 1} (${command.type}) is not independently applicable to the input document.`,
          index,
          command.nodeId,
        ));
        diagnostics.push(...stepDiagnostics);
      }
    });
  }

  if (hasErrors(diagnostics)) {
    return blockedBatch(documentVersion, commands, preflightSteps, diagnostics);
  }

  let current = document;
  const steps: SemanticBatchStepPlan[] = [];
  const sourceIntents: SemanticSourceIntent[] = [];

  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index]!;
    const plan = planSemanticOperation(current, command);
    const stepDiagnostics = plan.diagnostics.map((item) => withCommandIndex(item, index));

    if (plan.status !== "ready" || !plan.documentAfter) {
      diagnostics.push(batchDiagnostic(
        "SEMANTIC_BATCH_COMPOSITION_BLOCKED",
        "error",
        `Command ${index + 1} became inapplicable after earlier commands were composed.`,
        index,
        command.nodeId,
        "Split the commands into separate reviewed operations or remove the conflicting step.",
      ));
      diagnostics.push(...stepDiagnostics);
      steps.push(stepFromPlan(index, command, plan, stepDiagnostics));
      return blockedBatch(documentVersion, commands, steps, diagnostics);
    }

    current = applySemanticDocumentPlan(current, plan);
    sourceIntents.push(...plan.sourceIntents.map(cloneJson));
    steps.push(stepFromPlan(
      index,
      command,
      plan,
      stepDiagnostics,
      createSemanticDocumentVersion(current),
    ));
    diagnostics.push(...stepDiagnostics);
  }

  const sourceConflictDiagnostics = detectSourceTargetConflicts(sourceIntents);
  if (sourceConflictDiagnostics.length > 0) {
    diagnostics.push(...sourceConflictDiagnostics);
    return blockedBatch(documentVersion, commands, steps, diagnostics);
  }

  const sourceTargetPaths = sourceIntents.map(sourceTargetPath);
  const sourceBackedSteps = steps.filter((step) => step.sourceIntentCount > 0).length;
  const applicationMode: SemanticBatchApplicationMode = sourceBackedSteps === 0
    ? "document-only"
    : sourceBackedSteps === steps.length
      ? "document-and-source"
      : "mixed";

  if (applicationMode === "mixed") {
    diagnostics.push(batchDiagnostic(
      "SEMANTIC_BATCH_MIXED_SOURCE_COVERAGE",
      "warning",
      "The complete UI document effect is reviewable, but only some commands have proven source representations.",
      undefined,
      undefined,
      "Review the document-only steps explicitly; source execution will cover only the listed source plans.",
    ));
  }

  const documentAfter = parseUiDocument(cloneJson(current));
  return {
    batchId: createBatchId(documentVersion, commands, documentAfter, sourceIntents),
    documentVersion,
    status: "ready",
    applicationMode,
    commands,
    steps,
    diagnostics,
    sourceIntents: sourceIntents.map(cloneJson),
    sourceTargetPaths,
    documentAfter,
  };
}

export function applySemanticBatchDocumentPlan(
  currentInput: UiDocument,
  plan: SemanticBatchPlan,
): UiDocument {
  const current = parseUiDocument(currentInput);
  if (createSemanticDocumentVersion(current) !== plan.documentVersion) {
    throw new Error("The semantic batch plan is stale for the current UI document.");
  }
  if (plan.status !== "ready" || !plan.documentAfter) {
    throw new Error("The semantic batch plan does not contain an applicable document mutation.");
  }
  return parseUiDocument(cloneJson(plan.documentAfter));
}

function detectCommandConflicts(
  commands: readonly SemanticOperationCommand[],
): SemanticBatchDiagnostic[] {
  const diagnostics: SemanticBatchDiagnostic[] = [];
  const owners = new Map<string, number>();

  commands.forEach((command, index) => {
    for (const key of commandWriteKeys(command)) {
      const previous = owners.get(key);
      if (previous === undefined) {
        owners.set(key, index);
        continue;
      }
      diagnostics.push(batchDiagnostic(
        "SEMANTIC_BATCH_WRITE_CONFLICT",
        "error",
        `Commands ${previous + 1} and ${index + 1} both write ${key}.`,
        index,
        command.nodeId,
        "Remove one command or split the writes into separately reviewed batches.",
        key,
      ));
    }
  });

  return diagnostics;
}

function commandWriteKeys(command: SemanticOperationCommand): readonly string[] {
  const prefix = `node:${command.nodeId}`;
  switch (command.type) {
    case "convert_to_grid":
      return [
        `${prefix}:layout.display`,
        ...(command.gap === undefined ? [] : [`${prefix}:layout.gap`]),
      ];
    case "create_responsive_variant":
      return [`${prefix}:variants.responsive:${command.variantId}`];
    case "replace_spacing_with_token":
      return [
        `${prefix}:sourceBinding.styleOwnership.tokenFilePath`,
        `${prefix}:sourceBinding.styleOwnership.tokens.${command.property}`,
      ];
    case "explain_unpatchable_region":
      return [];
  }
}

function detectSourceTargetConflicts(
  intents: readonly SemanticSourceIntent[],
): SemanticBatchDiagnostic[] {
  const diagnostics: SemanticBatchDiagnostic[] = [];
  const owners = new Map<string, number>();

  intents.forEach((intent, index) => {
    const path = sourceTargetPath(intent);
    const previous = owners.get(path);
    if (previous === undefined) {
      owners.set(path, index);
      return;
    }
    diagnostics.push(batchDiagnostic(
      "SEMANTIC_BATCH_SOURCE_FILE_CONFLICT",
      "error",
      `Source intents ${previous + 1} and ${index + 1} target the same file ${path}.`,
      undefined,
      intent.operation.nodeId,
      "Same-file AST merging is not proven. Split the operations or use distinct source targets.",
      `source:${path}`,
    ));
  });

  return diagnostics;
}

function sourceTargetPath(intent: SemanticSourceIntent): string {
  const ownership = intent.operation.ownership;
  switch (ownership.strategy) {
    case "inline":
    case "utility":
      return intent.operation.binding.repositoryPath;
    case "css-module":
      return ownership.stylesheetPath;
    case "design-token":
      return ownership.tokenFilePath;
  }
}

function stepFromPlan(
  index: number,
  command: SemanticOperationCommand,
  plan: SemanticOperationPlan,
  diagnostics: readonly SemanticBatchDiagnostic[],
  documentVersionAfter?: string,
): SemanticBatchStepPlan {
  return {
    index,
    command: cloneJson(command),
    planId: plan.planId,
    status: plan.status,
    applicationMode: plan.applicationMode,
    documentVersionBefore: plan.documentVersion,
    ...(documentVersionAfter ? { documentVersionAfter } : {}),
    sourceIntentCount: plan.sourceIntents.length,
    diagnostics: diagnostics.map(cloneJson),
  };
}

function blockedStep(
  index: number,
  command: SemanticOperationCommand,
  documentVersion: string,
  diagnostics: readonly SemanticBatchDiagnostic[],
): SemanticBatchStepPlan {
  return {
    index,
    command: cloneJson(command),
    planId: `semantic-blocked:${index}`,
    status: "blocked",
    applicationMode: "informational",
    documentVersionBefore: documentVersion,
    sourceIntentCount: 0,
    diagnostics: diagnostics.map(cloneJson),
  };
}

function blockedBatch(
  documentVersion: string,
  commands: readonly SemanticOperationCommand[],
  steps: readonly SemanticBatchStepPlan[],
  diagnostics: readonly SemanticBatchDiagnostic[],
): SemanticBatchPlan {
  return {
    batchId: createBatchId(documentVersion, commands, undefined, []),
    documentVersion,
    status: "blocked",
    applicationMode: "document-only",
    commands: commands.map(cloneJson),
    steps: steps.map(cloneJson),
    diagnostics: diagnostics.map(cloneJson),
    sourceIntents: [],
    sourceTargetPaths: [],
  };
}

function withCommandIndex(
  diagnostic: SemanticDiagnostic,
  commandIndex: number,
): SemanticBatchDiagnostic {
  return { ...diagnostic, commandIndex };
}

function batchDiagnostic(
  code: string,
  severity: SemanticBatchDiagnostic["severity"],
  message: string,
  commandIndex?: number,
  nodeId?: string,
  requirement?: string,
  conflictKey?: string,
): SemanticBatchDiagnostic {
  return {
    code,
    severity,
    message,
    ...(commandIndex === undefined ? {} : { commandIndex }),
    ...(nodeId ? { nodeId } : {}),
    ...(requirement ? { requirement } : {}),
    ...(conflictKey ? { conflictKey } : {}),
  };
}

function hasErrors(diagnostics: readonly SemanticBatchDiagnostic[]): boolean {
  return diagnostics.some((item) => item.severity === "error");
}

function normalizeMaxCommands(value: number | undefined): number {
  if (value === undefined) return SEMANTIC_BATCH_MAX_COMMANDS;
  if (!Number.isInteger(value) || value <= 0 || value > SEMANTIC_BATCH_MAX_COMMANDS) {
    throw new Error(`maxCommands must be an integer from 1 to ${SEMANTIC_BATCH_MAX_COMMANDS}.`);
  }
  return value;
}

function createBatchId(
  documentVersion: string,
  commands: readonly SemanticOperationCommand[],
  documentAfter: UiDocument | undefined,
  sourceIntents: readonly SemanticSourceIntent[],
): string {
  return `semantic-batch:${fnv1a32(stableStringify({
    documentVersion,
    commands,
    documentAfter,
    sourceIntents,
  }))}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
