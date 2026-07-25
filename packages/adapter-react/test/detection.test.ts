import { describe, expect, it } from "vitest";
import { createReactFrameworkAdapter } from "../src/index";

describe("React framework adapter", () => {
  it("detects React independently from SolidJS", () => {
    const result = createReactFrameworkAdapter().detect({
      projectRoot: "/workspace",
      dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
      devDependencies: {},
    });

    expect(result).toMatchObject({
      frameworkId: "react",
      adapterId: "afrodite.adapter.react",
      matched: true,
      confidence: 1,
    });
  });
});
