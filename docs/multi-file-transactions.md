# Multi-file verified transactions

VS-013 extends Afrodite's verified-write boundary from one source file to one reviewed set of source files.

## Transaction flow

```text
semantic layout/style operations
  -> server-side framework and style strategy plans
  -> deterministic multi-file transaction ID
  -> current snapshot read for every target
  -> per-file unified diffs
  -> approval bound to transaction ID and every source version
  -> preflight re-read of every target
  -> stage every replacement before the first commit
  -> compare-and-swap commit for each staged target
  -> one shared verification sequence
  -> keep every file or restore every committed file
```

The browser submits semantic `layout` and `style` operations. It does not submit text offsets, replacements, temporary paths, or verification commands.

## Approval identity

An approval contains:

```json
{
  "transactionId": "transaction:...",
  "sources": [
    {
      "repositoryPath": "src/Card.tsx",
      "sourceVersion": "fnv1a32:..."
    },
    {
      "repositoryPath": "src/Card.module.css",
      "sourceVersion": "fnv1a32:..."
    }
  ]
}
```

The transaction is rejected before the first commit when the transaction ID, number of files, path set, or any source version differs from the reviewed preview.

## Planning constraints

A transaction currently requires at least two changed source files. Every target path must be unique.

Two independent adapter plans may not target the same file because naïvely concatenating their text edits could overlap or reverse source-order assumptions. A future syntax-aware merge layer may combine compatible operations into one deterministic file plan.

Verification steps emitted by individual adapters are deduplicated by kind, working directory, and command. A required version wins over an optional duplicate. The resulting shared sequence runs once after every staged file has been committed.

## Filesystem staging

`FileSystemSourceRepository` implements a transaction staging interface:

1. every target is read and checked against its expected version;
2. every final file body is written to a temporary sibling file;
3. only after all temporary files exist does commit begin;
4. each target is checked again immediately before replacement;
5. remaining temporary files are removed after success or rollback.

This avoids generating later file contents after earlier files have already changed.

## Rollback

If a staged commit fails after earlier files were committed, Afrodite restores committed files in reverse order through compare-and-swap writes.

If required formatter, typecheck, test, build, or custom verification fails, every committed file is restored. Results use the same status family as single-file writes:

- `applied` — all files committed and required verification passed;
- `rejected` — no complete commit was accepted;
- `rolled-back` — one or more files were committed and every committed file was restored;
- `rollback-failed` — at least one committed file could not be restored and requires immediate inspection.

Rollback is intentionally compare-and-swap protected. It will not overwrite a file that changed independently after Afrodite committed it.

## Atomicity boundary

The transaction is logically all-or-rollback while the project bridge process remains alive. It is not a kernel-level atomic rename of several unrelated paths.

A machine or process crash between individual file replacements can leave a partial commit. Crash recovery manifests and startup reconciliation are outside VS-013. They should be added before treating the bridge as a durable unattended migration service.

## Project bridge routes

```text
POST /api/transaction/plan
POST /api/transaction/apply
```

`/api/transaction/plan` accepts two to thirty-two semantic operations and returns one exact diff per target plus the shared verification plan.

`/api/transaction/apply` accepts only the transaction ID, the complete reviewed path/version set, and an optional approver label. The server retrieves the previously stored transaction plan; clients cannot alter its edits.

## Studio

The **Transactions** workbench provides:

- authenticated local bridge connection;
- protocol-validated semantic operation JSON;
- exact transaction identity;
- one unified diff and diagnostics section per file;
- shared verification review;
- one approval checkbox covering every listed source version;
- per-file before, after, and restored versions;
- explicit applied, rejected, rolled-back, or rollback-failed results.

## Current limits

- targets must already exist;
- one deterministic source plan per file;
- only layout and style semantic operations are accepted by the transaction route;
- file creation, deletion, import insertion, component extraction, and syntax-aware same-file plan merging remain future work;
- crash recovery is not implemented;
- transaction plans expire with the existing project-bridge plan TTL.
