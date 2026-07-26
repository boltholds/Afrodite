import { describe, expect, it } from "vitest";
import {
  bridgeApplyRequestSchema,
  bridgePlanRequestSchema,
  bridgePlanResponseSchema,
} from "./bridge";

const operation = {
  kind: "update-layout" as const,
  nodeId: "node.card",
  binding: {
    frameworkId: "react",
    adapterId: "afrodite.adapter.react",
    repositoryPath: "src/Card.tsx",
    stableMarker: "card.primary",
  },
  before: {
    display: "block" as const,
    direction: "column" as const,
    sizing: { width: "hug" as const, height: "hug" as const },
  },
  after: {
    display: "flex" as const,
    direction: "row" as const,
    gap: 16,
    padding: 12,
    sizing: { width: "fill" as const, height: 240 },
  },
};

describe("project bridge protocol", () => {
  it("validates a framework-neutral layout operation", () => {
    expect(bridgePlanRequestSchema.parse({ operation }).operation.binding.frameworkId).toBe("react");
  });

  it("binds approval to an exact plan and source version", () => {
    expect(bridgeApplyRequestSchema.parse({
      planId: "patch-1",
      sourceVersion: "fnv1a32:abc:12",
      approvedBy: "studio",
    })).toEqual({
      planId: "patch-1",
      sourceVersion: "fnv1a32:abc:12",
      approvedBy: "studio",
    });
  });

  it("rejects malformed plan responses", () => {
    expect(bridgePlanResponseSchema.safeParse({
      ok: true,
      plan: { planId: "patch-1" },
    }).success).toBe(false);
  });
});
