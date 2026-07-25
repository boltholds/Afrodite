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
    -> framework adapter planPatch
    -> SourcePatchPlan
    -> preview and explicit approval
    -> verified compare-and-swap write
    -> verification or rollback
```

SolidJS is the first complete indexing, preview, and source-patching target. React is an independent adapter identity and will reuse the same UI IR, command history, catalog, preview protocol, patch plan, approval, write, and rollback layers.

## Workspace packages

### `@afrodite/ui-ir`

Framework-neutral document model. It owns stable node IDs, component references, JSON-safe props, layout constraints, schema versioning, serialization, diagnostics, and optional source bindings.

A source binding may contain:

```text
frameworkId
adapterId
componentId
repositoryPath
exportName
stableMarker
```

These fields describe identity. They do not authorize imports or writes by themselves.

### `@afrodite/canvas-engine`

Owns immutable document commands and undo/redo history. Layout changes, document replacement, and component insertion all cross the same reversible mutation boundary.

### `@afrodite/framework-core`

Owns framework-neutral extension and patch-planning contracts:

- framework descriptors and capability flags;
- project detection and adapter registration;
- `FrameworkOperation`;
- immutable source snapshots and deterministic source versions;
- text edits and `SourcePatchPlan`;
- edit-range, overlap, path, and stale-version validation;
- deterministic patch previews;
- adapter diagnostics and verification declarations.

The shared package does not know SolidJS signals, React hooks, Vue SFCs, or Svelte compilation rules.

### `@afrodite/verified-write`

Owns privileged source mutation:

- approvals bound to `planId` and `sourceVersion`;
- repository-relative filesystem access;
- project-root traversal protection;
- compare-and-swap writes;
- formatter, typecheck, test, build, and custom command execution;
- automatic rollback after failed required verification;
- explicit applied, rejected, rolled-back, and rollback-failed results.

Framework adapters cannot write files directly.

### `@afrodite/adapter-solid`

Declares the SolidJS identity and currently supports detection, indexing, runtime preview, prop editing, and source patch planning.

Its first patch operation updates layout on a uniquely marked JSX element:

```tsx
<section data-afrodite-id="card.primary" style={{ color: "red" }} />
```

The adapter changes only Afrodite-managed properties inside a static style object. Handwritten handlers, children, expressions, attributes, spreads, and unmanaged style properties are preserved. Dynamic style expressions and ambiguous bindings produce blocking diagnostics.

### `@afrodite/adapter-react`

Declares React as an independent expansion target. Detection is implemented. Indexing, preview, prop editing, and patch planning remain capability-gated until their slices are delivered.

### `@afrodite/project-indexer`

The current implementation performs static SolidJS/TypeScript analysis. Compiler objects remain inside the indexer; only deterministic catalog data crosses into Studio.

### `@afrodite/protocol`

Owns validated data exchanged between packages and iframe processes:

- component catalogs and framework descriptors;
- component-level framework identities;
- preview render requests and runtime availability;
- structured indexing and preview diagnostics.

## Applications

### `apps/studio`

Loads catalogs, builds UI IR, owns editor history, edits layout constraints, resolves framework capabilities, and sends validated preview requests. Studio must not invoke a SolidJS operation for a React binding.

### `apps/preview-host`

Runs separately inside an iframe with `sandbox="allow-scripts"` and no same-origin permission. It renders only components in trusted framework-qualified registries. Missing runtimes return `FRAMEWORK_NOT_SUPPORTED`.

## Static indexing boundary

```text
project manifest and config
    -> FrameworkAdapterRegistry.detect
    -> framework-specific compiler analysis
    -> ComponentCatalog JSON
    -> protocol validation
```

Static indexing never imports the target project or executes its scripts.

## Runtime preview boundary

```text
UiDocument subtree
    -> required framework IDs
    -> PreviewRenderRequest
    -> sandboxed iframe
    -> runtime registry
    -> trusted component registry
    -> PreviewRenderResult
```

Executing arbitrary project components requires a separately approved and resource-limited bundle process.

## Verified source-write boundary

```text
UI IR before and after
    -> FrameworkOperation
    -> resolve adapter from SourceBinding
    -> adapter.planPatch(operation, SourceSnapshot)
    -> SourcePatchPlan
    -> validate source version and edits
    -> show before/after preview
    -> explicit approval
    -> compare-and-swap write
    -> run adapter verification steps
    -> keep write or restore original source
```

Every patch plan has `requiresApproval: true`. Approval becomes invalid when the plan or source changes. A required verification failure triggers rollback using the version produced by the write, preventing rollback from overwriting a later concurrent edit.

## Semantic UI IR invariants

- every node has a unique stable ID;
- component and intrinsic nodes are distinguished explicitly;
- children are ordered;
- layout is separate from visual styling;
- source bindings are untrusted metadata until adapter resolution and source verification;
- framework IDs are stable lowercase identifiers;
- schema migrations are deterministic.
