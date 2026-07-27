import {
  executeCommand,
  findNode,
  redoCommand,
  undoCommand,
  type CommandHistoryState,
  type DocumentCommand,
} from "@afrodite/canvas-engine";
import type {
  BridgeApplyResult,
  BridgePatchPlanView,
  BridgeSourceSnapshot,
} from "@afrodite/protocol";
import type { Layout, SourceBinding, UiDocument, UiNode } from "@afrodite/ui-ir";

export type StudioWorkspace = "canvas" | "source-sync";
export type LayoutTransitionPhase = "execute" | "undo" | "redo";

export interface LayoutCommandMetadata {
  readonly nodeId: string;
  readonly before: Layout;
  readonly after: Layout;
  readonly binding?: SourceBinding;
}

export interface LayoutTransition extends LayoutCommandMetadata {
  readonly id: string;
  readonly commandId: string;
  readonly phase: LayoutTransitionPhase;
  readonly revision: number;
  readonly createdAt: string;
}

export interface PendingLayoutOperation {
  readonly nodeId: string;
  readonly before: Layout;
  readonly after: Layout;
  readonly binding?: SourceBinding;
  readonly transitionIds: readonly string[];
  readonly fromRevision: number;
  readonly toRevision: number;
}

export interface LiveProjectSessionState {
  readonly workspace: StudioWorkspace;
  readonly history: CommandHistoryState;
  readonly selectedNodeId: string;
  readonly revision: number;
  readonly commandLayouts: Readonly<Record<string, LayoutCommandMetadata>>;
  readonly layoutTransitions: readonly LayoutTransition[];
  readonly syncCursorByNode: Readonly<Record<string, number>>;
  readonly sourceSnapshots: Readonly<Record<string, BridgeSourceSnapshot>>;
  readonly patchPlans: Readonly<Record<string, BridgePatchPlanView>>;
  readonly writeResults: Readonly<Record<string, BridgeApplyResult>>;
}

export interface LiveProjectSessionSnapshot {
  readonly revision: number;
  readonly document: UiDocument;
}

export type LiveProjectSessionListener = (snapshot: LiveProjectSessionSnapshot) => void;

const liveSessionListeners = new Set<LiveProjectSessionListener>();
const publishedSessionStates = new WeakSet<object>();
let activeBrowserSession: LiveProjectSessionState | undefined;

export function subscribeLiveProjectSession(
  listener: LiveProjectSessionListener,
): () => void {
  liveSessionListeners.add(listener);
  if (activeBrowserSession) {
    queueMicrotask(() => listener(createSnapshot(activeBrowserSession!)));
  }
  return () => liveSessionListeners.delete(listener);
}

export function currentLiveProjectSessionState(): LiveProjectSessionState | undefined {
  return activeBrowserSession;
}

export function replaceCurrentLiveProjectSessionState(
  state: LiveProjectSessionState,
): LiveProjectSessionState {
  if (typeof window !== "undefined") activeBrowserSession = state;
  publishLiveSessionSnapshot(state);
  return state;
}

export interface ExecuteLiveCommandOptions {
  readonly layout?: LayoutCommandMetadata;
  readonly invalidateAllPatchState?: boolean;
  readonly now?: string;
}

export function createLiveProjectSession(
  document: UiDocument,
  selectedNodeId = document.root.id,
): LiveProjectSessionState {
  if (typeof window !== "undefined" && activeBrowserSession) return activeBrowserSession;
  const created: LiveProjectSessionState = {
    workspace: "canvas",
    history: { present: document, past: [], future: [] },
    selectedNodeId: findNode(document.root, selectedNodeId)?.id ?? document.root.id,
    revision: 0,
    commandLayouts: {},
    layoutTransitions: [],
    syncCursorByNode: {},
    sourceSnapshots: {},
    patchPlans: {},
    writeResults: {},
  };
  if (typeof window !== "undefined") activeBrowserSession = created;
  return created;
}

export function sessionDocument(state: LiveProjectSessionState): UiDocument {
  if (typeof window !== "undefined") activeBrowserSession = state;
  publishLiveSessionSnapshot(state);
  return state.history.present;
}

export function sessionSelectedNode(state: LiveProjectSessionState): UiNode | undefined {
  return findNode(state.history.present.root, state.selectedNodeId);
}

