# Reviewed execution orchestration

VS-018 turns an approved agent review into a fresh, human-controlled execution without granting the agent any new capability. VS-019 extends the same boundary to several source files through one atomic transaction.

## Lifecycle

```text
agent semantic dry run
  -> persistent review request
  -> first human approve/reject decision
  -> fresh server-side semantic plan
  -> approved-vs-fresh comparison
  -> optional bridge-owned multi-file transaction
  -> human reviews exact current effects
  -> second explicit confirmation
  -> verified single-file write or atomic transaction
  -> reversible Studio document command
  -> persistent execution receipt
```

The first approval does not authorize an old `SourcePatchPlan` or transaction to be applied later. It authorizes Afrodite Studio to request a fresh preparation.

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
5. creates one transaction when several source intents exist;
6. compares fresh document and source effects with the approved snapshot;
7. persists the preparation and returns it to Studio.

The browser cannot provide replacement text, source offsets, verification commands, a forged fresh plan, a transaction file set, or a source version.

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

A regenerated `planId` alone is not drift. Each effect is classified as `none`, `identical`, `changed`, `added`, or `removed`.

`exactMatch` is true only when fresh planning is `ready`, the application mode matches, the document effect is identical or absent on both sides, and every source effect is identical.

A non-exact preparation may still be executed, but only after the human reviews the fresh result and confirms the exact preparation ID. The old approval is never silently reused as approval of drifted effects.

## Second confirmation

The execution checkbox is bound to one `preparationId`. It becomes invalid when another preparation replaces it.

Before applying anything, Studio verifies the current:

```text
session ID
revision
document version
```

When several files are involved, the confirmation also covers:

```text
transaction ID
every repository path
every source version
one shared verification sequence
```

A mismatch blocks execution before source write.

## Source execution

Zero changed source plans produce a document-only execution.

One changed source plan uses:

```text
POST /api/patch/apply
planId + sourceVersion + approvedBy
```

Several changed source plans require the fresh preparation to contain one reviewed transaction and use:

```text
POST /api/transaction/apply
transactionId + every repositoryPath/sourceVersion + approvedBy
```

The multi-file service performs preflight reads, stages every final file body, commits through compare-and-swap, runs one deduplicated verification sequence, and either keeps all files or attempts to restore every committed file.

A missing plan or transaction is treated as an expired preparation. Studio requires another preparation and another review of every fresh diff.

UI IR is applied only after the single-file write or complete transaction returns `applied`.

See `docs/reviewed-multifile-execution.md` for transaction receipt and rollback semantics.

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

The receipt contains the command ID, new Studio revision, resulting `UiDocument`, and resulting document version. Project bridge accepts it only when the resulting version equals the prepared document effect.

## Execution records

`POST /api/review/record-execution` records the outcome but does not perform the source write or document command itself.

Project bridge validates:

- the review is approved;
- the referenced preparation is the latest preparation;
- every single-file result matches its plan, path, and source version;
- a multi-file preparation records one shared transaction result;
- browser-authored per-file transaction receipts are rejected;
- the transaction ID and complete file set match the preparation;
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

Verification output, rollback outcomes, transaction provenance, and per-file recovery state are preserved.

## Retry history

A terminal result (`applied`, `document-only`, or `source-only`) cannot be prepared again.

A `failed` or `partial` result is moved into `executionHistory` when the human creates a new preparation. The command is re-planned against the actual state after the previous attempt. Any resulting drift is shown again and requires another second confirmation.

A complete rollback normally produces `failed`. A `rollback-failed` transaction becomes `partial` when at least one file remains changed.

## Agent boundary

The MCP tool surface remains:

```text
afrodite_list_semantic_operations
afrodite_inspect_policy
afrodite_inspect_document
afrodite_plan_semantic_operation
afrodite_request_human_approval
afrodite_get_approval_request
```

No MCP tool or agent client method exists for approval decisions, preparation, execution, patch apply, transaction apply, execution recording, filesystem access, shell commands, commits, or merges.

## Current limits

- one active browser Studio session is retained;
- semantic API v1 accepts one typed command per dry run;
- duplicate same-file source intents cannot yet be merged into one transaction file;
- plans and transactions remain process-memory records with finite TTL;
- a network or process failure after an effect but before receipt persistence may require manual reconciliation;
- project bridge authentication identifies a local reviewer label rather than a signed user account;
- multi-user session merging and CRDT history are deferred;
- manual browser and MCP Inspector end-to-end testing has not yet been performed.
