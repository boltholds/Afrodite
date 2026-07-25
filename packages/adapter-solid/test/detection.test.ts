import { describe, expect, it } from "vitest";
import { createSolidFrameworkAdapter } from "../src/index";

describe("SolidJS framework adapter", () => {
  it("detects solid-js without executing the project", () => {
    const result = createSolidFrameworkAdapter().detect({
      projectRoot: "/workspace",
      dependencies: { "solid-js": "^1.9.0" },
      devDependencies: {},
    });

    expect(result).toMatchObject({
      frameworkId: "solid",
      adapterId: "afrodite.adapter.solid",
      matched: true,
      confidence: 1,
    });
  });
});
