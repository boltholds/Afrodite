import { parseUiDocument, type UiDocument } from "@afrodite/ui-ir";

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

export type LiveProjectDocumentExecutor = (
  request: LiveProjectDocumentExecutionRequest,
) => Promise<LiveProjectDocumentExecutionReceipt> | LiveProjectDocumentExecutionReceipt;

let activeExecutor: LiveProjectDocumentExecutor | undefined;

export class LiveProjectDocumentExecutionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "LiveProjectDocumentExecutionError";
    this.code = code;
  }
}

export function registerLiveProjectDocumentExecutor(
  executor: LiveProjectDocumentExecutor,
): () => void {
  activeExecutor = executor;
  return () => {
    if (activeExecutor === executor) activeExecutor = undefined;
  };
}

export async function executeLiveProjectDocumentReplacement(
  input: LiveProjectDocumentExecutionRequest,
): Promise<LiveProjectDocumentExecutionReceipt> {
  const executor = activeExecutor;
  if (!executor) {
    throw new LiveProjectDocumentExecutionError(
      "LIVE_PROJECT_EXECUTOR_UNAVAILABLE",
      "The active Studio project session is not mounted.",
    );
  }
  const request: LiveProjectDocumentExecutionRequest = {
    document: parseUiDocument(input.document),
    label: input.label,
    ...(input.expectedRevision === undefined ? {} : { expectedRevision: input.expectedRevision }),
    ...(input.reviewRequestId ? { reviewRequestId: input.reviewRequestId } : {}),
    ...(input.preparationId ? { preparationId: input.preparationId } : {}),
  };
  return executor(request);
}
