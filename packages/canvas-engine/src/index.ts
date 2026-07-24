import type { Layout, UiDocument, UiNode } from "@afrodite/ui-ir";

export type LayoutPatch = Partial<Omit<Layout, "sizing">> & {
  sizing?: Partial<Layout["sizing"]>;
};

export interface DocumentCommand {
  readonly id: string;
  readonly label: string;
  apply(document: UiDocument): UiDocument;
  revert(document: UiDocument): UiDocument;
}

export interface CommandHistoryState {
  readonly present: UiDocument;
  readonly past: readonly DocumentCommand[];
  readonly future: readonly DocumentCommand[];
}

let commandSequence = 0;

export function createCommandHistory(document: UiDocument): CommandHistoryState {
  return { present: document, past: [], future: [] };
}

export function executeCommand(
  state: CommandHistoryState,
  command: DocumentCommand,
): CommandHistoryState {
  return {
    present: command.apply(state.present),
    past: [...state.past, command],
    future: [],
  };
}

export function undoCommand(state: CommandHistoryState): CommandHistoryState {
  const command = state.past.at(-1);
  if (!command) return state;

  return {
    present: command.revert(state.present),
    past: state.past.slice(0, -1),
    future: [command, ...state.future],
  };
}

export function redoCommand(state: CommandHistoryState): CommandHistoryState {
  const command = state.future[0];
  if (!command) return state;

  return {
    present: command.apply(state.present),
    past: [...state.past, command],
    future: state.future.slice(1),
  };
}

export function canUndo(state: CommandHistoryState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: CommandHistoryState): boolean {
  return state.future.length > 0;
}

export function createLayoutCommand(
  document: UiDocument,
  nodeId: string,
  patch: LayoutPatch,
  label = "Update layout",
): DocumentCommand {
  const node = findNode(document.root, nodeId);
  if (!node) {
    throw new Error(`Cannot create layout command: node ${nodeId} was not found`);
  }

  const before = cloneLayout(node.layout);
  const after = mergeLayout(before, patch);

  return {
    id: createCommandId("layout", nodeId),
    label,
    apply: (current) => replaceNodeLayout(current, nodeId, after),
    revert: (current) => replaceNodeLayout(current, nodeId, before),
  };
}

export function createReplaceDocumentCommand(
  before: UiDocument,
  after: UiDocument,
  label = "Replace document",
): DocumentCommand {
  return {
    id: createCommandId("document", after.id),
    label,
    apply: () => after,
    revert: () => before,
  };
}

export function findNode(node: UiNode, nodeId: string): UiNode | undefined {
  if (node.id === nodeId) return node;

  for (const child of node.children) {
    const match = findNode(child, nodeId);
    if (match) return match;
  }

  return undefined;
}

function replaceNodeLayout(
  document: UiDocument,
  nodeId: string,
  layout: Layout,
): UiDocument {
  let found = false;

  const root = updateNode(document.root, nodeId, (node) => {
    found = true;
    return { ...node, layout: cloneLayout(layout) };
  });

  if (!found) {
    throw new Error(`Cannot update layout: node ${nodeId} was not found`);
  }

  return { ...document, root };
}

function updateNode(
  node: UiNode,
  nodeId: string,
  transform: (node: UiNode) => UiNode,
): UiNode {
  if (node.id === nodeId) return transform(node);

  return {
    ...node,
    children: node.children.map((child) => updateNode(child, nodeId, transform)),
  };
}

function mergeLayout(layout: Layout, patch: LayoutPatch): Layout {
  return {
    ...layout,
    ...patch,
    sizing: patch.sizing
      ? { ...layout.sizing, ...patch.sizing }
      : { ...layout.sizing },
  };
}

function cloneLayout(layout: Layout): Layout {
  return { ...layout, sizing: { ...layout.sizing } };
}

function createCommandId(kind: string, target: string): string {
  commandSequence += 1;
  return `${kind}:${target}:${commandSequence}`;
}
