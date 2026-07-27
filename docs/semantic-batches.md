# Typed semantic batches

VS-022 combines a bounded ordered list of existing semantic commands into one reviewable UI document effect and, where source authority is proven, one source plan or one atomic multi-file transaction.

The trusted core still accepts typed commands only. It does not parse natural language and does not accept browser- or agent-authored source text, offsets, AST replacements, verification commands, filesystem paths, approval decisions, or execution instructions.

## Request boundary

```json
{
  "apiVersion": 1,
  "semanticApiVersion": 1,
  "document": { "schemaVersion": 1, "id": "...", "root": {} },
  "commands": [
    { "type": "convert_to_grid", "nodeId": "node.card", "gap": 16 },
    { "type": "convert_to_grid", "nodeId": "node.panel", "gap": 20 }
  ]
}
```

A batch contains between one and sixteen commands from the existing semantic operation API:

```text
convert_to_grid
create_responsive_variant
replace_spacing_with_token
```

`explain_unpatchable_region` is intentionally excluded from mutation batches. It remains a separate informational operation because an atomic mutation result cannot also be an explanation-only result.

## Planning algorithm

```text
one immutable input UiDocument
  -> parse and normalize all commands
  -> enforce command-count budget
  -> detect declared semantic write conflicts
  -> independently preflight every command against the same input document
  -> stop when any command is blocked or informational
  -> compose commands sequentially in declared order
  -> record per-step before/after document versions
  -> collect typed style/variant source intents
  -> resolve each strategy's real target path
  -> reject duplicate actual source targets
  -> produce one deterministic batch ID and documentAfter
```

Independent preflight is a security boundary. A command cannot gain editability, binding, ownership, or source capability merely because an earlier command in the same batch changed the document.

Sequential composition is a product boundary. When all commands pass independent preflight, their document effects are applied in the exact declared order so the reviewer receives one precise final `documentAfter`.

## Conflict detection

Semantic writes are represented by deterministic conflict keys.

Examples:

```text
node:node.card:layout.display
node:node.card:layout.gap
node:node.card:variants.responsive:tablet
node:node.card:sourceBinding.styleOwnership.tokens.gap
```

Two commands writing the same key block the entire batch with `SEMANTIC_BATCH_WRITE_CONFLICT`. Afrodite does not silently choose the first or last command.

After document composition, source intents are checked against their actual strategy-owned target:

| Strategy | Actual source target |
|---|---|
| inline style | binding repository path |
| Tailwind utility | binding repository path |
| CSS Module | `stylesheetPath` |
| design token | `tokenFilePath` |

Two intents targeting the same actual file block the batch with `SEMANTIC_BATCH_SOURCE_FILE_CONFLICT`. Same-file AST/CSS merge planning is not yet proven, even when the semantic writes affect different nodes or properties.

## Result contract

A batch plan contains:

```text
batchId
documentVersion
status: ready | blocked
applicationMode: document-and-source | document-only | mixed
ordered commands
ordered step plans
per-step before/after document versions
diagnostics with commandIndex and optional conflictKey
exact source plan previews
optional sourceTransaction
combined documentAfter
```

The batch ID is deterministic over the input document version, normalized commands, combined document, and typed source intents.

`mixed` means every UI IR command is valid, but only a subset has a proven source representation. The reviewer sees an explicit warning and every document-only step.

## Project bridge

The authenticated planning route is:

```text
POST /api/semantic/batch/plan
```

The browser or agent sends only a current UI document and typed commands. Project bridge invokes existing style and variant adapters.

When no source intents exist, the result is document-only.

When one source intent exists, project bridge creates one server-held patch plan.

When two or more source intents target distinct files, project bridge immediately creates one server-held transaction through the existing VS-013 transaction service:

```text
typed source intents
  -> one adapter plan per file
  -> one transactionId
  -> exact source version per file
  -> deduplicated verification sequence
```

The browser cannot replace this transaction with a set of unrelated per-file apply calls.

## Studio workflow

Studio exposes the **Batches** workspace.

A manually authored batch follows:

```text
commands JSON
  -> shared protocol validation
  -> project-bridge dry run
  -> exact ordered steps / diagnostics / diffs / transaction / documentAfter
  -> checkbox bound to batchId + input document version
  -> source patch or transaction
  -> replace-document command only after complete source success
```

The transaction approval includes `repositoryPath + sourceVersion` for every file. Source compare-and-swap and verification run before the UI document changes.

The final document is applied as one `createReplaceDocumentCommand`, so the complete batch appears as one undo/redo entry in the live project session.

When source execution returns `rejected`, `rolled-back`, or `rollback-failed`, Studio does not apply `documentAfter`.

## Agent workflow

The MCP gateway adds three tools:

```text
afrodite_plan_semantic_batch
afrodite_request_semantic_batch_review
afrodite_get_semantic_batch_review
```

Default batch policy:

```text
maximum commands       16
maximum source plans    8
maximum diff size      80,000 characters
review TTL             15 minutes
```

A batch can enter review only when it was produced by the same gateway process. The model cannot submit an arbitrary `batchId` or fabricated batch payload through the MCP tools.

The durable review is stored in:

```text
<target-project>/.afrodite/semantic-batch-reviews.json
```

The file is written through a temporary sibling and rename. On POSIX the directory is created with mode `0700` and the file with mode `0600`.

Project bridge validates that the batch input document version still matches the current live Studio session before accepting the review and again before accepting a human decision.

## Human decision and execution

An agent-submitted batch has two independent human actions:

1. approve or reject the exact durable batch review;
2. separately select the exact batch-ID confirmation and apply it.

Approval changes only the review record. It does not execute a source transaction or replace the UI document.

The apply action checks the current live document version again. Source plans also retain their own compare-and-swap versions. Any stale document, expired plan, stale source, verification failure, or rollback blocks UI document application.

## Current boundaries

- Maximum sixteen commands per batch.
- Commands must already exist in semantic API v1.
- Informational operations cannot be mixed into mutation batches.
- Same semantic field writes are rejected rather than ordered by last-write-wins.
- Same actual source file intents are rejected rather than merged.
- Source intents are limited to existing style and responsive-variant adapters.
- A batch review stores the exact original plan; fresh batch re-planning and approved-vs-fresh drift comparison are deferred.
- Batch execution does not yet produce the durable execution receipt/history used by single-operation reviewed execution.
- Transactions remain logically all-or-rollback while project bridge stays alive; crash journaling is deferred.
- Manual browser and MCP Inspector end-to-end verification remains outstanding.

## Follow-up

VS-023 will add semantic motion source adapters. Typed animation clips will remain document-owned unless an adapter can prove the target source format, ownership region, trigger representation, and reversible patch boundary.
