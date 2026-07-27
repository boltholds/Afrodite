import type { Layout, SourceBinding, UiDocument, UiNode } from "@afrodite/ui-ir";

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
  if (node.kind === "source-region" || node.sourceRegion?.mode === "read-only") {
    throw new Error(`Cannot create layout command: node ${nodeId} is a source-backed read-only region`);
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

export function createInsertNodeCommand(
  document: UiDocument,
  parentId: string,
  node: UiNode,
  index?: number,
  label = `Insert ${node.name}`,
): DocumentCommand {
  const parent = findNode(document.root, parentId);
  if (!parent) {
    throw new Error(`Cannot create insert command: parent ${parentId} was not found`);
  }
  if (findNode(document.root, node.id)) {
    throw new Error(`Cannot create insert command: node ${node.id} already exists`);
  }

  const snapshot = normalizeNodeBinding(cloneNode(node));
  const insertionIndex = Math.min(
    Math.max(index ?? parent.children.length, 0),
    parent.children.length,
  );

  return {
    id: createCommandId("insert", node.id),
    label,
    apply: (current) => insertNode(current, parentId, snapshot, insertionIndex),
    revert: (current) => removeNode(current, node.id),
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

function insertNode(
  document: UiDocument,
  parentId: string,
  child: UiNode,
  index: number,
): UiDocument {
  if (findNode(document.root, child.id)) {
    throw new Error(`Cannot insert node: node ${child.id} already exists`);
  }

  let found = false;
  const root = updateNode(document.root, parentId, (parent) => {
    found = true;
    const children = [...parent.children];
    children.splice(Math.min(index, children.length), 0, cloneNode(child));
    return { ...parent, children };
  });

  if (!found) {
    throw new Error(`Cannot insert node: parent ${parentId} was not found`);
  }

  return { ...document, root };
}

function removeNode(document: UiDocument, nodeId: string): UiDocument {
  if (document.root.id === nodeId) {
    throw new Error("Cannot remove the document root node");
  }

  const result = removeNodeFromTree(document.root, nodeId);
  if (!result.removed) {
    throw new Error(`Cannot remove node: node ${nodeId} was not found`);
  }

  return { ...document, root: result.node };
}

function removeNodeFromTree(node: UiNode, nodeId: string): { node: UiNode; removed: boolean } {
  let removed = false;
  const children: UiNode[] = [];

  for (const child of node.children) {
    if (child.id === nodeId) {
      removed = true;
      continue;
    }

    const result = removeNodeFromTree(child, nodeId);
    removed = removed || result.removed;
    children.push(result.node);
  }

  return {
    node: removed ? { ...node, children } : node,
    removed,
  };
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

function cloneNode(node: UiNode): UiNode {
  return {
    ...node,
    layout: cloneLayout(node.layout),
    props: { ...node.props },
    children: node.children.map(cloneNode),
    ...(node.sourceBinding ? { sourceBinding: { ...node.sourceBinding } } : {}),
    ...(node.sourceRegion ? { sourceRegion: { ...node.sourceRegion } } : {}),
  };
}

function normalizeNodeBinding(node: UiNode): UiNode {
  const children = node.children.map(normalizeNodeBinding);
  if (!node.sourceBinding) return { ...node, children };

  return {
    ...node,
    children,
    sourceBinding: normalizeSourceBinding(node.sourceBinding),
  };
}

function normalizeSourceBinding(binding: SourceBinding): SourceBinding {
  if (binding.frameworkId) return { ...binding };

  const marker = binding.componentId ?? binding.stableMarker;
  const match = marker?.match(/^([a-z][a-z0-9.-]*):(.+)$/);
  if (!match) return { ...binding };

  return {
    ...binding,
    frameworkId: match[1],
    componentId: binding.componentId ?? marker,
  };
}

function createCommandId(kind: string, target: string): string {
  commandSequence += 1;
  return `${kind}:${target}:${commandSequence}`;
}
