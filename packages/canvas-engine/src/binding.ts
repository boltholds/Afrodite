import {
  sourceBindingSchema,
  type SourceBinding,
  type UiDocument,
  type UiNode,
} from "@afrodite/ui-ir";
import type { DocumentCommand } from "./index.js";

let bindingCommandSequence = 0;

export function createSourceBindingCommand(
  document: UiDocument,
  nodeId: string,
  binding: SourceBinding,
  label = "Bind source element",
): DocumentCommand {
  const node = findNodeLocal(document.root, nodeId);
  if (!node) {
    throw new Error(`Cannot create source binding command: node ${nodeId} was not found`);
  }

  const validated = sourceBindingSchema.parse(binding);
  const before = node.sourceBinding ? { ...node.sourceBinding } : undefined;
  const after = { ...validated };

  return {
    id: `binding:${nodeId}:${++bindingCommandSequence}`,
    label,
    apply: (current) => replaceSourceBinding(current, nodeId, after),
    revert: (current) => replaceSourceBinding(current, nodeId, before),
  };
}

export function createClearSourceBindingCommand(
  document: UiDocument,
  nodeId: string,
  label = "Clear source binding",
): DocumentCommand {
  const node = findNodeLocal(document.root, nodeId);
  if (!node) {
    throw new Error(`Cannot create clear binding command: node ${nodeId} was not found`);
  }
  if (!node.sourceBinding) {
    throw new Error(`Cannot clear source binding: node ${nodeId} is not bound`);
  }

  const before = { ...node.sourceBinding };
  return {
    id: `binding-clear:${nodeId}:${++bindingCommandSequence}`,
    label,
    apply: (current) => replaceSourceBinding(current, nodeId, undefined),
    revert: (current) => replaceSourceBinding(current, nodeId, before),
  };
}

function replaceSourceBinding(
  document: UiDocument,
  nodeId: string,
  binding: SourceBinding | undefined,
): UiDocument {
  let found = false;
  const root = updateNode(document.root, nodeId, (node) => {
    found = true;
    if (!binding) {
      const { sourceBinding: _sourceBinding, ...rest } = node;
      return rest as UiNode;
    }
    return { ...node, sourceBinding: { ...binding } };
  });

  if (!found) {
    throw new Error(`Cannot update source binding: node ${nodeId} was not found`);
  }
  return { ...document, root };
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
  return {
    ...node,
    children: node.children.map((child) => updateNode(child, nodeId, transform)),
  };
}
