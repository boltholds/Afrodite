import { describe, expect, it } from "vitest";
import { parseUiDocument } from "@afrodite/ui-ir";
import {
  canRedo,
  canUndo,
  createCommandHistory,
  createLayoutCommand,
  executeCommand,
  findNode,
  redoCommand,
  undoCommand,
} from "./index";

const document = parseUiDocument({
  schemaVersion: 1,
  id: "document.test",
  name: "History test",
  root: {
    id: "node.root",
    kind: "element",
    element: "main",
    name: "Root",
    layout: {
      display: "flex",
      direction: "column",
      gap: 8,
      sizing: { width: "fill", height: "fill" },
    },
    children: [],
  },
});

describe("command history", () => {
  it("executes, undoes, and redoes a layout command", () => {
    const initial = createCommandHistory(document);
    const command = createLayoutCommand(document, "node.root", { direction: "row", gap: 24 });
    const executed = executeCommand(initial, command);

    expect(findNode(executed.present.root, "node.root")?.layout).toMatchObject({
      direction: "row",
      gap: 24,
    });
    expect(canUndo(executed)).toBe(true);

    const undone = undoCommand(executed);
    expect(findNode(undone.present.root, "node.root")?.layout).toMatchObject({
      direction: "column",
      gap: 8,
    });
    expect(canRedo(undone)).toBe(true);

    const redone = redoCommand(undone);
    expect(findNode(redone.present.root, "node.root")?.layout.direction).toBe("row");
  });

  it("clears the redo branch when a new command is executed", () => {
    const first = executeCommand(
      createCommandHistory(document),
      createLayoutCommand(document, "node.root", { gap: 16 }),
    );
    const undone = undoCommand(first);
    const second = executeCommand(
      undone,
      createLayoutCommand(undone.present, "node.root", { padding: 12 }),
    );

    expect(canRedo(second)).toBe(false);
    expect(second.past).toHaveLength(1);
  });
});
