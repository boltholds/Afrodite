# Afrodite

Afrodite is a code-aware visual UI editor that keeps visual design, semantic structure, and production code synchronized.

## Current capabilities

The semantic canvas can:

1. render and edit a framework-neutral `UiDocument`;
2. select nodes through the hierarchy or canvas;
3. edit flex/grid display, direction, spacing, padding, and sizing constraints;
4. insert indexed component nodes through reversible commands;
5. create and repair framework-qualified source bindings through reviewed JSX candidates;
6. declare exactly which style properties Afrodite owns and how they are represented in source;
7. undo and redo document, layout, binding, and ownership mutations;
8. validate, import, save, and download Semantic UI IR JSON;
9. record exact visual layout transitions for source synchronization.

Static indexers support SolidJS and React through separate packages. Both use the TypeScript compiler API, resolve exports without executing project modules, extract typed serializable props and defaults, and emit the same framework-neutral component catalog.

The preview host renders trusted SolidJS and React components through an opaque-origin iframe. Runtime selection is framework-qualified and missing or unsupported components produce structured diagnostics.

## Framework, binding, and style adapters

Shared editor code is framework-neutral.

- `@afrodite/framework-core` defines descriptors, capabilities, detection, operations, source snapshots, deterministic patch plans, edit validation, and previews.
- `@afrodite/binding-core` defines source-binding discovery, candidate identity, marker planning, and a binding-adapter registry.
- `@afrodite/style-core` defines explicit style ownership, strategy resolution, style source targets, and deterministic `update-style` plans.
- `@afrodite/adapter-solid` supports detection, indexing, preview, prop editing, layout patching, and JSX binding discovery.
- `@afrodite/adapter-react` supports detection, static indexing, isolated runtime preview, serializable prop editing, layout patching, and JSX binding discovery.
- UI IR, catalogs, preview messages, command history, live sessions, diff review, approval, verified writes, and rollback use stable shared contracts.

Framework adapters describe syntax and runtime behavior. Style strategies decide whether semantic layout is represented as inline styles, CSS Module declarations, Tailwind utility classes, or design-token values.

## Visual Source Binding Manager

The Canvas Inspector can bind an unbound UI IR node to an existing JSX element without silently guessing a production-code target.

```text
explicit framework adapter + repository path
  -> static JSX candidate discovery
  -> line, column, snippet, marker state, and diagnostics
  -> explicit candidate selection
  -> reviewed install-stable-marker diff
  -> compare-and-swap write and verification
  -> reversible SourceBinding command in the live session
```

The browser never submits text edits. The local bridge creates and stores the marker patch plan. A matching existing marker can be confirmed without an empty write. Stale source versions, duplicate markers, dynamic marker ownership, unsupported files, and React `use server` modules are rejected.

See `docs/source-binding-manager.md`.

## Style ownership

Each bound node may store a `SourceBinding.styleOwnership` contract. The contract selects one strategy and lists only the layout properties that Afrodite may modify:

```json
{
  "strategy": "utility",
  "dialect": "tailwind",
  "attribute": "className",
  "managedProperties": ["display", "direction", "gap", "width"]
}
```

Current strategies:

- React and SolidJS static inline style objects;
- static Tailwind `className` or `class` strings;
- one explicit flat CSS Module class rule;
- existing unique CSS custom-property design tokens.

Unmanaged declarations and utility classes remain handwritten. Dynamic values inside an owned region, spreads, computed keys, duplicate declarations, ambiguous markers, nested CSS, conditional class expressions, missing token declarations, and React `use server` modules are treated as blocking diagnostics.

```text
semantic layout transition
  -> explicit property ownership
  -> style strategy registry
  -> strategy-specific source target
  -> update-style SourcePatchPlan
  -> exact unified diff
  -> approval + compare-and-swap
  -> typecheck/build verification
  -> applied result or rollback
```

Studio exposes this through the Style Ownership Workbench. The workbench validates the resulting source binding, previews the exact target file, and uses the same authenticated project bridge and verified-write boundary as Source Sync.

See `docs/style-ownership.md` and `docs/style-ownership-examples.md`.

## Live project session

Canvas and Source Sync run inside one live Studio session.

```text
UiDocument + command history
  -> exact layout transitions
  -> per-node pending source operations
  -> source snapshots and patch plans
  -> exact diff approval
  -> verified write or rollback
```

