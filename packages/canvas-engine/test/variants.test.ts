import { describe, expect, it } from "vitest";
import { createCommandHistory, executeCommand, undoCommand } from "../src/index.js";
import { createVariantsCommand } from "../src/variants.js";
import type { UiDocument } from "@afrodite/ui-ir";

const document: UiDocument = {
  schemaVersion: 1,
  id: "document.demo",
  name: "Demo",
  root: {
    id: "node.root",
    name: "Root",
    kind: "element",
    element: "main",
    layout: {
      display: "flex",
      direction: "column",
      sizing: { width: "fill", height: "hug" },
    },
    props: {},
    children: [],
  },
};

describe("variant commands", () => {
  it("applies and reverts responsive and state overrides", () => {
    const variants = {
      responsive: [{ id: "tablet", minWidth: 768, layout: { direction: "row" as const } }],
      states: [{ id: "loading", state: "loading" as const, layout: { display: "grid" as const } }],
    };
    const command = createVariantsCommand(document, "node.root", variants);
    const applied = executeCommand(createCommandHistory(document), command);
    expect(applied.present.root.variants).toEqual(variants);
    expect(undoCommand(applied).present.root.variants).toBeUndefined();
  });

  it("rejects edits against source-backed read-only nodes", () => {
    const readOnly: UiDocument = {
      ...document,
      root: {
        ...document.root,
        kind: "source-region",
        regionKind: "conditional",
        sourceRegion: {
          frameworkId: "react",
          adapterId: "afrodite.adapter.react",
          repositoryPath: "src/Screen.tsx",
          sourceVersion: "version",
          start: 0,
          end: 10,
          line: 1,
          column: 1,
          mode: "read-only",
          regionKind: "conditional",
          excerpt: "ready ? <A /> : <B />",
          reason: "Runtime condition remains source-controlled.",
        },
      },
    };
    expect(() => createVariantsCommand(readOnly, "node.root", { responsive: [], states: [] }))
      .toThrow(/read-only/);
  });
});
