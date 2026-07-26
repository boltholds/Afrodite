import { describe, expect, it } from "vitest";
import { createLayoutCommand } from "@afrodite/canvas-engine";
import { parseUiDocument } from "@afrodite/ui-ir";
import {
  cachePatchPlan,
  cacheSourceSnapshot,
  createLiveProjectSession,
  executeLiveCommand,
  getPendingLayoutOperation,
  markNodeSynchronized,
  redoLiveCommand,
  selectLiveNode,
  setLiveWorkspace,
  undoLiveCommand,
} from "../src/index";

const document = parseUiDocument({
  schemaVersion: 1,
  id: "document.session",
  name: "Session test",
  root: {
    id: "node.root",
    kind: "element",
    element: "main",
    name: "Root",
    layout: {
      display: "flex",
      direction: "column",
      gap: 8,
      padding: 8,
      sizing: { width: "fill", height: "fill" },
    },
    props: {},
    children: [
      {
        id: "node.card",
        kind: "component",
        component: "Card",
        name: "Card",
        layout: {
          display: "block",
          direction: "column",
          gap: 0,
          padding: 8,
          sizing: { width: "hug", height: "hug" },
        },
        props: {},
        sourceBinding: {
          frameworkId: "react",
          adapterId: "afrodite.adapter.react",
          repositoryPath: "src/Card.tsx",
          exportName: "Card",
          stableMarker: "card.primary",
        },
        children: [],
      },
    ],
  },
});

function cardLayout(session = createLiveProjectSession(document, "node.card")) {
  const card = session.history.present.root.children[0];
  if (!card) throw new Error("Card fixture is missing");
  return card.layout;
}

describe("live project session", () => {
  it("keeps command history and selection while switching workspaces", () => {
    const initial = createLiveProjectSession(document, "node.card");
    const before = cardLayout(initial);
    const command = createLayoutCommand(initial.history.present, "node.card", { gap: 24 });
    const executed = executeLiveCommand(initial, command, {
      now: "2026-07-27T00:00:00.000Z",
      layout: {
        nodeId: "node.card",
        before,
        after: { ...before, gap: 24, sizing: { ...before.sizing } },
        binding: document.root.children[0]?.sourceBinding,
      },
    });
    const sourceSync = setLiveWorkspace(executed, "source-sync");
    const canvas = setLiveWorkspace(sourceSync, "canvas");

    expect(canvas.selectedNodeId).toBe("node.card");
    expect(canvas.history.past).toHaveLength(1);
    expect(canvas.history.present.root.children[0]?.layout.gap).toBe(24);
    expect(canvas.layoutTransitions).toHaveLength(1);
  });

  it("aggregates exact before and after layouts across visual edits", () => {
    const initial = createLiveProjectSession(document, "node.card");
    const firstBefore = cardLayout(initial);
    const firstAfter = { ...firstBefore, gap: 16, sizing: { ...firstBefore.sizing } };
    const firstCommand = createLayoutCommand(initial.history.present, "node.card", { gap: 16 });
    const first = executeLiveCommand(initial, firstCommand, {
      now: "2026-07-27T00:00:01.000Z",
      layout: { nodeId: "node.card", before: firstBefore, after: firstAfter },
    });

    const secondBefore = cardLayout(first);
    const secondAfter = { ...secondBefore, padding: 20, sizing: { ...secondBefore.sizing } };
    const secondCommand = createLayoutCommand(first.history.present, "node.card", { padding: 20 });
    const second = executeLiveCommand(first, secondCommand, {
      now: "2026-07-27T00:00:02.000Z",
      layout: { nodeId: "node.card", before: secondBefore, after: secondAfter },
    });

    const pending = getPendingLayoutOperation(second, "node.card");
    expect(pending?.before).toEqual(firstBefore);
    expect(pending?.after).toEqual(secondAfter);
    expect(pending?.transitionIds).toHaveLength(2);
  });

  it("records undo and redo as exact layout transitions", () => {
    const initial = createLiveProjectSession(document, "node.card");
    const before = cardLayout(initial);
    const after = { ...before, gap: 32, sizing: { ...before.sizing } };
    const command = createLayoutCommand(initial.history.present, "node.card", { gap: 32 });
    const executed = executeLiveCommand(initial, command, {
      layout: { nodeId: "node.card", before, after },
    });
    const undone = undoLiveCommand(executed, "2026-07-27T00:00:03.000Z");
    const redone = redoLiveCommand(undone, "2026-07-27T00:00:04.000Z");

    expect(undone.layoutTransitions.at(-1)).toMatchObject({
      phase: "undo",
      before: after,
      after: before,
    });
    expect(redone.layoutTransitions.at(-1)).toMatchObject({
      phase: "redo",
      before,
      after,
    });
  });

  it("invalidates a stored plan when a refreshed source version is stale", () => {
    const initial = selectLiveNode(createLiveProjectSession(document), "node.card");
    const withSource = cacheSourceSnapshot(initial, "node.card", {
      repositoryPath: "src/Card.tsx",
      content: "before",
      version: "v1",
    });
    const withPlan = cachePatchPlan(withSource, "node.card", {
      planId: "plan.1",
      repositoryPath: "src/Card.tsx",
      sourceVersion: "v1",
      changed: true,
      diff: "diff",
      diagnostics: [],
      verification: [],
    });
    const refreshed = cacheSourceSnapshot(withPlan, "node.card", {
      repositoryPath: "src/Card.tsx",
      content: "external change",
      version: "v2",
    });

    expect(refreshed.patchPlans["node.card"]).toBeUndefined();
    expect(refreshed.sourceSnapshots["node.card"]?.version).toBe("v2");
  });

  it("marks accumulated transitions as synchronized after a verified write", () => {
    const initial = createLiveProjectSession(document, "node.card");
    const before = cardLayout(initial);
    const after = { ...before, gap: 12, sizing: { ...before.sizing } };
    const command = createLayoutCommand(initial.history.present, "node.card", { gap: 12 });
    const changed = executeLiveCommand(initial, command, {
      layout: { nodeId: "node.card", before, after },
    });
    const synchronized = markNodeSynchronized(changed, "node.card");

    expect(getPendingLayoutOperation(synchronized, "node.card")).toBeUndefined();
    expect(synchronized.syncCursorByNode["node.card"]).toBe(changed.layoutTransitions.length);
  });
});
