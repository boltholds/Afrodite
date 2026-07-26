import { describe, expect, it } from "vitest";
import { parseUiDocument } from "@afrodite/ui-ir";
import { createCommandHistory, executeCommand, undoCommand } from "../src/index.js";
import {
  createClearSourceBindingCommand,
  createSourceBindingCommand,
} from "../src/binding.js";

const document = parseUiDocument({
  schemaVersion: 1,
  id: "doc",
  name: "Binding test",
  root: {
    id: "root",
    kind: "element",
    element: "main",
    name: "Root",
    layout: {
      display: "block",
      direction: "column",
      sizing: { width: "fill", height: "fill" },
    },
    props: {},
    children: [
      {
        id: "card",
        kind: "element",
        element: "section",
        name: "Card",
        layout: {
          display: "block",
          direction: "column",
          sizing: { width: "hug", height: "hug" },
        },
        props: {},
        children: [],
      },
    ],
  },
});

describe("source binding commands", () => {
  it("binds and reverts a node through command history", () => {
    const command = createSourceBindingCommand(document, "card", {
      frameworkId: "react",
      adapterId: "afrodite.adapter.react",
      repositoryPath: "src/Card.tsx",
      exportName: "Card",
      componentId: "src/Card.tsx#Card",
      stableMarker: "ui.card.primary",
    });
    const applied = executeCommand(createCommandHistory(document), command);
    expect(applied.present.root.children[0]?.sourceBinding?.stableMarker).toBe("ui.card.primary");

    const reverted = undoCommand(applied);
    expect(reverted.present.root.children[0]?.sourceBinding).toBeUndefined();
  });

  it("clears and restores an existing binding", () => {
    const bind = createSourceBindingCommand(document, "card", {
      repositoryPath: "src/Card.tsx",
      stableMarker: "ui.card.primary",
    });
    const bound = bind.apply(document);
    const clear = createClearSourceBindingCommand(bound, "card");
    const cleared = clear.apply(bound);
    expect(cleared.root.children[0]?.sourceBinding).toBeUndefined();
    expect(clear.revert(cleared).root.children[0]?.sourceBinding?.stableMarker).toBe("ui.card.primary");
  });
});