`@afrodite/project-session` owns the current document, selection, workspace, revision, command metadata, transition audit, synchronization cursors, source snapshots, patch plans, and write results.

Switching between Canvas and Source Sync no longer serializes the document through browser storage. Undo/redo history and node selection remain active. Browser storage is still available as an explicit save/load action.

Every visual layout command records exact before and after layouts. Undo and redo append their own transitions. Several visual edits can be aggregated into one reviewed source operation. A successful verified write advances only the applied node's synchronization cursor.

A new edit to the same node invalidates its reviewed plan. Refreshing a source snapshot with a different version also invalidates the stale plan.

See `docs/live-project-session.md`.

## Source Sync and verified writes

Source Sync connects the live session to a local project bridge, reads the current source snapshot, requests an adapter patch plan, shows the exact unified diff, requires explicit confirmation of the plan ID and source version, and displays verification or rollback results.

```text
recorded visual transition
  -> local project bridge
  -> current source snapshot
  -> adapter or style strategy plan
  -> unified diff
  -> explicit exact-plan approval
  -> compare-and-swap write
  -> formatter/typecheck/test/build verification
  -> applied or rollback result
```

The browser never receives filesystem or process access. The bridge is fixed to one project root, binds to localhost by default, requires a bearer session token, validates Studio origins, stores plans server-side, rejects path traversal and stale sources, and does not accept client-authored edits or verification commands.

See `docs/project-bridge.md`, `docs/framework-adapters.md`, `docs/react-indexing.md`, `docs/react-source-patching.md`, and `docs/verified-write.md`.

## Workspace

- `apps/studio` — unified Canvas and Source Sync live session, Visual Binding Manager, Style Ownership Workbench, component library, transition audit, diff review, and approval UI.
- `apps/preview-host` — isolated SolidJS and React runtime component renderer.
- `apps/project-bridge` — authenticated local source snapshot, binding discovery, layout/style patch planning, verified-write, verification, and rollback service.
- `packages/ui-ir` — framework-neutral Semantic UI IR, source bindings, and style ownership contracts.
- `packages/canvas-engine` — immutable document, layout, insertion, binding, and ownership commands with undo/redo history.
- `packages/project-session` — live Studio state, exact transition provenance, per-node source state, and synchronization cursors.
- `packages/framework-core` — adapter, operation, source snapshot, and patch-plan contracts.
- `packages/binding-core` — framework-neutral binding candidates, static JSX discovery, and stable-marker plans.
- `packages/style-core` — inline, CSS Module, Tailwind, and design-token ownership strategies.
- `packages/verified-write` — approval, filesystem compare-and-swap, verification, and rollback.
- `packages/adapter-solid` — SolidJS identity, detection, layout patching, and source binding adapter.
- `packages/adapter-react` — React identity, detection, layout patching, and source binding adapter.
- `packages/project-indexer` — static SolidJS component and prop discovery.
- `packages/indexer-react` — static React component and prop discovery.
- `packages/protocol` — catalog, preview, project-bridge, binding, and style schemas.

## Development

```bash
corepack enable
pnpm install
pnpm dev
```

`pnpm dev` starts Studio on `4173` and the preview host on `4174`.

Start a local bridge in a separate terminal with an explicit project root:

```bash
pnpm dev:bridge --project ./path/to/project
```

The bridge listens on `127.0.0.1:4175` by default and prints a generated session token. Paste that token into Source Sync or Style Ownership.

Trusted React fixture example:

```bash
pnpm dev:bridge --project packages/indexer-react/test/fixtures/react-app
```

To test binding, select an unbound Canvas node, choose the React adapter, enter `src/ActionCard.tsx`, discover candidates, choose the `<article>` target, review the marker diff, and approve it. The new binding becomes part of the same undo/redo history as visual edits.

To test ownership, open `Style ownership` in Studio, choose a strategy, select managed properties, enter the explicit source targets, request a plan, review the exact diff, and approve it.

Verification:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Build and run the indexers:

```bash
pnpm --filter @afrodite/project-indexer build
node packages/project-indexer/dist/cli.js ./path/to/solid-project \
  --out ./solid-component-catalog.json

pnpm --filter @afrodite/indexer-react build
node packages/indexer-react/dist/cli.js ./path/to/react-project \
  --out ./react-component-catalog.json
```

The next slice imports a bounded existing screen into Semantic UI IR while preserving unsupported behavior as source-backed read-only regions.
