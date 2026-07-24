# Architecture

## High-level flow

```text
Git repository
    -> project indexer
    -> component and token catalog
    -> Afrodite Studio
    -> Semantic UI IR
    -> isolated preview host
    -> framework adapter / AST patcher
    -> reviewable source diff
```

## Workspace packages

### `@afrodite/ui-ir`

Framework-neutral document model. It owns stable node identifiers, component references, props, layout constraints, schema versioning, JSON serialization, and structured validation diagnostics.

### `@afrodite/canvas-engine`

Owns reversible document commands and in-memory command history. Studio does not mutate `UiDocument` objects directly. Layout changes, document replacement, and component insertion are represented by commands with `apply` and `revert`. New commands clear the redo branch.

### `@afrodite/project-indexer`

Builds a deterministic catalog from a SolidJS or TypeScript workspace through the TypeScript compiler API. It resolves exported symbols and barrel aliases, identifies PascalCase JSX components, extracts typed props and source locations, classifies JSON-safe values, and emits structured diagnostics for unsupported types.

The indexer never imports target modules or executes application code. Its output is a JSON boundary that Studio consumes without sharing TypeScript compiler objects.

### `@afrodite/protocol`

Owns validated data exchanged across package and iframe boundaries:

- component catalog schema and decoding diagnostics;
- preview render requests;
- preview readiness and render-result messages;
- structured runtime-preview diagnostics.

Studio and the preview host reject messages that do not match the protocol schema.

### `@afrodite/code-adapters` — planned

Framework-specific readers and writers. The first adapter will target SolidJS and operate on TypeScript/JSX syntax trees.

## Applications

### `apps/studio`

The visual editor. It loads component catalogs, creates UI IR component nodes, owns command history, edits layout constraints, and sends validated render requests to the preview host.

### `apps/preview-host`

A separate Vite application embedded in Studio as an iframe. The iframe currently uses `sandbox="allow-scripts"` without `allow-same-origin`, giving it an opaque origin. It accepts only validated protocol messages and resolves component bindings through a static trusted registry.

The host does not perform arbitrary dynamic imports from `sourceBinding.repositoryPath`. A path in UI IR is descriptive metadata until a trusted registry build explicitly maps it to executable code.

## Editor mutation boundary

```text
Inspector or component-library interaction
    -> create DocumentCommand
    -> execute through CommandHistoryState
    -> produce a new immutable UiDocument
    -> validate and render
```

Undo calls `revert` on the last executed command. Redo calls `apply` on the first command in the future branch. Importing a document and inserting an indexed component use the same history boundary as layout editing.

Selection remains transient Studio state. Document structure, component bindings, props, and layout remain persistent UI IR state.

## Project indexing boundary

```text
tsconfig.json
    -> TypeScript Program
    -> module export symbols
    -> component declarations
    -> prop types
    -> serializability classifier
    -> ComponentCatalog JSON
    -> protocol validation
```

Compiler objects remain inside `@afrodite/project-indexer`. The catalog contains stable strings, source coordinates, prop metadata, JSON-safe defaults, and diagnostics.

## Runtime preview boundary

```text
UiDocument root
    -> PreviewRenderRequest
    -> sandboxed iframe
    -> trusted component registry lookup
    -> SolidJS render
    -> PreviewRenderResult
```

The preview host can execute component code and is therefore a different trust level from static indexing. The current vertical slice registers only repository fixtures at build time. A future arbitrary-project workflow must:

1. show the project and dependency set to the user;
2. require explicit approval before executing build tooling;
3. create a dedicated preview bundle in an isolated worker, process, or container;
4. apply CPU, memory, filesystem, network, and time limits;
5. expose only a generated registry manifest to Studio.

Missing registry entries and render exceptions are returned as structured diagnostics rather than silently replaced.

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
- source bindings are optional and never treated as executable imports without registry verification;
- schema versions are explicit and migrations are deterministic.
