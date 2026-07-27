import { createReplaceDocumentCommand } from "@afrodite/canvas-engine";
import { parseUiDocument, type UiDocument } from "@afrodite/ui-ir";
import {
  currentLiveProjectSessionState,
  executeLiveCommand,
  replaceCurrentLiveProjectSessionState,
  selectLiveNode,
} from "./index";

export interface LiveProjectDocumentExecutionRequest {
  readonly document: UiDocument;
  readonly label: string;
  readonly expectedRevision?: number;
  readonly reviewRequestId?: string;
  readonly preparationId?: string;
}

export interface LiveProjectDocumentExecutionReceipt {
  readonly commandId: string;
  readonly revision: number;
  readonly document: UiDocument;
}

export class LiveProjectDocumentExecutionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "LiveProjectDocumentExecutionError";
    this.code = code;
  }
}

export async function executeLiveProjectDocumentReplacement(
  input: LiveProjectDocumentExecutionRequest,
): Promise<LiveProjectDocumentExecutionReceipt> {
  const current = currentLiveProjectSessionState();
  if (!current) {
    throw new LiveProjectDocumentExecutionError(
      "LIVE_PROJECT_EXECUTOR_UNAVAILABLE",
      "No active Afrodite project session has been registered in this browser session.",
    );
  }
  if (
    input.expectedRevision !== undefined
    && current.revision !== input.expectedRevision
  ) {
    throw new LiveProjectDocumentExecutionError(
      "LIVE_PROJECT_REVISION_STALE",
      `Prepared revision ${input.expectedRevision} no longer matches current revision ${current.revision}.`,
    );
  }

  const document = parseUiDocument(input.document);
  const command = createReplaceDocumentCommand(
    current.history.present,
    document,
    input.label,
  );
  let next = executeLiveCommand(current, command, {
    invalidateAllPatchState: true,
  });
  next = selectLiveNode(next, document.root.id);
  replaceCurrentLiveProjectSessionState(next);

  return {
    commandId: command.id,
    revision: next.revision,
    document: next.history.present,
  };
}
