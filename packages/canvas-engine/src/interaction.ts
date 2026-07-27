import type {
  Appearance,
  Position,
  UiDocument,
  UiNode,
} from "@afrodite/ui-ir";
import type { DocumentCommand } from "./index";

export const EDITABLE_TEXT_PROP_KEYS = [
  "children",
  "label",
  "text",
  "title",
  "caption",
  "placeholder",
  "aria-label",
] as const;

export type EditableTextSlot =
  | { readonly kind: "name"; readonly value: string }
  | { readonly kind: "prop"; readonly key: string; readonly value: string };

let interactionCommandSequence = 0;

export function isNodeReadOnly(node: UiNode): boolean {
  return node.kind === "source-region" || node.sourceRegion?.mode === "read-only";
}

export function findParentNode(
  root: UiNode,
  nodeId: string,
): { readonly parent: UiNode; readonly index: number } | undefined {
  const index = root.children.findIndex((child) => child.id === nodeId);
  if (index >= 0) return { parent: root, index };
  for (const child of root.children) {
    const match = findParentNode(child, nodeId);
    if (match) return match;
  }
  return undefined;
}

export function flattenNodeIds(root: UiNode): readonly string[] {
  return [root.id, ...root.children.flatMap(flattenNodeIds)];
}

export function resolveEditableTextSlot(node: UiNode): EditableTextSlot | undefined {
  if (isNodeReadOnly(node)) return undefined;
  for (const key of EDITABLE_TEXT_PROP_KEYS) {
    const value = node.props[key];
    if (typeof value === "string") return { kind: "prop", key, value };
  }
  return { kind: "name", value: node.name };
}

export function createDeleteNodeCommand(
  document: UiDocument,
  nodeId: string,
  label = "Delete object",
): DocumentCommand {
  if (document.root.id === nodeId) throw new Error("Cannot delete the document root node");
  const target = findNodeInTree(document.root, nodeId);
  if (!target) throw new Error(`Cannot delete node ${nodeId}: it was not found`);
  if (isNodeReadOnly(target)) throw new Error(`Cannot delete node ${nodeId}: it is read-only`);
  const location = findParentNode(document.root, nodeId);
  if (!location) throw new Error(`Cannot delete node ${nodeId}: parent was not found`);
  const snapshot = cloneNode(target);

  return {
    id: createInteractionCommandId("delete", nodeId),
    label,
    apply: (current) => removeNode(current, nodeId),
    revert: (current) => insertNode(current, location.parent.id, snapshot, location.index),
  };
}

export function createMoveNodeCommand(
  document: UiDocument,
  nodeId: string,
  position: Position,
  label = "Move object",
): DocumentCommand {
  const node = requireEditableNode(document, nodeId, "move");
  const before: Position = { x: node.position?.x ?? 0, y: node.position?.y ?? 0 };
  const after: Position = { x: finite(position.x), y: finite(position.y) };

  return {
    id: createInteractionCommandId("move", nodeId),
    label,
    apply: (current) => updateDocumentNode(current, nodeId, (target) => ({ ...target, position: { ...after } })),
    revert: (current) => updateDocumentNode(current, nodeId, (target) => ({ ...target, position: { ...before } })),
  };
}

export function createBorderRadiusCommand(
  document: UiDocument,
  nodeId: string,
  borderRadius: number,
  label = "Update corner radius",
): DocumentCommand {
  const node = requireEditableNode(document, nodeId, "update corner radius");
  const before: Appearance = { borderRadius: node.appearance?.borderRadius ?? 0 };
  const after: Appearance = { borderRadius: Math.max(0, finite(borderRadius)) };

  return {
    id: createInteractionCommandId("radius", nodeId),
    label,
    apply: (current) => updateDocumentNode(current, nodeId, (target) => ({ ...target, appearance: { ...after } })),
    revert: (current) => updateDocumentNode(current, nodeId, (target) => ({ ...target, appearance: { ...before } })),
  };
}

export function createTextCommand(
  document: UiDocument,
  nodeId: string,
  slot: EditableTextSlot,
  value: string,
  label = "Edit text",
): DocumentCommand {
  requireEditableNode(document, nodeId, "edit text");
  if (slot.kind === "name" && value.trim().length === 0) {
    throw new Error("Node name cannot be empty");
  }

  return {
    id: createInteractionCommandId("text", nodeId),
    label,
    apply: (current) => updateDocumentNode(current, nodeId, (target) => slot.kind === "name"
      ? { ...target, name: value.trim() }
      : { ...target, props: { ...target.props, [slot.key]: value } }),
    revert: (current) => updateDocumentNode(current, nodeId, (target) => slot.kind === "name"
      ? { ...target, name: slot.value }
      : { ...target, props: { ...target.props, [slot.key]: slot.value } }),
  };
}

