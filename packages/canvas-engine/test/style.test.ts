import { describe, expect, it } from "vitest";
import { parseUiDocument } from "@afrodite/ui-ir";
import { createCommandHistory, executeCommand, undoCommand } from "../src/index.js";
import {
  createClearStyleOwnershipCommand,
  createStyleOwnershipCommand,
} from "../src/style.js";

const document = parseUiDocument({
  schemaVersion: 1,
  id: "document.test",
  name: "Style ownership",
  root: {
    id: "node.root",
    kind: "element",
    element: "main",
    name: "Root",
    layout: {
      display: "block",
      direction: "column",
      sizing: { width: "fill", height: "fill" },
    },
    props: {},
    sourceBinding: {
      frameworkId: "react",
      adapterId: "afrodite.adapter.react",
      repositoryPath: "src/App.tsx",
      stableMarker: "app.root",
    },
    children: [],
  },
});

describe("style ownership commands", () => {
  it("sets and reverts explicit ownership", () => {
    const command = createStyleOwnershipCommand(document, "node.root", {
      strategy: "utility",
      dialect: "tailwind",
      managedProperties: ["display", "gap"],
    });
    const applied = executeCommand(createCommandHistory(document), command);
    expect(applied.present.root.sourceBinding?.styleOwnership).toEqual({
      strategy: "utility",
      dialect: "tailwind",
      managedProperties: ["display", "gap"],
    });
    expect(undoCommand(applied).present.root.sourceBinding?.styleOwnership).toBeUndefined();
  });

  it("clears and restores ownership", () => {
    const set = createStyleOwnershipCommand(document, "node.root", {
      strategy: "inline",
      managedProperties: ["display"],
    });
    const withOwnership = set.apply(document);
    const clear = createClearStyleOwnershipCommand(withOwnership, "node.root");
    const cleared = clear.apply(withOwnership);
    expect(cleared.root.sourceBinding?.styleOwnership).toBeUndefined();
    expect(clear.revert(cleared).root.sourceBinding?.styleOwnership).toEqual({
      strategy: "inline",
      managedProperties: ["display"],
    });
  });
});
