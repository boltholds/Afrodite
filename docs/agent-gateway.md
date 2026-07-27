# Policy-controlled MCP agent gateway

Afrodite exposes semantic automation through a local MCP stdio server without granting an agent filesystem, shell, source-write, transaction-apply, or approval-decision capabilities.

## Trust boundary

```text
MCP host / agent
  -> constrained MCP tool schema
  -> AgentGatewayPolicy
  -> sanitized current Studio UiDocument
  -> semantic dry-run request
  -> authenticated local project bridge
  -> existing semantic planner and adapter plans
  -> exact diff returned for review
  -> persistent pending human review request

No apply or approval-decision tool exists in the gateway.
```

The gateway reads the current document from `/api/session/current`. Studio publishes revisioned project-session snapshots through project bridge. The connected model cannot select a filesystem path or upload another document through MCP.

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
reject
merge
commit
```

### Document inspection

`afrodite_inspect_document` returns a bounded semantic tree from the most recently published Studio session. It includes IDs, node kinds, layout, variants, prop names, source-binding summaries, and source-region coordinates.

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

The gateway sends the live document and typed command to `/api/semantic/plan`. Source intents continue through project-bridge style or variant strategies and produce exact `SourcePatchPlan` views.

The gateway does not apply `documentAfter`, call `/api/patch/apply`, or call `/api/transaction/apply`.

Default policy rejects a dry run that exceeds eight source plans or 80,000 diff characters.

### Human review requests

An agent may create a request only for a plan produced by the same gateway process. The MCP layer records each dry run locally and refuses an invented semantic plan ID.

The request submitted to project bridge contains:

- actor and agent session ID;
- semantic plan ID and exact live document version;
- original typed command;
- complete reviewed `documentAfter`, when present;
- exact source plan diffs, diagnostics, verification steps, plan IDs, paths, and source versions;
- optional rationale;
- expiration time.

Requests are persisted at `.afrodite/collaboration.json` under the explicitly configured project root. They survive Studio and gateway restarts.

The MCP API can observe `pending`, `approved`, `rejected`, or `expired`, but it has no method that changes the state and no method that applies the referenced plan. Only the Studio Review Inbox calls `/api/review/decide`.

A human decision remains separate from application:

```text
approve request
  != apply documentAfter
  != apply source patch
```

Source application still requires the exact server-held `planId + sourceVersion`. If that plan expires or the source changes, Studio receives the normal verified-write rejection and must create a fresh plan.

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

The policy engine also records a bounded in-memory audit trail for allowed, denied, and failed agent calls. The durable inbox separately preserves actor, command, plan, and human-decision provenance.

## Start the gateway

Start Studio and project bridge normally. In Studio, connect to project bridge from Project session. The Studio shell then publishes the current document and subsequent revisions.

Export the bridge token printed by project bridge:

```bash
export AFRODITE_BRIDGE_TOKEN='<local bridge token>'
```

Start the MCP server:

```bash
pnpm dev:agent \
  --bridge-url http://127.0.0.1:4175 \
  --actor codex
```

For a built workspace:

```bash
pnpm --filter @afrodite/agent-gateway build
node apps/agent-gateway/dist/cli.js \
  --bridge-url http://127.0.0.1:4175 \
  --actor codex
```

The gateway refuses to start until a live Studio document is available from project bridge.

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
        "--bridge-url",
        "http://127.0.0.1:4175",
        "--actor",
        "codex"
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

- Studio publishes one current document snapshot, not a collaborative CRDT or multi-user event stream;
- review records persist, but project-bridge source plans retain their existing finite TTL;
- approving a request does not automatically load UI IR or apply source;
- loading an approved `documentAfter` currently starts a new Studio command history after a page reload;
- one semantic command is planned at a time;
- agent batching, plan composition, and transaction requests are deferred;
- natural-language interpretation belongs to the MCP host or model and remains outside the trusted core;
- the agent audit remains process-local and signed actor identities are deferred.
