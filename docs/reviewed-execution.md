# Reviewed execution orchestration

VS-018 turns an approved agent review into a fresh, human-controlled execution without granting the agent any new capability.

## Lifecycle

```text
agent semantic dry run
  -> persistent review request
  -> human approve
  -> fresh server-side semantic plan
  -> approved-vs-fresh comparison
  -> human reviews exact current effects
  -> second explicit confirmation
  -> source verified-write
  -> reversible Studio document command
  -> persistent execution receipt
```

The first approval does not authorize an old `SourcePatchPlan` to be applied later. It authorizes Afrodite Studio to ask project bridge for a fresh preparation.

## Fresh preparation

`POST /api/review/prepare-execution` accepts only:

```json
{
  "requestId": "review_...",
  "preparedBy": "afrodite-studio-user"
}
```

Project bridge then:

1. loads the approved request;
2. reads the current live Studio snapshot;
3. re-runs the original typed semantic command;
4. creates new server-held source plans against current source versions;
5. compares fresh document and source effects with the approved snapshot;
6. persists the preparation and returns it to Studio.

The browser cannot provide replacement text, source offsets, verification commands, a forged fresh plan, or a source version.

## Comparison model

Document effects are compared through deterministic Semantic UI document versions.

Source effects are compared through:

```text
repository path
source version
changed flag
unified diff
diagnostics
verification requirements
```

A regenerated `planId` alone is not drift. The comparison status for each effect is:

```text
none
identical
changed
added
removed
```

`exactMatch` is true only when fresh planning is `ready`, the application mode matches, the document effect is identical or absent on both sides, and every source effect is identical.

A non-exact preparation may still be executed, but only after the human reviews the fresh result and confirms the exact preparation ID. The old approval is never silently reused as approval of drifted effects.

## Second confirmation

The execution checkbox is bound to one `preparationId`. It becomes invalid when another preparation replaces it.

Before applying any effect, Studio reads the current live session and verifies:

```text
session ID
revision
document version
```

against the preparation. A mismatch blocks execution before source write.

## Source execution order

Reviewed execution v1 supports zero or one changed source plan.

When a source effect exists, Studio applies it first through the existing endpoint:

```text
POST /api/patch/apply
planId + sourceVersion + approvedBy
```

The same compare-and-swap, formatter, typecheck, test, build, and rollback rules remain active.

A missing server plan is treated as an expired preparation. Studio requires a new preparation and another review of the fresh diff.

Multi-file source effects are blocked rather than applied sequentially. They require a reviewed transaction boundary in a later slice.

## Reversible UI IR execution

The active Studio project session is retained in a browser-local session registry independent of workbench mounting.

A fresh `documentAfter` is applied through:

```text
createReplaceDocumentCommand
  -> executeLiveCommand
  -> revision increment
  -> patch-plan invalidation
  -> normal undo/redo history
```

The receipt contains:

```text
command ID
new Studio revision
resulting UiDocument
resulting document version
```

Project bridge accepts the receipt only when the resulting document version equals the prepared document effect.

## Execution records

`POST /api/review/record-execution` records the outcome but does not perform the source write or document command itself.

Project bridge validates:

- the review is approved;
- the referenced preparation is the latest preparation;
- every changed source plan has exactly one result;
- result plan IDs, repository paths, and source versions match;
- document command metadata exists only when a document was applied;
- the resulting document version matches the preparation.

The server derives one status:

```text
applied
document-only
source-only
partial
failed
```

Verification output and rollback outcomes are preserved in each source result.

## Retry history

A terminal result (`applied`, `document-only`, or `source-only`) cannot be prepared again.

A `failed` or `partial` result is moved into `executionHistory` when the human creates a new preparation. The command is then re-planned against the state that exists after the failed or partial attempt. Any resulting drift is shown again and requires another second confirmation.

## Agent boundary

The MCP tool surface is unchanged:

```text
afrodite_list_semantic_operations
afrodite_inspect_policy
afrodite_inspect_document
afrodite_plan_semantic_operation
afrodite_request_human_approval
afrodite_get_approval_request
```

No MCP tool or agent client method exists for:

```text
approve
reject
prepare execution
execute
apply patch
apply transaction
record execution
filesystem
shell
commit
merge
```

## Current limits

- one active browser Studio session is retained;
- reviewed execution accepts at most one changed source plan;
- source plans remain process-memory records with finite TTL;
- a network failure after an effect but before execution-record persistence may require a fresh preparation and manual reconciliation;
- project bridge authentication identifies a local reviewer label rather than a signed user account;
- multi-user session merging and CRDT history are deferred;
- manual browser and MCP Inspector end-to-end testing has not yet been performed.
