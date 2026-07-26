# Live project session

`@afrodite/project-session` is the framework-neutral state boundary shared by Canvas and Source Sync.

## Session-owned state

A live session owns:

```text
UiDocument and command history
selected node and active workspace
monotonic session revision
layout command metadata
layout transition audit
per-node synchronization cursors
per-node source snapshots
per-node patch-plan views
per-node verified-write results
```

Studio no longer serializes a document into browser storage merely to transfer it from Canvas to Source Sync. Browser storage remains an explicit persistence action, while both workspaces read the same in-memory session.

## Exact layout transitions

When Canvas creates a layout command, the session records:

```text
command ID
node ID
phase: execute | undo | redo
exact before Layout
exact after Layout
source binding at command time
session revision
timestamp
```

Undo and redo append new transitions rather than deleting provenance. The command history controls the current UI document; the transition log explains how that state was reached.

## Pending source operation

Each source-bound node has a synchronization cursor. Transitions after that cursor are unsynchronized.

The session aggregates them as:

```text
before = first unsynchronized transition.before
after  = last unsynchronized transition.after
binding = latest available binding
```

This allows several visual adjustments to become one reviewed source patch while retaining the individual transition audit.

A successful verified write advances only that node's cursor. Other nodes keep their pending operations.

## Invalidation rules

A pending plan is invalidated when:

- another visual layout command affects the same node;
- undo or redo affects the same node;
- a refreshed source snapshot has a different version from the reviewed plan;
- the UI document is replaced wholesale.

Approval still belongs to the project bridge and remains bound to the exact `planId` and `sourceVersion`.

## Framework boundary

The session stores framework IDs and source bindings as data, but contains no SolidJS or React syntax logic. Source planning remains inside framework adapters. Filesystem mutation, verification, and rollback remain inside the local project bridge and `@afrodite/verified-write`.

## Current limits

VS-008 consumes existing source bindings. Creating, repairing, and validating bindings is the responsibility of VS-009. The session model already invalidates plans when future binding commands change a target.
