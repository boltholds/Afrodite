import {
  decodeUiDocument,
  parseUiDocument,
  serializeUiDocument,
  type SourceBinding,
  type UiDocument,
  type UiNode,
} from "@afrodite/ui-ir";

const STORAGE_KEY = "afrodite.ui-document.v1";
const TARGET_NODE_ID = "node.canvas";

export const GEFEST_SOURCE_BINDING: SourceBinding = {
  frameworkId: "react",
  adapterId: "afrodite.adapter.react",
  componentId: "gefest-cad.workspace-boundary",
  repositoryPath: "frontend/features/workspace/AfroditeBoundWorkspacePage.tsx",
  exportName: "default",
  stableMarker: "gefest.workspace",
  styleOwnership: {
    strategy: "inline",
    managedProperties: ["display", "width", "height"],
  },
};

const GEFEST_INITIAL_DOCUMENT = parseUiDocument({
  schemaVersion: 1,
  id: "document.gefest-cad",
  name: "Gefest CAD live binding",
  root: {
    id: TARGET_NODE_ID,
    kind: "element",
    element: "div",
    name: "Gefest CAD workspace",
    layout: {
      display: "block",
      direction: "column",
      gap: 0,
      padding: 0,
      sizing: { width: "fill", height: "fill" },
    },
    props: {},
    sourceBinding: GEFEST_SOURCE_BINDING,
    children: [],
  },
});

export interface ProjectSeedStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type ProjectSeedResult = "created" | "migrated" | "preserved";

export function ensureGefestProjectSeed(storage: ProjectSeedStorage): ProjectSeedResult {
  const current = storage.getItem(STORAGE_KEY);
  if (!current) {
    storage.setItem(STORAGE_KEY, serializeUiDocument(GEFEST_INITIAL_DOCUMENT));
    return "created";
  }

  const decoded = decodeUiDocument(current);
  if (!decoded.ok) return "preserved";

  const target = findNode(decoded.document.root, TARGET_NODE_ID);
  if (!target || target.sourceBinding) return "preserved";
  if (decoded.document.id !== "document.demo" && decoded.document.id !== "document.gefest-cad") {
    return "preserved";
  }

  const migrated: UiDocument = {
    ...decoded.document,
    id: "document.gefest-cad",
    name: "Gefest CAD live binding",
    root: bindTargetNode(decoded.document.root),
  };
  storage.setItem(STORAGE_KEY, serializeUiDocument(migrated));
  return "migrated";
}

function bindTargetNode(node: UiNode): UiNode {
  const children = node.children.map(bindTargetNode);
  if (node.id !== TARGET_NODE_ID) {
    return children === node.children ? node : { ...node, children };
  }

  return {
    ...node,
    name: "Gefest CAD workspace",
    sourceBinding: GEFEST_SOURCE_BINDING,
    children,
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
