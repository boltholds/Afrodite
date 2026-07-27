# Policy-controlled MCP agent gateway

Afrodite exposes semantic automation through a local MCP stdio server without granting an agent filesystem, shell, source-write, transaction-apply, execution, or approval-decision capabilities.

## Trust boundary

```text
MCP host / agent
  -> constrained MCP tool schema
  -> single-operation or batch policy
  -> sanitized current Studio UiDocument
  -> semantic dry-run request
  -> authenticated local project bridge
  -> existing semantic planners and source adapters
  -> exact document effect / diffs / optional transaction returned for review
  -> persistent pending human review request

No apply, execute, or approval-decision tool exists in the gateway.
```

The gateway reads the current document from `/api/session/current`. Studio publishes revisioned project-session snapshots through project bridge. The connected model cannot select a filesystem path or upload another document through MCP.

The project bridge token is read from an environment variable and remains private to the gateway process. It is never included in tool results, policy inspection, audit details, or startup stdout.

All process messages are written to stderr because stdout is reserved for MCP JSON-RPC.

## MCP tools

The server exposes exactly nine tools:

```text
afrodite_list_semantic_operations
afrodite_inspect_policy
afrodite_inspect_document
afrodite_plan_semantic_operation
afrodite_request_human_approval
afrodite_get_approval_request
afrodite_plan_semantic_batch
afrodite_request_semantic_batch_review
afrodite_get_semantic_batch_review
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
execute_batch
approve
reject
merge
commit
```

### Document inspection

`afrodite_inspect_document` returns a bounded semantic tree from the most recently published Studio session. It includes IDs, node kinds, layout, variants, animation summaries, prop names, source-binding summaries, and source-region coordinates.

It redacts:

- prop values;
- source text and source excerpts;
- project root paths outside repository-relative bindings;
- bridge credentials;
- stored patch internals.

The default policy limits inspection to 250 nodes and depth 8.

### Single semantic dry runs

`afrodite_plan_semantic_operation` accepts the same API v1 commands as `@afrodite/semantic-ops`:

```text
convert_to_grid
create_responsive_variant
replace_spacing_with_token
explain_unpatchable_region
```

The gateway sends the live document and typed command to `/api/semantic/plan`. Source intents continue through project-bridge style or variant strategies and produce exact `SourcePatchPlan` views.

The gateway does not apply `documentAfter`, call `/api/patch/apply`, or call `/api/transaction/apply`.

### Typed semantic batch dry runs

`afrodite_plan_semantic_batch` accepts one to sixteen existing typed commands. It calls `/api/semantic/batch/plan` and returns:

- one deterministic batch ID;
- ordered per-command provenance;
- conflict diagnostics;
- one combined `documentAfter`;
- exact source plan views;
- an optional bridge-owned source transaction.

The batch gateway enforces its own limits before review submission:

```text
maximum commands       16
maximum source plans    8
maximum diff size      80,000 characters
```

A batch must pass independent command preflight, semantic write-conflict checks, and actual source-target conflict checks. The agent cannot bypass these checks by choosing an order or providing source text.

### Human review requests

An agent may create a request only for a single plan or batch produced by the same gateway process. The MCP layer records dry runs locally and refuses invented plan or batch IDs.

Single-operation requests are persisted at:

```text
.afrodite/collaboration.json
```

Batch requests are persisted separately at:

```text
.afrodite/semantic-batch-reviews.json
```

Both survive Studio and gateway restarts. The durable batch request includes the complete ordered commands, document effect, exact diffs, diagnostics, source versions, and optional transaction preview.

The MCP API can observe `pending`, `approved`, `rejected`, or `expired`, but it has no method that changes the state and no method that applies the referenced plan or batch. Only Studio calls the human-decision routes.

A human decision remains separate from application:

```text
approve request
  != apply documentAfter
  != apply source patch
  != apply source transaction
```

Source application still requires exact server-held source versions. A stale document, expired plan, changed source, failed verification, or rollback prevents the UI document effect from being committed.

## Default policy

Single-operation policy:

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

Batch policy:

```json
{
  "policyId": "afrodite.agent.semantic-batch.read-plan-request.v1",
  "maxCommands": 16,
  "maxSourcePlans": 8,
  "maxDiffCharacters": 80000,
  "reviewRequestTtlMs": 900000
}
```

The single-operation policy engine records a bounded in-memory audit trail for allowed, denied, and failed calls. Single and batch gateways retain exact plan provenance process-locally so the model cannot submit a payload that was not created by the current gateway session.

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

- Studio publishes one current document snapshot, not a collaborative CRDT or multi-user event stream.
- Durable reviews persist, but project-bridge patch and transaction plans retain finite TTL.
- Approving a request does not automatically apply UI IR or source effects.
- Single-operation reviewed execution has fresh re-planning, drift comparison, and durable receipts.
- Batch review currently stores and applies the exact version-bound plan; fresh batch re-planning and durable batch execution receipts are deferred.
- Same actual source-file batch intents are blocked rather than merged.
- Natural-language interpretation belongs to the MCP host or model and remains outside the trusted core.
- The agent audit remains process-local and signed actor identities are deferred.
- Manual MCP Inspector and browser end-to-end verification remain outstanding.
