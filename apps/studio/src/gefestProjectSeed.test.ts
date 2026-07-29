import { describe, expect, it } from "vitest";
import { decodeUiDocument, parseUiDocument, serializeUiDocument, type UiNode } from "@afrodite/ui-ir";
import {
  ensureGefestProjectSeed,
  GEFEST_SOURCE_BINDING,
  type ProjectSeedStorage,
} from "./gefestProjectSeed";

const STORAGE_KEY = "afrodite.ui-document.v1";

class MemoryStorage implements ProjectSeedStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("ensureGefestProjectSeed", () => {
  it("creates a source-bound Gefest document for a fresh Studio", () => {
    const storage = new MemoryStorage();

    expect(ensureGefestProjectSeed(storage)).toBe("created");

    const document = readStoredDocument(storage);
    expect(document.id).toBe("document.gefest-cad");
    expect(document.root.id).toBe("node.canvas");
    expect(document.root.sourceBinding).toEqual(GEFEST_SOURCE_BINDING);
  });

  it("migrates the legacy demo without discarding its node tree", () => {
    const storage = new MemoryStorage();
    const legacy = parseUiDocument({
      schemaVersion: 1,
      id: "document.demo",
      name: "Afrodite manual interaction session",
      root: {
        id: "node.workspace",
        kind: "element",
        element: "main",
        name: "Workspace",
        layout: {
          display: "flex",
          direction: "row",
          gap: 16,
          padding: 16,
          sizing: { width: "fill", height: "fill" },
        },
        props: {},
        children: [
          {
            id: "node.canvas",
            kind: "element",
            element: "section",
            name: "Content",
            layout: {
              display: "flex",
              direction: "column",
              gap: 16,
              padding: 24,
              sizing: { width: "fill", height: "fill" },
            },
            props: { label: "Preserved content" },
            children: [],
          },
        ],
      },
    });
    storage.setItem(STORAGE_KEY, serializeUiDocument(legacy));

    expect(ensureGefestProjectSeed(storage)).toBe("migrated");

    const document = readStoredDocument(storage);
    const canvas = findNode(document.root, "node.canvas");
    expect(document.id).toBe("document.gefest-cad");
    expect(document.root.id).toBe("node.workspace");
    expect(canvas?.props.label).toBe("Preserved content");
    expect(canvas?.sourceBinding).toEqual(GEFEST_SOURCE_BINDING);
  });

  it("preserves unrelated project documents", () => {
    const storage = new MemoryStorage();
    const custom = parseUiDocument({
      schemaVersion: 1,
      id: "document.customer-project",
      name: "Customer project",
      root: {
        id: "node.canvas",
        kind: "element",
        element: "main",
        name: "Customer canvas",
        layout: {
          display: "block",
          direction: "column",
          sizing: { width: "fill", height: "fill" },
        },
        props: {},
        children: [],
      },
    });
    const serialized = serializeUiDocument(custom);
    storage.setItem(STORAGE_KEY, serialized);

    expect(ensureGefestProjectSeed(storage)).toBe("preserved");
    expect(storage.getItem(STORAGE_KEY)).toBe(serialized);
  });
});

function readStoredDocument(storage: MemoryStorage) {
  const source = storage.getItem(STORAGE_KEY);
  expect(source).not.toBeNull();
  const decoded = decodeUiDocument(source!);
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error("Stored document failed validation");
  return decoded.document;
}

function findNode(node: UiNode, nodeId: string): UiNode | undefined {
  if (node.id === nodeId) return node;
  for (const child of node.children) {
    const match = findNode(child, nodeId);
    if (match) return match;
  }
  return undefined;
}
