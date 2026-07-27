import { afterEach, describe, expect, it } from "vitest";
import { parseUiDocument } from "@afrodite/ui-ir";
import {
  createLiveProjectSession,
  sessionDocument,
} from "../src/index";
import {
  executeLiveProjectDocumentReplacement,
  LiveProjectDocumentExecutionError,
} from "../src/execution";

const before = parseUiDocument({
  schemaVersion: 1,
  id: "document.execution",
  name: "Before",
  root: {
    id: "node.root",
    kind: "element",
    element: "main",
    name: "Root",
    layout: {
      display: "flex",
      direction: "column",
      sizing: { width: "fill", height: "fill" },
    },
    props: {},
    children: [],
  },
});

const after = parseUiDocument({
  ...before,
  name: "After",
  root: {
    ...before.root,
    layout: { ...before.root.layout, display: "grid" },
  },
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("reviewed live document execution", () => {
  it("creates a reversible replace command in the active browser session", async () => {
    (globalThis as { window?: unknown }).window = {};
    const session = createLiveProjectSession(before);
    sessionDocument(session);

    const receipt = await executeLiveProjectDocumentReplacement({
      document: after,
      label: "Execute reviewed request",
      expectedRevision: 0,
    });

    expect(receipt.revision).toBe(1);
    expect(receipt.document.name).toBe("After");
    expect(receipt.commandId).toMatch(/^command:/);
  });

  it("rejects a preparation for an older live revision", async () => {
    (globalThis as { window?: unknown }).window = {};
    const session = createLiveProjectSession(before);
    sessionDocument(session);

    await expect(executeLiveProjectDocumentReplacement({
      document: after,
      label: "Stale request",
      expectedRevision: 7,
    })).rejects.toBeInstanceOf(LiveProjectDocumentExecutionError);
  });
});
