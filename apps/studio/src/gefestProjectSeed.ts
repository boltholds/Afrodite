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

export const GEFEST_DOCUMENT_ID = "document.gefest-cad";
export const GEFEST_PREVIEW_STORAGE_KEY = "afrodite.gefest-preview-url";
export const GEFEST_IMPORT_ENTRY = {
  adapterId: "afrodite.adapter.react",
  repositoryPath: "frontend/features/workspace/AfroditeBoundWorkspacePage.tsx",
  exportName: "default",
} as const;

export const GEFEST_SOURCE_BINDING: SourceBinding = {
  frameworkId: "react",
  adapterId: GEFEST_IMPORT_ENTRY.adapterId,
  componentId: "gefest-cad.workspace-boundary",
  repositoryPath: GEFEST_IMPORT_ENTRY.repositoryPath,
  exportName: GEFEST_IMPORT_ENTRY.exportName,
  stableMarker: "gefest.workspace",
  styleOwnership: {
    strategy: "inline",
    managedProperties: ["display", "width", "height"],
  },
};

const GEFEST_INITIAL_DOCUMENT = parseUiDocument({
  schemaVersion: 1,
  id: GEFEST_DOCUMENT_ID,
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
  if (decoded.document.id !== "document.demo" && decoded.document.id !== GEFEST_DOCUMENT_ID) {
    return "preserved";
  }

  const migrated: UiDocument = {
    ...decoded.document,
    id: GEFEST_DOCUMENT_ID,
    name: "Gefest CAD live binding",
    root: bindTargetNode(decoded.document.root),
  };
  storage.setItem(STORAGE_KEY, serializeUiDocument(migrated));
  return "migrated";
}

export function shouldImportGefestTree(document: UiDocument): boolean {
  if (document.id !== GEFEST_DOCUMENT_ID) return false;
  const target = findNode(document.root, TARGET_NODE_ID);
  return target?.children.length === 0;
}

export function prepareImportedGefestDocument(imported: UiDocument): UiDocument {
  const root: UiNode = {
    ...imported.root,
    id: TARGET_NODE_ID,
    name: "Gefest CAD workspace",
    sourceBinding: GEFEST_SOURCE_BINDING,
    children: imported.root.children.map(cloneNode),
  };
  return parseUiDocument({
    ...imported,
    id: GEFEST_DOCUMENT_ID,
    name: "Gefest CAD live binding",
    root,
  });
}

function bindTargetNode(node: UiNode): UiNode {
  const children = node.children.map(bindTargetNode);
  if (node.id !== TARGET_NODE_ID) {
    return { ...node, children };
  }

  return {
    ...node,
    name: "Gefest CAD workspace",
    sourceBinding: GEFEST_SOURCE_BINDING,
    children,
  };
}

function cloneNode(node: UiNode): UiNode {
  return { ...node, children: node.children.map(cloneNode) };
}

function findNode(node: UiNode, nodeId: string): UiNode | undefined {
  if (node.id === nodeId) return node;
  for (const child of node.children) {
    const match = findNode(child, nodeId);
    if (match) return match;
  }
  return undefined;
}
