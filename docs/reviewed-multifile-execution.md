# Reviewed multi-file execution

VS-019 binds several fresh source effects to one human-reviewed transaction while keeping approval, preparation, and execution separate.

## Lifecycle

```text
agent semantic dry run
  -> persistent review request
  -> first human approve/reject decision
  -> fresh semantic planning against current Studio and source state
  -> one transaction preview for every changed source file
  -> approved-vs-fresh comparison
  -> second human confirmation of preparation + transaction + source versions
  -> staged compare-and-swap transaction
  -> one shared verification sequence
  -> keep all files or restore every committed file
  -> reversible UI IR command only after source success
  -> one durable execution receipt
```

The first approval records reviewed intent. It does not authorize an old transaction or source plan. Every execution preparation creates fresh bridge-owned plans and a fresh transaction ID.

## Transaction preparation

When semantic planning produces more than one source intent, project bridge converts those typed intents into `BridgeTransactionOperation` entries and calls the existing multi-file transaction planner.

The preparation stores:

```text
preparationId
liveSessionId
liveRevision
liveDocumentVersion
fresh SemanticPlanView
approved-vs-fresh comparison
BridgeTransactionPlanView
```

The transaction view contains the exact file set, one plan ID and source version per file, every unified diff, diagnostics, the number of changed files, and the deduplicated verification sequence.

A preparation is blocked when:

- a changed source plan is missing from the transaction;
- a transaction file has no source change;
- two plans target the same repository path;
- any file or transaction diagnostic is an error;
- the live Studio session changes after preparation;
- the bridge-held transaction expires.

## Second confirmation

The Review Inbox displays the transaction ID, every repository path and source version, all per-file diffs, and the shared verification steps.

The confirmation is bound to:

```text
preparationId
transactionId
live session ID
live revision
live document version
every repository path + source version
```

Changing the Studio document or creating another preparation clears the confirmation.

## Atomic source application

Studio sends only the transaction ID, the reviewed source approvals, and the local reviewer label to `/api/transaction/apply`.

The browser cannot provide:

```text
replacement source text
edit offsets
staging paths
verification commands
per-file commit order
rollback behavior
forged per-file execution receipts
```

Project bridge performs:

```text
preflight read of every file
  -> source-version comparison
  -> stage every final file body
  -> commit each staged file
  -> run one shared verification sequence
  -> keep all files when required verification passes
  -> restore every committed file when commit or verification fails
```

UI IR is not changed for `rejected` or `rolled-back` transactions. It is applied as a reversible Studio command only after the transaction returns `applied`.

## Durable receipt normalization

The browser records one shared `BridgeTransactionApplyResult`. It may not manufacture independent per-file results.

Project bridge validates the receipt against the latest preparation and creates one normalized source result per fresh plan. Every generated result carries the shared transaction ID; one result also stores the complete transaction receipt and verification output.

This preserves compatibility with the existing execution status model while retaining the atomic provenance.

## Outcomes

`applied` means every reviewed source file was committed and required verification passed.

`rejected` means no reviewed source effect was accepted, usually because a source version or approval no longer matched.

`rolled-back` means files were committed temporarily but every committed file was restored. The durable reviewed execution status is `failed` unless an independent document effect had already been applied.

`rollback-failed` is inspected per file:

- a file with `restoredVersion` is recorded as `rolled-back`;
- a file with `afterVersion` and no restore is recorded as still `applied`;
- an unresolved file remains `rollback-failed`.

When any source file remains changed, the reviewed execution becomes `partial`. The next attempt requires another complete fresh preparation and another second confirmation.

## Document execution

After a successful source transaction, Afrodite applies fresh `documentAfter` through the browser-local project-session registry:

```text
createReplaceDocumentCommand
  -> executeLiveCommand
  -> revision increment
  -> patch-plan invalidation
  -> normal undo/redo history
```

If the source transaction succeeds but the document command cannot be created because the Studio revision changed, the source transaction is recorded as a partial execution. A retry starts from the actual current project state.

## Agent boundary

The MCP surface remains unchanged and contains no tool for:

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

The agent can inspect, dry-run, submit a review request, and observe its status. Human-only Studio actions own both decisions and execution.

## Current limits

- semantic API v1 still accepts one typed command per dry run; a command must actually produce several source intents to enter this path;
- same-file plan merging is not implemented, so duplicate transaction targets remain blocked;
- transactions and source plans remain finite-TTL process-memory records;
- crash recovery across project-bridge process failure is not journaled;
- a network failure after source application but before durable receipt persistence may require manual reconciliation;
- local reviewer identity is authenticated by the bridge token rather than a signed user account;
- manual browser and MCP Inspector end-to-end testing remains outstanding.

The next slice is VS-020: typed semantic batches with deterministic command ordering, conflict detection, one combined document effect, and one reviewed multi-file transaction.
