import { describe, expect, it } from "vitest";
import { styleOwnershipSchema } from "./schema.js";

describe("style ownership schema", () => {
  it("accepts explicit strategy-specific ownership", () => {
    expect(styleOwnershipSchema.parse({
      strategy: "css-module",
      managedProperties: ["display", "gap"],
      stylesheetPath: "src/Card.module.css",
      className: "card",
    })).toEqual({
      strategy: "css-module",
      managedProperties: ["display", "gap"],
      stylesheetPath: "src/Card.module.css",
      className: "card",
    });
  });

  it("requires token bindings for every owned property", () => {
    const result = styleOwnershipSchema.safeParse({
      strategy: "design-token",
      managedProperties: ["gap", "padding"],
      tokenFilePath: "src/tokens.css",
      tokens: { gap: "--card-gap" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate ownership declarations", () => {
    const result = styleOwnershipSchema.safeParse({
      strategy: "inline",
      managedProperties: ["display", "display"],
    });
    expect(result.success).toBe(false);
  });
});
