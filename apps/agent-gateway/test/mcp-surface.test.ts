import { describe, expect, it } from "vitest";
import { AFRODITE_AGENT_MCP_TOOLS } from "../src/mcp.js";

const forbiddenFragments = [
  "apply",
  "approve_plan",
  "approve_batch",
  "execute",
  "write",
  "filesystem",
  "shell",
  "exec",
  "transaction_apply",
  "source_read",
];

describe("Afrodite agent MCP surface", () => {
  it("exposes only inspection, planning, and human-review request tools", () => {
    expect(AFRODITE_AGENT_MCP_TOOLS).toEqual([
      "afrodite_list_semantic_operations",
      "afrodite_inspect_policy",
      "afrodite_inspect_document",
      "afrodite_plan_semantic_operation",
      "afrodite_request_human_approval",
      "afrodite_get_approval_request",
      "afrodite_plan_semantic_batch",
      "afrodite_request_semantic_batch_review",
      "afrodite_get_semantic_batch_review",
    ]);

    for (const name of AFRODITE_AGENT_MCP_TOOLS) {
      for (const fragment of forbiddenFragments) {
        expect(name).not.toContain(fragment);
      }
    }

    expect(AFRODITE_AGENT_MCP_TOOLS).toContain("afrodite_plan_semantic_batch");
    expect(AFRODITE_AGENT_MCP_TOOLS).toContain("afrodite_request_semantic_batch_review");
    expect(AFRODITE_AGENT_MCP_TOOLS.some((name) => name.includes("apply"))).toBe(false);
    expect(AFRODITE_AGENT_MCP_TOOLS.some((name) => name.includes("execute"))).toBe(false);
  });
});
