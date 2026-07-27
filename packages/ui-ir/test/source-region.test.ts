import { describe, expect, it } from "vitest";
import { parseUiDocument } from "../src/index.js";

describe("source-backed UI IR regions", () => {
  it("validates a read-only conditional region with exact snapshot provenance", () => {
    const document = parseUiDocument({
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
          sourceVersion: "fnv1a32:deadbeef:40",
          exportName: "Screen",
          start: 20,
          end: 60,
          line: 4,
          column: 7,
          mode: "read-only",
          regionKind: "conditional",
          excerpt: "ready ? <Ready /> : <Loading />",
          reason: "Conditional rendering remains source-controlled.",
        },
        children: [],
      },
    });

    expect(document.root.kind).toBe("source-region");
    expect(document.root.sourceRegion?.sourceVersion).toBe("fnv1a32:deadbeef:40");
  });

  it("requires a reason for read-only regions", () => {
    expect(() => parseUiDocument({
      schemaVersion: 1,
      id: "document.invalid",
      name: "Invalid",
      root: {
        id: "region.invalid",
        kind: "source-region",
        regionKind: "expression",
        name: "Expression",
        layout: {
          display: "block",
          direction: "column",
          sizing: { width: "hug", height: "hug" },
        },
        props: {},
        sourceRegion: {
          frameworkId: "solid",
          adapterId: "afrodite.adapter.solid",
          repositoryPath: "src/Screen.tsx",
          sourceVersion: "version",
          start: 1,
          end: 2,
          line: 1,
          column: 1,
          mode: "read-only",
          regionKind: "expression",
          excerpt: "value()",
        },
        children: [],
      },
    })).toThrow();
  });
});
