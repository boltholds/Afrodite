import { describe, expect, it } from "vitest";
import type { UiDocument } from "@afrodite/ui-ir";
import { createLayoutCommand } from "../src/index.js";

const document: UiDocument = {
  schemaVersion: 1,
  id: "document.imported",
  name: "Imported",
  root: {
    id: "region.conditional",
    kind: "source-region",
    regionKind: "conditional",
    name: "Conditional rendering",
    layout: {
      display: "block",
      direction: "column",
      sizing: { width: "hug", height: "hug" },
    },
    props: {},
    sourceRegion: {
      frameworkId: "react",
      adapterId: "afrodite.adapter.react",
      repositoryPath: "src/Screen.tsx",
      sourceVersion: "fnv1a32:00000000:0",
      exportName: "Screen",
      start: 10,
      end: 40,
      line: 2,
      column: 3,
      mode: "read-only",
      regionKind: "conditional",
      excerpt: "ready ? <Ready /> : <Loading />",
      reason: "Conditional rendering remains source-controlled.",
    },
    children: [],
  },
};

describe("source-backed read-only regions", () => {
  it("rejects layout command creation even when called outside Inspector", () => {
    expect(() => createLayoutCommand(document, "region.conditional", { gap: 12 }))
      .toThrow(/source-backed read-only region/);
  });
});
