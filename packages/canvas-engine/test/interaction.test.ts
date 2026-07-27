import { describe, expect, it } from "vitest";
import { executeCommand, redoCommand, undoCommand, createCommandHistory } from "../src/index";
import {
  cloneNodeForPaste,
  createBorderRadiusCommand,
  createCompositeCommand,
  createDeleteNodeCommand,
  createMoveNodeCommand,
  createTextCommand,
  flattenNodeIds,
  resolveEditableTextSlot,
} from "../src/interaction";
import { parseUiDocument } from "@afrodite/ui-ir";

const document = parseUiDocument({
  schemaVersion: 1,
  id: "document.manual",
  name: "Manual interaction",
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
    children: [
      {
        id: "node.button",
        kind: "element",
        element: "button",
        name: "Button",
        layout: {
          display: "block",
          direction: "column",
          sizing: { width: 120, height: 40 },
        },
        props: { label: "Save" },
        sourceBinding: {
          frameworkId: "react",
          repositoryPath: "src/Button.tsx",
          stableMarker: "button.save",
        },
        children: [],
      },
    ],
  },
});

describe("manual interaction commands", () => {
  it("deletes and restores the exact subtree through history", () => {
    let state = createCommandHistory(document);
    state = executeCommand(state, createDeleteNodeCommand(state.present, "node.button"));
    expect(flattenNodeIds(state.present.root)).toEqual(["node.root"]);

    state = undoCommand(state);
    expect(flattenNodeIds(state.present.root)).toEqual(["node.root", "node.button"]);

    state = redoCommand(state);
    expect(flattenNodeIds(state.present.root)).toEqual(["node.root"]);
  });

  it("commits move and radius as one reversible gesture", () => {
    const move = createMoveNodeCommand(document, "node.button", { x: 24, y: -8 });
    const radius = createBorderRadiusCommand(document, "node.button", 18);
    let state = executeCommand(
      createCommandHistory(document),
      createCompositeCommand([move, radius], "Drag and round Button"),
    );

    const changed = state.present.root.children[0]!;
    expect(changed.position).toEqual({ x: 24, y: -8 });
    expect(changed.appearance?.borderRadius).toBe(18);

    state = undoCommand(state);
    expect(state.present.root.children[0]?.position).toEqual({ x: 0, y: 0 });
    expect(state.present.root.children[0]?.appearance?.borderRadius).toBe(0);
  });

  it("edits a static label without changing the node identity", () => {
    const node = document.root.children[0]!;
    const slot = resolveEditableTextSlot(node);
    expect(slot).toEqual({ kind: "prop", key: "label", value: "Save" });
    const changed = createTextCommand(document, node.id, slot!, "Publish").apply(document);
    expect(changed.root.children[0]?.props.label).toBe("Publish");
    expect(changed.root.children[0]?.id).toBe("node.button");
  });

  it("creates fresh IDs and removes source authority when duplicating", () => {
    let sequence = 0;
    const duplicate = cloneNodeForPaste(document.root.children[0]!, () => `node.copy.${++sequence}`);
    expect(duplicate.id).toBe("node.copy.1");
    expect(duplicate.name).toBe("Button copy");
    expect(duplicate.sourceBinding).toBeUndefined();
    expect(duplicate.position).toEqual({ x: 16, y: 16 });
    expect(duplicate.props.label).toBe("Save");
  });

  it("rejects destructive changes to source-backed read-only regions", () => {
    const readOnly = parseUiDocument({
      ...document,
      root: {
        ...document.root,
        children: [{
          id: "node.region",
          kind: "source-region",
          regionKind: "expression",
          name: "Dynamic expression",
          layout: {
            display: "block",
            direction: "column",
            sizing: { width: "hug", height: "hug" },
          },
          props: {},
          sourceRegion: {
            frameworkId: "react",
            adapterId: "afrodite.adapter.react",
            repositoryPath: "src/App.tsx",
            sourceVersion: "source-v1",
            start: 0,
            end: 5,
            line: 1,
            column: 1,
            mode: "read-only",
            regionKind: "expression",
            excerpt: "{value}",
            reason: "Runtime expression",
          },
          children: [],
        }],
      },
    });

    expect(() => createDeleteNodeCommand(readOnly, "node.region")).toThrow(/read-only/);
    expect(() => createMoveNodeCommand(readOnly, "node.region", { x: 1, y: 1 })).toThrow(/read-only/);
  });
});
