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

## Workspace packages

### `@afrodite/ui-ir`

Framework-neutral document model. It owns stable node identifiers, component references, props, layout constraints, schema versioning, JSON serialization, and structured validation diagnostics.

### `@afrodite/canvas-engine`

Owns reversible document commands and in-memory command history. Studio does not mutate `UiDocument` objects directly. A layout change is created as a command with `apply` and `revert`, then executed through the history state. New commands clear the redo branch.

### `@afrodite/project-indexer`

Builds a deterministic catalog from a SolidJS or TypeScript workspace through the TypeScript compiler API. It resolves exported symbols and barrel aliases, identifies PascalCase JSX components, extracts typed props and source locations, classifies JSON-safe values, and emits structured diagnostics for unsupported types.

The indexer never imports target modules or executes application code. Its output is a JSON boundary that Studio and later protocol packages can consume without sharing TypeScript compiler objects.

### `@afrodite/code-adapters` — planned

Framework-specific readers and writers. The first adapter will target SolidJS and operate on TypeScript/JSX syntax trees.

### `@afrodite/protocol` — planned

Typed messages between Studio, preview host, indexer, and code adapters.

## Editor mutation boundary

```text
Inspector interaction
    -> create DocumentCommand
    -> execute through CommandHistoryState
    -> produce a new immutable UiDocument
    -> validate and render
```

Undo calls `revert` on the last executed command. Redo calls `apply` on the first command in the future branch. Importing or resetting a complete document is also represented as a reversible command.

Selection remains transient Studio state. Document structure and layout remain persistent UI IR state. This separation prevents viewport focus changes from polluting command history.

## Project indexing boundary

```text
tsconfig.json
    -> TypeScript Program
    -> module export symbols
    -> component declarations
    -> prop types
    -> serializability classifier
    -> ComponentCatalog JSON
```

Compiler objects remain inside `@afrodite/project-indexer`. The catalog contains only stable strings, source coordinates, prop metadata, JSON-safe defaults, and diagnostics. This prevents Studio from depending directly on the TypeScript compiler and gives future indexer implementations a stable interchange format.

## Persistence boundary

The serialized `.afrodite.json` document is the portable representation of the canvas state. Decoding follows three explicit stages:

1. JSON syntax validation;
2. UI IR schema validation;
3. semantic invariant validation, including duplicate stable node IDs.

Failures return structured diagnostics with a code, path, severity, and message. Studio can persist a validated document in browser storage or download it as a file.

## Source-code write boundary

Afrodite must not rewrite arbitrary source files from templates. A code update follows this pipeline:

1. read the current syntax tree;
2. locate nodes through stable bindings and structural checks;
3. calculate a minimal patch;
4. verify formatting and type safety;
5. show the diff;
6. apply only after explicit approval.

## Semantic UI IR invariants

- every node has a stable ID;
- stable node IDs are unique within a document;
- a node is either an intrinsic element or a component reference;
- children are ordered explicitly;
- layout is represented separately from visual styling;
- source bindings are optional and never treated as trusted without verification;
- schema versions are explicit and migrations are deterministic.

## Security boundary

Imported projects and preview code must run in an isolated process or sandbox. Indexing begins as static analysis and does not execute target-project modules, scripts, Vite plugins, or application configuration. Rendering real project components requires a separate explicit trust boundary in VS-003.
