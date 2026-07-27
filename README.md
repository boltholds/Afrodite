# Afrodite

Afrodite is a Git-native visual frontend IDE that keeps semantic UI structure and production code synchronized through minimal, reviewable, and verified changes.

## Current capabilities

Afrodite can:

1. render and edit a framework-neutral `UiDocument`;
2. statically index SolidJS and React components without executing project modules;
3. compose trusted components through an isolated preview host;
4. preserve framework-qualified source bindings;
5. create and repair stable JSX bindings through exact reviewed patches;
6. record reversible visual commands and source provenance;
7. declare which layout properties Afrodite owns and how they are represented in source;
8. patch React and SolidJS inline styles safely;
9. patch static Tailwind classes, flat CSS Module rules, and existing design tokens;
10. show exact unified diffs, require approval, verify writes, and roll back failures;
11. import one bounded existing React or SolidJS screen into Semantic UI IR without executing it;
12. preserve unsupported behavior as source-backed read-only regions.

## Architecture

Shared editor code remains framework-neutral.

- `@afrodite/ui-ir` defines semantic layout, source bindings, style ownership, and source-backed regions.
- `@afrodite/framework-core` defines framework adapters, source operations, deterministic patch plans, diagnostics, and verification steps.
- `@afrodite/binding-core` discovers source targets and plans stable-marker installation.
- `@afrodite/style-core` maps semantic layout to inline styles, Tailwind utilities, CSS Modules, or design tokens.
- `@afrodite/import-core` reconstructs bounded existing screens through syntax-specific import adapters.
- `@afrodite/verified-write` provides approval, compare-and-swap filesystem writes, verification, and rollback.
- `@afrodite/project-session` keeps Canvas and Source Sync inside one command history and provenance timeline.

React and SolidJS use separate adapter identities. They currently share static JSX binding and screen-import implementations, while keeping framework-specific runtime and source-style behavior behind adapters.

## Safe source synchronization

```text
visual or semantic operation
  -> explicit source binding and ownership
  -> framework or style strategy adapter
  -> deterministic SourcePatchPlan
  -> exact unified diff
  -> approval bound to planId + sourceVersion
  -> compare-and-swap write
  -> formatter/typecheck/test/build verification
  -> applied result or rollback
```

Afrodite does not accept browser-authored text edits or verification commands. The local project bridge owns source reads, offsets, patch storage, filesystem access, and process execution.

## Visual Source Binding Manager

The Canvas Inspector can bind a UI IR node to an existing JSX element without silently selecting a production-code target.

```text
explicit adapter + repository path
  -> static JSX candidate discovery
  -> line, column, snippet, marker state, diagnostics
  -> explicit target selection
  -> reviewed data-afrodite-id patch
  -> verified write
  -> reversible SourceBinding command
```

See `docs/source-binding-manager.md`.

## Style ownership

A source binding may declare one strategy and the exact semantic layout properties Afrodite may control:

```json
{
  "strategy": "utility",
  "dialect": "tailwind",
  "attribute": "className",
  "managedProperties": ["display", "direction", "gap", "width"]
}
```

Properties outside `managedProperties` remain handwritten. Dynamic or ambiguous owned regions are rejected rather than overwritten.

Current strategies:

- React and SolidJS static inline style objects;
- static Tailwind `className` or `class` strings;
- one explicit flat CSS Module rule;
- existing unique CSS custom-property tokens.

See `docs/style-ownership.md` and `docs/style-ownership-examples.md`.

## Existing screen import

The **Screen import** workbench reconstructs one explicitly selected exported TSX/JSX component from one source file.

```text
adapter + repository path + export
  -> current source snapshot
  -> static TypeScript JSX analysis
  -> Semantic UI IR tree
  -> editable / requires-binding / read-only classification
  -> explicit open or JSON download
```

The importer never imports the target module, starts Vite, calls hooks, evaluates conditions, fetches data, or runs package scripts.

Recovered data includes:

- native JSX elements and component references;
- nested hierarchy;
- serializable static props;
- static stable markers;
- basic inline and static Tailwind layout;
- source version, file, export, offsets, line, and column.

Unsupported behavior remains visible as `source-region` nodes. Conditional rendering, iteration, calls, fragments, text, dynamic expressions, multiple return paths, and React `"use server"` modules retain exact snapshot provenance and an explicit read-only reason. The Canvas command engine rejects mutations against read-only regions independently of Inspector state.

See `docs/existing-screen-import.md`.

## Live project session

Canvas and Source Sync share one active session:

```text
UiDocument + command history
  -> exact layout transitions
  -> source snapshots and patch plans
  -> reviewed diffs
  -> verified writes or rollback
```

Undo and redo preserve provenance. New visual changes invalidate stale plans. Successful writes advance only the synchronized node.

See `docs/live-project-session.md`.

## Workspace

- `apps/studio` — Canvas, Source Sync, Binding Manager, Style Ownership, and Screen Import.
- `apps/preview-host` — opaque-origin trusted SolidJS and React component preview.
- `apps/project-bridge` — authenticated localhost source, import, planning, verified-write, and rollback service.
- `packages/ui-ir` — Semantic UI IR and provenance contracts.
- `packages/canvas-engine` — reversible document commands and read-only enforcement.
- `packages/project-session` — live session state and transition provenance.
- `packages/framework-core` — framework and patch-plan contracts.
- `packages/binding-core` — target discovery and stable-marker plans.
- `packages/style-core` — style ownership strategies.
- `packages/import-core` — bounded screen-import adapters.
- `packages/verified-write` — approval, compare-and-swap, verification, and rollback.
- `packages/adapter-solid` — SolidJS framework, binding, and screen-import adapter factories.
- `packages/adapter-react` — React framework, binding, and screen-import adapter factories.
- `packages/project-indexer` — static SolidJS component catalog.
- `packages/indexer-react` — static React component catalog.
- `packages/protocol` — catalog, preview, bridge, binding, style, and import schemas.

## Development

```bash
corepack enable
pnpm install
pnpm dev
```

`pnpm dev` starts Studio on `4173` and the preview host on `4174`.

Start a local bridge in another terminal:

```bash
pnpm dev:bridge --project ./path/to/project
```

The bridge listens on `127.0.0.1:4175` by default and prints a generated session token. Paste it into Source Sync, Binding Manager, Style Ownership, or Screen Import.

Verification:

```bash
pnpm typecheck
pnpm test
pnpm build
```

The next slice expands bounded import into an explicit multi-file component graph with cycle detection, import budgets, and per-file provenance.
