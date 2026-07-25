import { describe, expect, it } from "vitest";
import {
  applyTextEdits,
  createPatchPreview,
  createSourcePatchPlan,
  createSourceVersion,
  validatePatchPlan,
} from "../src/index";

const source = {
  repositoryPath: "src/Card.tsx",
  content: "const value = 1;\n",
};

describe("source patch primitives", () => {
  it("creates a deterministic version and applies non-overlapping edits", () => {
    const version = createSourceVersion(source.content);
    const plan = createSourcePatchPlan({
      frameworkId: "solid",
      adapterId: "afrodite.adapter.solid",
      operation: "update-layout",
      source: { ...source, version },
      edits: [{ start: 14, end: 15, replacement: "2" }],
    });

    expect(plan.sourceVersion).toBe(version);
    expect(validatePatchPlan(plan, { ...source, version })).toEqual([]);
    expect(applyTextEdits(source.content, plan.edits)).toBe("const value = 2;\n");
    expect(createPatchPreview(plan, { ...source, version })).toMatchObject({
      changed: true,
      after: "const value = 2;\n",
    });
  });

  it("blocks stale and overlapping edits", () => {
    const plan = createSourcePatchPlan({
      frameworkId: "solid",
      adapterId: "afrodite.adapter.solid",
      operation: "update-layout",
      source,
      edits: [
        { start: 0, end: 5, replacement: "let" },
        { start: 4, end: 8, replacement: "x" },
      ],
    });

    const diagnostics = validatePatchPlan(plan, {
      ...source,
      content: `${source.content}// changed`,
    });

    expect(diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(["SOURCE_VERSION_MISMATCH", "OVERLAPPING_EDITS"]),
    );
  });
});
