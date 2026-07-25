# Architecture

## High-level flow

```text
Git repository
    -> framework detection
    -> framework-specific static indexer
    -> framework-neutral component catalog
    -> Afrodite Studio
    -> Semantic UI IR
    -> isolated preview host with runtime adapters
    -> FrameworkOperation
    -> framework adapter / AST patch planner
    -> reviewable SourcePatchPlan
    -> verified write boundary
```

SolidJS is the first implemented indexing and preview target. React is registered as a separate adapter identity and can gain the same capabilities without changing UI IR, Studio history, protocol transport, diff review, or patch application.

## Workspace packages

### `@afrodite/ui-ir`

Framework-neutral document model. It owns stable node identifiers, component references, props, layout constraints, schema versioning, JSON serialization, and structured validation diagnostics.

`SourceBinding` may identify a framework and adapter:

```text
frameworkId
adapterId
componentId
repositoryPath
exportName
stableMarker
```

The path and identifiers are descriptive metadata. They never authorize dynamic imports or source writes by themselves.

### `@afrodite/canvas-engine`

Owns reversible document commands and in-memory command history. Studio does not mutate `UiDocument` objects directly. Layout changes, document replacement, and component insertion are represented by commands with `apply` and `revert`. New commands clear the redo branch.

### `@afrodite/framework-core`

Owns the framework extension contract:

- `FrameworkDescriptor` and explicit capability flags;
- manifest-based project detection;
- `FrameworkAdapter` and `FrameworkAdapterRegistry`;
- framework-neutral `FrameworkOperation` values;
- immutable `SourceSnapshot` input;
- reviewable `SourcePatchPlan` output;
- text edits, adapter diagnostics, and verification steps.

The shared layer does not know SolidJS JSX semantics, React hooks, Vue SFC syntax, or Svelte compilation rules.

### `@afrodite/adapter-solid`

Declares the SolidJS framework identity, package evidence, source extensions, and current capabilities. Static indexing and preview are available. Source patching is enabled only after the VS-004 planner is implemented and verified.

### `@afrodite/adapter-react`

Declares React as an independent framework target. Detection is implemented. Indexing, runtime preview, prop editing, and source patching remain capability-gated until their adapters are delivered.

### `@afrodite/project-indexer`

The current implementation is the SolidJS static indexer. It builds a deterministic catalog through the TypeScript compiler API, resolves exported symbols and barrel aliases, identifies PascalCase JSX components, extracts typed props and source locations, classifies JSON-safe values, and emits structured diagnostics.

The indexer never imports target modules or executes application code. Future React indexing should be a separate implementation registered under `afrodite.adapter.react`, not a growing set of Solid-vs-React conditionals inside this package.

### `@afrodite/protocol`

Owns validated data exchanged across package and iframe boundaries:

- component catalogs with optional framework descriptors;
- component-level framework and adapter identities;
- preview render requests listing required frameworks;
- preview readiness messages listing available runtimes;
- structured indexing and runtime diagnostics.

Legacy Solid-only catalogs remain readable. New producers should write explicit framework metadata.

## Applications

### `apps/studio`

The visual editor. It loads component catalogs, creates UI IR component nodes, owns command history, edits layout constraints, and sends validated render requests to the preview host.

Studio must use adapter capabilities to decide which actions are available. Missing functionality is reported as a capability diagnostic; Studio must not silently run SolidJS logic against a React component.

### `apps/preview-host`

A separate Vite application embedded in Studio as an iframe. The iframe uses `sandbox="allow-scripts"` without `allow-same-origin`, giving it an opaque origin. It accepts only validated protocol messages and resolves component bindings through trusted runtime registries.

The current host announces one runtime:

```text
solid -> afrodite.adapter.solid
```

A React runtime can be added as a second registry implementation. A render request requiring a framework that is absent returns `FRAMEWORK_NOT_SUPPORTED`.

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
project manifest and config
    -> FrameworkAdapterRegistry.detect(...)
    -> chosen indexing capability
    -> framework-specific compiler analysis
    -> ComponentCatalog JSON
    -> protocol validation
```

Compiler objects remain inside an indexer implementation. The catalog contains stable strings, framework metadata, source coordinates, prop metadata, JSON-safe defaults, capability declarations, and diagnostics.

## Runtime preview boundary

```text
UiDocument root
    -> collect required framework IDs
    -> PreviewRenderRequest
    -> sandboxed iframe
    -> runtime adapter registry
    -> trusted component registry lookup
    -> framework runtime render
    -> PreviewRenderResult
```

The preview host can execute component code and is therefore a different trust level from static indexing. A future arbitrary-project workflow must:

1. show the project, framework adapters, and dependency set to the user;
2. require explicit approval before executing build tooling;
3. create dedicated preview bundles in isolated workers, processes, or containers;
4. apply CPU, memory, filesystem, network, and time limits;
5. expose only generated runtime registry manifests to Studio.

## Persistence boundary

The serialized `.afrodite.json` document is the portable representation of the canvas state. Decoding follows three explicit stages:

1. JSON syntax validation;
2. UI IR schema validation;
3. semantic invariant validation, including duplicate stable node IDs.

Framework metadata is optional for backward compatibility but should be explicit in newly created source bindings.

## Framework-neutral source-code write boundary

Afrodite must not rewrite arbitrary source files from templates. A visual edit follows this pipeline:

```text
UI IR before and after state
    -> FrameworkOperation
    -> resolve adapter from SourceBinding
    -> adapter.planPatch(operation, SourceSnapshot)
    -> SourcePatchPlan
    -> validate edit ranges and source version
    -> show unified diff
    -> explicit approval
    -> apply edits
    -> run required verification steps
```

The common write boundary owns stale-source detection, edit-overlap checks, diff presentation, approval, application, rollback, and command execution. Framework adapters own only syntax-specific discovery and patch planning.

Every `SourcePatchPlan` has `requiresApproval: true`. An adapter cannot bypass review.

## Semantic UI IR invariants

- every node has a stable ID;
- stable node IDs are unique within a document;
- a node is either an intrinsic element or a component reference;
- children are ordered explicitly;
- layout is represented separately from visual styling;
- source bindings are optional and never treated as executable imports without adapter and registry verification;
- framework identities use stable lowercase identifiers;
- schema versions are explicit and migrations are deterministic.