export function setLiveWorkspace(
  state: LiveProjectSessionState,
  workspace: StudioWorkspace,
): LiveProjectSessionState {
  return state.workspace === workspace ? state : { ...state, workspace };
}

export function selectLiveNode(
  state: LiveProjectSessionState,
  nodeId: string,
): LiveProjectSessionState {
  if (!findNode(state.history.present.root, nodeId)) return state;
  return state.selectedNodeId === nodeId ? state : { ...state, selectedNodeId: nodeId };
}

export function executeLiveCommand(
  state: LiveProjectSessionState,
  command: DocumentCommand,
  options: ExecuteLiveCommandOptions = {},
): LiveProjectSessionState {
  const revision = state.revision + 1;
  const layout = options.layout ? cloneLayoutMetadata(options.layout) : undefined;
  let next: LiveProjectSessionState = {
    ...state,
    history: executeCommand(state.history, command),
    revision,
    ...(layout
      ? {
          commandLayouts: {
            ...state.commandLayouts,
            [command.id]: layout,
          },
          layoutTransitions: [
            ...state.layoutTransitions,
            createTransition(command.id, "execute", revision, layout, options.now),
          ],
        }
      : {}),
  };

  if (options.invalidateAllPatchState) next = clearAllPatchState(next);
  else if (layout) next = clearNodePatchState(next, layout.nodeId);

  return ensureValidSelection(next);
}

export function undoLiveCommand(
  state: LiveProjectSessionState,
  now?: string,
): LiveProjectSessionState {
  const command = state.history.past.at(-1);
  if (!command) return state;

  const revision = state.revision + 1;
  const metadata = state.commandLayouts[command.id];
  let next: LiveProjectSessionState = {
    ...state,
    history: undoCommand(state.history),
    revision,
    ...(metadata
      ? {
          layoutTransitions: [
            ...state.layoutTransitions,
            createTransition(
              command.id,
              "undo",
              revision,
              {
                nodeId: metadata.nodeId,
                before: metadata.after,
                after: metadata.before,
                ...(metadata.binding ? { binding: metadata.binding } : {}),
              },
              now,
            ),
          ],
        }
      : {}),
  };

  if (metadata) next = clearNodePatchState(next, metadata.nodeId);
  return ensureValidSelection(next);
}

export function redoLiveCommand(
  state: LiveProjectSessionState,
  now?: string,
): LiveProjectSessionState {
  const command = state.history.future[0];
  if (!command) return state;

  const revision = state.revision + 1;
  const metadata = state.commandLayouts[command.id];
  let next: LiveProjectSessionState = {
    ...state,
    history: redoCommand(state.history),
    revision,
    ...(metadata
      ? {
          layoutTransitions: [
            ...state.layoutTransitions,
            createTransition(command.id, "redo", revision, metadata, now),
          ],
        }
      : {}),
  };

  if (metadata) next = clearNodePatchState(next, metadata.nodeId);
  return ensureValidSelection(next);
}

export function getPendingLayoutOperation(
  state: LiveProjectSessionState,
  nodeId: string,
): PendingLayoutOperation | undefined {
  const cursor = state.syncCursorByNode[nodeId] ?? 0;
  const transitions = state.layoutTransitions
    .slice(cursor)
    .filter((transition) => transition.nodeId === nodeId);
  const first = transitions[0];
  const last = transitions.at(-1);
  if (!first || !last) return undefined;

  const nodeBinding = findNode(state.history.present.root, nodeId)?.sourceBinding;
  const binding = last.binding ?? first.binding ?? nodeBinding;

  return {
    nodeId,
    before: cloneLayout(first.before),
    after: cloneLayout(last.after),
    ...(binding ? { binding: { ...binding } } : {}),
    transitionIds: transitions.map((transition) => transition.id),
    fromRevision: first.revision,
    toRevision: last.revision,
  };
}

export function cacheSourceSnapshot(
  state: LiveProjectSessionState,
  nodeId: string,
  snapshot: BridgeSourceSnapshot,
): LiveProjectSessionState {
  const currentPlan = state.patchPlans[nodeId];
  const sourceSnapshots = {
    ...state.sourceSnapshots,
    [nodeId]: { ...snapshot },
  };

  if (!currentPlan || currentPlan.sourceVersion === snapshot.version) {
    return { ...state, sourceSnapshots };
  }

  return {
    ...state,
    sourceSnapshots,
    patchPlans: omitKey(state.patchPlans, nodeId),
  };
}

