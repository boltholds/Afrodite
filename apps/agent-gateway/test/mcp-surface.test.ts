import { describe, expect, it } from "vitest";
import { AFRODITE_AGENT_MCP_TOOLS } from "../src/mcp.js";

const forbiddenFragments = [
  "apply",
  "approve",
  "write",
  "filesystem",
  "shell",
  "exec",
  "transaction",
  "source_read",
];

describe("Afrodite agent MCP surface", () => {
  it("exposes only inspection, planning, and approval-request tools", () => {
    expect(AFRODITE_AGENT_MCP_TOOLS).toEqual([
      "afrodite_list_semantic_operations",
      "afrodite_inspect_policy",
      "afrodite_inspect_document",
      "afrodite_plan_semantic_operation",
      "afrodite_request_human_approval",
      "afrodite_get_approval_request",
    ]);

    for (const name of AFRODITE_AGENT_MCP_TOOLS) {
      for (const fragment of forbiddenFragments) {
        if (fragment === "approve") continue;
        expect(name).not.toContain(fragment);
      }
    }
    expect(AFRODITE_AGENT_MCP_TOOLS.some((name) => name.includes("request_human_approval"))).toBe(true);
    expect(AFRODITE_AGENT_MCP_TOOLS.some((name) => name.includes("approve_plan"))).toBe(false);
  });
});
