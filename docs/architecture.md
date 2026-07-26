# Architecture

## High-level flow

```text
Git repository
    -> framework detection
    -> framework-specific static indexer
    -> framework-neutral component catalog
    -> Afrodite Studio Canvas
    -> Semantic UI IR
    -> isolated preview host with runtime adapters
    -> saved source-bound UI document
    -> Studio Source Sync
    -> authenticated local project bridge
    -> current SourceSnapshot
    -> framework adapter planPatch
    -> SourcePatchPlan
    -> unified diff and explicit exact-plan approval
    -> verified compare-and-swap write
    -> verification or rollback
```

SolidJS and React both cover detection, static indexing, runtime preview, serializable prop editing, and source patch planning. They share UI IR, command history, catalog transport, preview messages, project-bridge transport, patch plans, diff review, approval, filesystem mutation, verification, and rollback. Framework differences remain inside indexers, runtime adapters, and syntax planners.

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

When a catalog component uses a framework-qualified stable marker such as `react:src/Card.tsx#Card`, insertion preserves the framework and component identity in UI IR without adding React-specific branches to Studio.

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
- explicit `applied`, `rejected`, `rolled-back`, and `rollback-failed` results.

Framework adapters cannot write files directly.

### `@afrodite/adapter-solid`

Declares the SolidJS identity and supports detection, indexing, runtime preview, prop editing, and source patch planning.

Its first patch operation updates layout on a uniquely marked JSX element:

```tsx
<section data-afrodite-id="card.primary" style={{ color: "red" }} />
```

The adapter emits Solid-compatible CSS property names and changes only Afrodite-managed properties inside a static style object. Handwritten handlers, children, expressions, attributes, spreads, and unmanaged style properties are preserved. Dynamic style expressions and ambiguous bindings produce blocking diagnostics.

### `@afrodite/adapter-react`

Declares the React identity and supports detection, indexing, runtime preview, prop editing, and source patch planning.

The React planner consumes the same `FrameworkOperation` as SolidJS and returns the same `SourcePatchPlan`. It binds through `data-afrodite-id`, emits React style casing such as `flexDirection`, and limits edits to a static inline style object.

The planner preserves hooks, callbacks, children, `className`, ARIA attributes, and unmanaged expressions. It blocks runtime-dependent ownership including style variables, dynamic managed keys, spreads, computed keys, duplicate managed keys, duplicate style attributes, duplicate markers, and modules marked with `"use server"`.

### `@afrodite/project-indexer`

Performs static SolidJS/TypeScript analysis. Compiler objects remain inside the indexer; only deterministic catalog data crosses into Studio.

### `@afrodite/indexer-react`

Performs static React TypeScript/TSX analysis using the same catalog protocol. It discovers exported PascalCase components, resolves barrel exports, extracts JSON-safe props and defaults, and does not import or execute project modules.

It emits explicit diagnostics for async components, server-only files, context dependencies, callbacks, React nodes, DOM events, and other runtime-only props.

### `@afrodite/protocol`

Owns validated data exchanged between packages, browser workspaces, iframe processes, and the local bridge:

- component catalogs and framework descriptors;
- component-level framework identities;
- preview render requests and runtime availability;
- source-read requests and versioned snapshots;
- framework-neutral patch operations;
- patch-plan views, unified diff metadata, and diagnostics;
- exact approval requests;
- verification executions and final write outcomes.

The protocol does not grant authority. The bridge independently resolves adapters, reads the current source, stores plans, and performs all privileged checks.

## Applications

### `apps/studio`

Studio contains two product workspaces.

`Canvas` loads mixed-framework catalogs, builds UI IR, owns editor history, edits layout constraints, and sends validated preview requests.

`Source Sync` loads source-bound nodes from the saved UI document, connects to the local bridge, reads current source snapshots, edits or confirms the target layout operation, shows the exact unified diff, requires an explicit review checkbox, submits only the plan ID and source version, and displays verification or rollback output.

The current Canvas-to-Source-Sync handoff uses browser storage. A later slice should replace that handoff with shared live Studio session state.

### `apps/preview-host`

Runs separately inside an iframe with `sandbox="allow-scripts"` and no same-origin permission. It renders only components in trusted framework-qualified registries.

```text
solid -> Solid Dynamic component renderer
react -> react-dom/client root renderer
```

Shared traversal and diagnostics resolve the runtime by `frameworkId`. Missing runtimes return `FRAMEWORK_NOT_SUPPORTED`; missing trusted entries return `COMPONENT_NOT_REGISTERED`.

### `apps/project-bridge`

The bridge is a local Node service and the only application with filesystem and process authority.

It is configured with one immutable project root and registers the SolidJS and React adapters. Its API exposes health, source reads, patch planning, and patch application. It never accepts client-authored text edits or verification commands.

Security and consistency properties:

- bind to `127.0.0.1` by default;
- bearer session token on every non-preflight request;
- Studio origin allowlist;
- request-body size limit;
- fixed project root with traversal protection;
- adapter capability checks;
- in-memory server-side plan storage with expiration;
- exact `planId` and `sourceVersion` approval binding;
- compare-and-swap before write and rollback;
- adapter-declared verification only.

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
    -> runtime-adapter registry
    -> framework-qualified trusted component registry
    -> PreviewRenderResult
```

Executing arbitrary project components requires a separately approved and resource-limited bundle process. The current SolidJS and React fixtures are compiled into the preview host at build time and do not authorize arbitrary paths from UI IR.

## Verified source synchronization boundary

```text
source-bound UI IR node
    -> BridgeOperation
    -> authenticated bridge request
    -> read current SourceSnapshot
    -> resolve adapter from SourceBinding
    -> adapter.planPatch(operation, snapshot)
    -> validate SourcePatchPlan
    -> create unified diff
    -> store approvable plan server-side
    -> user reviews exact plan ID and source version
    -> apply request contains no edits
    -> re-read source and compare version
    -> compare-and-swap write
    -> run adapter verification steps
    -> keep source or compare-and-swap rollback
```

Every patch plan has `requiresApproval: true`. Approval becomes invalid when the plan expires, the bridge restarts, or the source changes. SolidJS and React planners stop at `SourcePatchPlan`; neither receives filesystem access, approval state, network authority, or command-execution authority.

## Semantic UI IR invariants

- every node has a unique stable ID;
- component and intrinsic nodes are distinguished explicitly;
- children are ordered;
- layout is separate from visual styling;
- source bindings are untrusted metadata until adapter resolution and source verification;
- framework IDs are stable lowercase identifiers;
- framework-specific runtime behavior stays behind runtime adapter registries;
- framework-specific syntax behavior stays behind patch planners;
- privileged source mutation stays behind the local project bridge;
- schema migrations are deterministic.
