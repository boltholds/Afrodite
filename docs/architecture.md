# Architecture

## High-level flow

```text
Git repository
    -> project indexer
    -> component and token catalog
    -> Afrodite Studio
    -> Semantic UI IR
    -> framework adapter / AST patcher
    -> reviewable source diff
    -> preview host and visual verification
```

## Planned packages

### `@afrodite/ui-ir`

Framework-neutral document model. It owns stable node identifiers, component references, props, layout constraints, responsive overrides, and schema versioning.

### `@afrodite/project-indexer`

Discovers components, public props, design tokens, exports, stories, and safe insertion points in a target repository.

### `@afrodite/code-adapters`

Framework-specific readers and writers. The first adapter will target SolidJS and operate on TypeScript/JSX syntax trees.

### `@afrodite/canvas-engine`

Selection, drag, resize, snapping, hierarchy editing, layout constraints, and command history.

### `@afrodite/protocol`

Typed messages between Studio, preview host, indexer, and code adapters.

## Write boundary

Afrodite must not rewrite arbitrary source files from templates. A code update follows this pipeline:

1. read the current syntax tree;
2. locate nodes through stable bindings and structural checks;
3. calculate a minimal patch;
4. verify formatting and type safety;
5. show the diff;
6. apply only after explicit approval.

## Semantic UI IR invariants

- every node has a stable ID;
- a node is either an intrinsic element or a component reference;
- children are ordered explicitly;
- layout is represented separately from visual styling;
- source bindings are optional and never treated as trusted without verification;
- schema versions are explicit and migrations are deterministic.

## Security boundary

Imported projects and preview code must run in an isolated process or sandbox. Indexing should begin as static analysis; executing project code requires explicit trust.
