# Policy-controlled MCP agent gateway

Afrodite exposes semantic automation through a local MCP stdio server without granting an agent filesystem, shell, source-write, transaction-apply, or approval-decision capabilities.

## Trust boundary

```text
MCP host / agent
  -> constrained MCP tool schema
  -> AgentGatewayPolicy
  -> sanitized in-memory UiDocument snapshot
  -> semantic dry-run request
  -> authenticated local project bridge
  -> existing semantic planner and adapter plans
  -> exact diff returned for review
  -> pending human approval request

No apply or approval-decision tool exists in the gateway.
```

The gateway starts with one explicitly selected Semantic UI IR JSON file. It parses and keeps that document in memory. The connected model cannot choose arbitrary filesystem paths or request additional files.

The project bridge token is read from an environment variable and remains private to the gateway process. It is never included in tool results, policy inspection, audit details, or startup stdout.

All process messages are written to stderr because stdout is reserved for MCP JSON-RPC.

## MCP tools

The server exposes exactly six tools:

```text
afrodite_list_semantic_operations
afrodite_inspect_policy
afrodite_inspect_document
afrodite_plan_semantic_operation
afrodite_request_human_approval
afrodite_get_approval_request
```

There are deliberately no tools named or equivalent to:

```text
read_file
write_file
list_directory
shell
exec
apply_patch
apply_transaction
approve
merge
commit
```

### Document inspection

`afrodite_inspect_document` returns a bounded semantic tree. It includes IDs, node kinds, layout, variants, prop names, source-binding summaries, and source-region coordinates.

It redacts:

- prop values;
- source text and source excerpts;
- project root paths outside repository-relative bindings;
- bridge credentials;
- stored patch internals.

The default policy limits inspection to 250 nodes and depth 8.

### Semantic dry runs

`afrodite_plan_semantic_operation` accepts the same API v1 commands as `@afrodite/semantic-ops`:

```text
convert_to_grid
create_responsive_variant
replace_spacing_with_token
explain_unpatchable_region
```

The gateway sends the reviewed in-memory document and typed command to `/api/semantic/plan`. Source intents continue through project-bridge style or variant strategies and produce the existing exact `SourcePatchPlan` views.

The gateway does not apply `documentAfter`, call `/api/patch/apply`, or call `/api/transaction/apply`.

Default policy rejects a dry run that exceeds eight source plans or 80,000 diff characters.

### Human approval requests

An agent may create a request only for a plan produced by the same gateway process. It cannot invent a semantic plan ID or source plan list.

A request contains:

- actor and session ID;
- semantic plan ID and document version;
- original typed command;
- source plan IDs, repository-relative paths, and source versions;
- optional rationale;
- expiration time;
- an explicit instruction to review in Afrodite Studio.

The MCP API can observe only `pending` or `expired`. It has no method that changes a request to approved or rejected and no method that applies the referenced plans.

## Default policy

```json
{
  "policyId": "afrodite.agent.read-plan-request.v1",
  "maxInspectionDepth": 8,
  "maxInspectionNodes": 250,
  "maxSourcePlans": 8,
  "maxDiffCharacters": 80000,
  "approvalRequestTtlMs": 900000
}
```

The policy engine also records a bounded in-memory audit trail for allowed, denied, and failed tool calls.

## Start the gateway

Start Studio and project bridge normally. Export the bridge token printed by project bridge:

```bash
export AFRODITE_BRIDGE_TOKEN='<local bridge token>'
```

Start the MCP server with an explicit document snapshot:

```bash
pnpm dev:agent \
  --document ./screen.afrodite.json \
  --bridge-url http://127.0.0.1:4175 \
  --actor codex
```

For a built workspace:

```bash
pnpm --filter @afrodite/agent-gateway build
node apps/agent-gateway/dist/cli.js \
  --document ./screen.afrodite.json
```

## Example MCP host configuration

```json
{
  "mcpServers": {
    "afrodite": {
      "command": "pnpm",
      "args": [
        "--dir",
        "/absolute/path/to/Afrodite",
        "dev:agent",
        "--document",
        "/absolute/path/to/screen.afrodite.json"
      ],
      "env": {
        "AFRODITE_BRIDGE_TOKEN": "<local bridge token>"
      }
    }
  }
}
```

The token belongs in host process configuration, not in a model prompt or tool argument.

## Current boundary

- the document is an immutable startup snapshot; live project-session subscription is deferred;
- approval requests are process-memory records and disappear when the gateway exits;
- the gateway does not provide a Studio approval inbox yet;
- one semantic command is planned at a time;
- agent batching, plan composition, and transaction requests are deferred;
- natural-language interpretation belongs to the MCP host or model and remains outside the trusted core;
- audit persistence and signed actor identities are deferred.