export function cachePatchPlan(
  state: LiveProjectSessionState,
  nodeId: string,
  plan: BridgePatchPlanView,
): LiveProjectSessionState {
  return {
    ...state,
    patchPlans: {
      ...state.patchPlans,
      [nodeId]: {
        ...plan,
        diagnostics: plan.diagnostics.map((diagnostic) => ({ ...diagnostic })),
        verification: plan.verification.map((step) => ({ ...step })),
      },
    },
    writeResults: omitKey(state.writeResults, nodeId),
  };
}

export function cacheWriteResult(
  state: LiveProjectSessionState,
  nodeId: string,
  result: BridgeApplyResult,
): LiveProjectSessionState {
  return {
    ...state,
    writeResults: {
      ...state.writeResults,
      [nodeId]: cloneWriteResult(result),
    },
  };
}

export function markNodeSynchronized(
  state: LiveProjectSessionState,
  nodeId: string,
  result?: BridgeApplyResult,
): LiveProjectSessionState {
  return {
    ...state,
    syncCursorByNode: {
      ...state.syncCursorByNode,
      [nodeId]: state.layoutTransitions.length,
    },
    patchPlans: omitKey(state.patchPlans, nodeId),
    ...(result
      ? {
          writeResults: {
            ...state.writeResults,
            [nodeId]: cloneWriteResult(result),
          },
        }
      : {}),
  };
}

export function clearNodePatchState(
  state: LiveProjectSessionState,
  nodeId: string,
): LiveProjectSessionState {
  if (!state.patchPlans[nodeId] && !state.writeResults[nodeId]) return state;
  return {
    ...state,
    patchPlans: omitKey(state.patchPlans, nodeId),
    writeResults: omitKey(state.writeResults, nodeId),
  };
}

function clearAllPatchState(state: LiveProjectSessionState): LiveProjectSessionState {
  if (Object.keys(state.patchPlans).length === 0 && Object.keys(state.writeResults).length === 0) {
    return state;
  }
  return { ...state, patchPlans: {}, writeResults: {} };
}

function ensureValidSelection(state: LiveProjectSessionState): LiveProjectSessionState {
  if (findNode(state.history.present.root, state.selectedNodeId)) return state;
  return { ...state, selectedNodeId: state.history.present.root.id };
}

function publishLiveSessionSnapshot(state: LiveProjectSessionState): void {
  if (liveSessionListeners.size === 0 || publishedSessionStates.has(state)) return;
  publishedSessionStates.add(state);
  const snapshot = createSnapshot(state);
  queueMicrotask(() => {
    for (const listener of liveSessionListeners) listener(snapshot);
  });
}

function createSnapshot(state: LiveProjectSessionState): LiveProjectSessionSnapshot {
  return {
    revision: state.revision,
    document: state.history.present,
  };
}

function createTransition(
  commandId: string,
  phase: LayoutTransitionPhase,
  revision: number,
  metadata: LayoutCommandMetadata,
  now?: string,
): LayoutTransition {
  return {
    id: `layout-transition:${revision}:${phase}:${commandId}`,
    commandId,
    phase,
    revision,
    createdAt: now ?? new Date().toISOString(),
    ...cloneLayoutMetadata(metadata),
  };
}

function cloneLayoutMetadata(metadata: LayoutCommandMetadata): LayoutCommandMetadata {
  return {
    nodeId: metadata.nodeId,
    before: cloneLayout(metadata.before),
    after: cloneLayout(metadata.after),
    ...(metadata.binding ? { binding: { ...metadata.binding } } : {}),
  };
}

function cloneLayout(layout: Layout): Layout {
  return { ...layout, sizing: { ...layout.sizing } };
}

function cloneWriteResult(result: BridgeApplyResult): BridgeApplyResult {
  return {
    ...result,
    diagnostics: result.diagnostics.map((diagnostic) => ({ ...diagnostic })),
    verification: result.verification.map((execution) => ({
      ...execution,
      step: { ...execution.step },
    })),
  };
}

function omitKey<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}