export function createCompositeCommand(
  commands: readonly DocumentCommand[],
  label: string,
): DocumentCommand {
  if (commands.length === 0) throw new Error("A composite command requires at least one command");
  return {
    id: createInteractionCommandId("gesture", commands.map((command) => command.id).join("+")),
    label,
    apply: (document) => commands.reduce((current, command) => command.apply(current), document),
    revert: (document) => [...commands].reverse().reduce((current, command) => command.revert(current), document),
  };
}

export function cloneNodeForPaste(
  node: UiNode,
  createId: (sourceId: string) => string,
): UiNode {
  if (node.kind === "source-region" || node.children.some(containsSourceRegion)) {
    throw new Error("Source-region subtrees cannot be duplicated without a new import or binding review");
  }

  const children = node.children.map((child) => cloneNodeForPaste(child, createId));
  const common = {
    ...node,
    id: createId(node.id),
    name: `${node.name} copy`,
    layout: cloneLayout(node.layout),
    ...(node.position ? { position: { ...node.position, x: node.position.x + 16, y: node.position.y + 16 } } : { position: { x: 16, y: 16 } }),
    ...(node.appearance ? { appearance: { ...node.appearance } } : {}),
    props: cloneJson(node.props),
    children,
    sourceBinding: undefined,
    sourceRegion: undefined,
  };

  if (node.kind === "element") return { ...common, kind: "element", element: node.element };
  return { ...common, kind: "component", component: node.component };
}

function containsSourceRegion(node: UiNode): boolean {
  return node.kind === "source-region" || node.children.some(containsSourceRegion);
}

function requireEditableNode(document: UiDocument, nodeId: string, operation: string): UiNode {
  const node = findNodeInTree(document.root, nodeId);
  if (!node) throw new Error(`Cannot ${operation} node ${nodeId}: it was not found`);
  if (isNodeReadOnly(node)) throw new Error(`Cannot ${operation} node ${nodeId}: it is read-only`);
  return node;
}

function findNodeInTree(node: UiNode, nodeId: string): UiNode | undefined {
  if (node.id === nodeId) return node;
  for (const child of node.children) {
    const match = findNodeInTree(child, nodeId);
    if (match) return match;
  }
  return undefined;
}

function updateDocumentNode(
  document: UiDocument,
  nodeId: string,
  transform: (node: UiNode) => UiNode,
): UiDocument {
  let found = false;
  const root = updateNode(document.root, nodeId, (node) => {
    found = true;
    return transform(node);
  });
  if (!found) throw new Error(`Cannot update node ${nodeId}: it was not found`);
  return { ...document, root };
}

function updateNode(node: UiNode, nodeId: string, transform: (node: UiNode) => UiNode): UiNode {
  if (node.id === nodeId) return transform(node);
  return { ...node, children: node.children.map((child) => updateNode(child, nodeId, transform)) };
}

function removeNode(document: UiDocument, nodeId: string): UiDocument {
  const root = removeFromTree(document.root, nodeId);
  if (!root.removed) throw new Error(`Cannot remove node ${nodeId}: it was not found`);
  return { ...document, root: root.node };
}

function removeFromTree(node: UiNode, nodeId: string): { readonly node: UiNode; readonly removed: boolean } {
  let removed = false;
  const children: UiNode[] = [];
  for (const child of node.children) {
    if (child.id === nodeId) {
      removed = true;
      continue;
    }
    const result = removeFromTree(child, nodeId);
    removed ||= result.removed;
    children.push(result.node);
  }
  return { node: removed ? { ...node, children } : node, removed };
}

function insertNode(document: UiDocument, parentId: string, child: UiNode, index: number): UiDocument {
  if (findNodeInTree(document.root, child.id)) throw new Error(`Cannot restore node ${child.id}: ID already exists`);
  return updateDocumentNode(document, parentId, (parent) => {
    const children = [...parent.children];
    children.splice(Math.max(0, Math.min(index, children.length)), 0, cloneNode(child));
    return { ...parent, children };
  });
}

function cloneNode(node: UiNode): UiNode {
  return {
    ...node,
    layout: cloneLayout(node.layout),
    ...(node.position ? { position: { ...node.position } } : {}),
    ...(node.appearance ? { appearance: { ...node.appearance } } : {}),
    props: cloneJson(node.props),
    children: node.children.map(cloneNode),
    ...(node.sourceBinding ? { sourceBinding: cloneJson(node.sourceBinding) } : {}),
    ...(node.sourceRegion ? { sourceRegion: { ...node.sourceRegion } } : {}),
  };
}

function cloneLayout<T extends UiNode["layout"]>(layout: T): T {
  return { ...layout, sizing: { ...layout.sizing } };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function finite(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Manual interaction values must be finite numbers");
  return value;
}

function createInteractionCommandId(kind: string, target: string): string {
  interactionCommandSequence += 1;
  return `${kind}:${target}:${interactionCommandSequence}`;
}
