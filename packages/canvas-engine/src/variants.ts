import type {
  LayoutOverride,
  UiDocument,
  UiNode,
  UiVariants,
} from "@afrodite/ui-ir";
import type { DocumentCommand } from "./index.js";

let variantCommandSequence = 0;

export function createVariantsCommand(
  document: UiDocument,
  nodeId: string,
  variants: UiVariants | undefined,
  label = "Update responsive and state variants",
): DocumentCommand {
  const node = findNode(document.root, nodeId);
  if (!node) {
    throw new Error(`Cannot create variants command: node ${nodeId} was not found`);
  }
  if (node.kind === "source-region" || node.sourceRegion?.mode === "read-only") {
    throw new Error(`Cannot create variants command: node ${nodeId} is a source-backed read-only region`);
  }

  const before = cloneVariants(node.variants);
  const after = cloneVariants(variants);
  variantCommandSequence += 1;

  return {
    id: `variants:${nodeId}:${variantCommandSequence}`,
    label,
    apply: (current) => replaceNodeVariants(current, nodeId, after),
    revert: (current) => replaceNodeVariants(current, nodeId, before),
  };
}

function replaceNodeVariants(
  document: UiDocument,
  nodeId: string,
  variants: UiVariants | undefined,
): UiDocument {
  let found = false;
  const root = updateNode(document.root, nodeId, (node) => {
    found = true;
    const next = { ...node };
    if (variants) {
      next.variants = cloneVariants(variants);
    } else {
      delete next.variants;
    }
    return next;
  });

  if (!found) throw new Error(`Cannot update variants: node ${nodeId} was not found`);
  return { ...document, root };
}

function updateNode(node: UiNode, nodeId: string, transform: (node: UiNode) => UiNode): UiNode {
  if (node.id === nodeId) return transform(node);
  return {
    ...node,
    children: node.children.map((child) => updateNode(child, nodeId, transform)),
  };
}

function findNode(node: UiNode, nodeId: string): UiNode | undefined {
  if (node.id === nodeId) return node;
  for (const child of node.children) {
    const match = findNode(child, nodeId);
    if (match) return match;
  }
  return undefined;
}

function cloneVariants(variants: UiVariants | undefined): UiVariants | undefined {
  if (!variants) return undefined;
  return {
    responsive: variants.responsive.map((variant) => ({
      ...variant,
      layout: cloneLayoutOverride(variant.layout),
    })),
    states: variants.states.map((variant) => ({
      ...variant,
      layout: cloneLayoutOverride(variant.layout),
    })),
  };
}

function cloneLayoutOverride(override: LayoutOverride): LayoutOverride {
  return {
    ...override,
    ...(override.sizing ? { sizing: { ...override.sizing } } : {}),
  };
}
