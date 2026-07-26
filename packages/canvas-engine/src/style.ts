import {
  styleOwnershipSchema,
  type StyleOwnership,
  type UiDocument,
  type UiNode,
} from "@afrodite/ui-ir";
import type { DocumentCommand } from "./index.js";

let styleOwnershipCommandSequence = 0;

export function createStyleOwnershipCommand(
  document: UiDocument,
  nodeId: string,
  ownership: StyleOwnership,
  label = "Set style ownership",
): DocumentCommand {
  const node = findNodeLocal(document.root, nodeId);
  if (!node) throw new Error(`Cannot create style ownership command: node ${nodeId} was not found`);
  if (!node.sourceBinding) throw new Error(`Cannot set style ownership: node ${nodeId} has no source binding`);

  const validated = styleOwnershipSchema.parse(ownership);
  const before = node.sourceBinding.styleOwnership
    ? cloneOwnership(node.sourceBinding.styleOwnership)
    : undefined;
  const after = cloneOwnership(validated);

  return {
    id: `style-ownership:${nodeId}:${++styleOwnershipCommandSequence}`,
    label,
    apply: (current) => replaceOwnership(current, nodeId, after),
    revert: (current) => replaceOwnership(current, nodeId, before),
  };
}

export function createClearStyleOwnershipCommand(
  document: UiDocument,
  nodeId: string,
  label = "Clear style ownership",
): DocumentCommand {
  const node = findNodeLocal(document.root, nodeId);
  if (!node?.sourceBinding?.styleOwnership) {
    throw new Error(`Cannot clear style ownership: node ${nodeId} has no owned style strategy`);
  }
  const before = cloneOwnership(node.sourceBinding.styleOwnership);
  return {
    id: `style-ownership-clear:${nodeId}:${++styleOwnershipCommandSequence}`,
    label,
    apply: (current) => replaceOwnership(current, nodeId, undefined),
    revert: (current) => replaceOwnership(current, nodeId, before),
  };
}

function replaceOwnership(
  document: UiDocument,
  nodeId: string,
  ownership: StyleOwnership | undefined,
): UiDocument {
  let found = false;
  const root = updateNode(document.root, nodeId, (node) => {
    found = true;
    if (!node.sourceBinding) {
      throw new Error(`Cannot update style ownership: node ${nodeId} has no source binding`);
    }
    const sourceBinding = ownership
      ? { ...node.sourceBinding, styleOwnership: cloneOwnership(ownership) }
      : stripOwnership(node.sourceBinding);
    return { ...node, sourceBinding };
  });
  if (!found) throw new Error(`Cannot update style ownership: node ${nodeId} was not found`);
  return { ...document, root };
}

function stripOwnership(binding: NonNullable<UiNode["sourceBinding"]>) {
  const { styleOwnership: _styleOwnership, ...rest } = binding;
  return rest;
}

function cloneOwnership(ownership: StyleOwnership): StyleOwnership {
  return JSON.parse(JSON.stringify(ownership)) as StyleOwnership;
}

function findNodeLocal(node: UiNode, nodeId: string): UiNode | undefined {
  if (node.id === nodeId) return node;
  for (const child of node.children) {
    const match = findNodeLocal(child, nodeId);
    if (match) return match;
  }
  return undefined;
}

function updateNode(
  node: UiNode,
  nodeId: string,
  transform: (node: UiNode) => UiNode,
): UiNode {
  if (node.id === nodeId) return transform(node);
  return { ...node, children: node.children.map((child) => updateNode(child, nodeId, transform)) };
}
