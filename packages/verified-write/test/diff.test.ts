import { describe, expect, it } from "vitest";
import { createUnifiedDiff } from "../src/diff.js";

describe("createUnifiedDiff", () => {
  it("creates a reviewable framework-neutral hunk", () => {
    const diff = createUnifiedDiff({
      repositoryPath: "src/Card.tsx",
      before: "line 1\nold layout\nline 3\n",
      after: "line 1\nnew layout\nline 3\n",
    });

    expect(diff).toContain("--- a/src/Card.tsx");
    expect(diff).toContain("+++ b/src/Card.tsx");
    expect(diff).toContain("-old layout");
    expect(diff).toContain("+new layout");
    expect(diff).toContain(" line 3");
  });

  it("returns only headers when the source is unchanged", () => {
    expect(createUnifiedDiff({
      repositoryPath: "src/Card.tsx",
      before: "same\n",
      after: "same\n",
    })).toBe("--- a/src/Card.tsx\n+++ b/src/Card.tsx\n");
  });
});
