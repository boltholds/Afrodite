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
11. import existing React or SolidJS screens into Semantic UI IR without executing them;
12. expand bounded graphs of direct local JSX components with cycle detection and deterministic budgets;
13. preserve unsupported behavior and unresolved imports as source-backed boundaries;
14. apply several existing source-file changes through one reviewed staged transaction and shared verification boundary;
15. represent responsive breakpoints and hover, focus, disabled, loading, and error states independently from base layout;
16. materialize owned variants through static Tailwind utilities or generated CSS Module regions.

## Architecture

Shared editor code remains framework-neutral.

- `@afrodite/ui-ir` defines semantic layout, responsive/state variants, source bindings, style ownership, and source-backed regions.
- `@afrodite/framework-core` defines framework adapters, source operations, deterministic patch plans, diagnostics, and verification steps.
- `@afrodite/binding-core` discovers source targets and plans stable-marker installation.
- `@afrodite/style-core` maps semantic base layout to inline styles, Tailwind utilities, CSS Modules, or design tokens.
- `@afrodite/variants-core` resolves effective variant layout and materializes owned responsive/state overrides.
- `@afrodite/import-core` reconstructs bounded existing screens through syntax-specific import adapters.
- `@afrodite/import-core/graph` follows direct local component imports through a provider-controlled, budgeted graph.
- `@afrodite/verified-write` provides single-file and multi-file approval, staging, compare-and-swap writes, verification, and rollback.
- `@afrodite/project-session` keeps Canvas and Source Sync inside one command history and provenance timeline.

React and SolidJS use separate adapter identities. They currently share static JSX binding and screen-import implementations, while keeping framework-specific runtime and source-style behavior behind adapters.

## Safe source synchronization

```text
visual or semantic operation
  -> explicit source binding and ownership
  -> framework, style, or variant strategy adapter
  -> deterministic SourcePatchPlan
  -> exact unified diff
  -> approval bound to planId + sourceVersion
  -> compare-and-swap write
  -> formatter/typecheck/test/build verification
  -> applied result or rollback
```

Afrodite does not accept browser-authored text edits or verification commands. The local project bridge owns source reads, offsets, patch storage, filesystem access, and process execution.

## Atomic multi-file transactions

Several server-generated source plans can be grouped into one deterministic transaction:

```text
semantic layout/style/variant operations
  -> one adapter plan per target file
  -> exact diff for every file
  -> approval bound to transactionId + every source version
  -> preflight read of every target
  -> stage every final file body
  -> compare-and-swap commit
  -> one shared verification sequence
  -> keep every file or restore every committed file
```

The transaction route accepts semantic `layout`, `style`, and `variant` operations. It does not accept client-authored offsets, replacements, temporary paths, or verification commands.

Every target must be unique and already exist. If any file changed after review, the transaction is rejected before the first complete commit. If a later staged commit or required verification fails, committed files are restored in reverse order through compare-and-swap writes.

The boundary is logically all-or-rollback while the project bridge process remains alive. It is not yet crash-recoverable across a process or machine failure between individual file replacements.

See `docs/multi-file-transactions.md`.

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

Current base-style strategies:

- React and SolidJS static inline style objects;
- static Tailwind `className` or `class` strings;
- one explicit flat CSS Module rule;
- existing unique CSS custom-property tokens.

See `docs/style-ownership.md` and `docs/style-ownership-examples.md`.

## Responsive and component-state variants

A node may keep partial layout overrides separately from its base layout:

```json
{
  "responsive": [
    {
      "id": "tablet",
      "minWidth": 768,
      "layout": { "direction": "row", "gap": 16 }
    }
  ],
  "states": [
    {
      "id": "loading",
      "state": "loading",
      "layout": { "display": "grid" }
    }
  ]
}
```

Responsive overrides are resolved by matching width and ascending `minWidth`. Preview state priority is deterministic:

```text
hover -> focus -> disabled -> loading -> error
```

This is a semantic editor preview. Afrodite does not invent runtime loading/error logic, handlers, or application state.

Current source materialization:

- static Tailwind responsive, pseudo-state, disabled, and `data-state` utility variants;
- one replaceable generated variant region for an explicitly owned CSS Module class;
- explicit read-only diagnostics for static inline styles and unscoped design-token bindings.

Every changed variant property must be included in `styleOwnership.managedProperties`. Handwritten dynamic classes and unrelated CSS remain untouched.

See `docs/responsive-state-variants.md`.

## Existing screen and component-graph import

The **Screen import** workbench starts from one explicitly selected exported TSX/JSX component.

```text
adapter + repository path + export
  -> current root source snapshot
  -> static TypeScript JSX analysis
  -> direct relative component-import graph
  -> file/node/depth budgets and user stop boundaries
  -> Semantic UI IR tree with per-file provenance
  -> explicit open or JSON download
```

The importer never imports the target module, starts Vite, calls hooks, evaluates conditions, fetches data, or runs package scripts.

Recovered data includes:

- native JSX elements and component references;
- nested hierarchy and serializable static props;
- static stable markers;
- basic inline and static Tailwind layout;
- source version, file, export, offsets, line, and column;
- named and default direct relative component imports;
- file records and component edges with `expanded`, `boundary`, `cycle`, `missing`, `budget`, or `failed` status.

The graph supports hard maximum file, materialized-node, component-depth, and per-file syntax-depth limits. Repeated component instances receive unique node-ID namespaces. Active-path cycles are detected and retained as explicit boundaries.

`all-local` mode expands supported direct local imports. `explicit` mode expands only named components. `stopComponents` can terminate traversal at selected component boundaries.

Unsupported behavior remains visible as `source-region` nodes. Conditional rendering, iteration, calls, fragments, text, dynamic expressions, multiple return paths, and React `"use server"` modules retain exact snapshot provenance and an explicit read-only reason. Package imports, aliases, barrels, lazy loaders, dynamic imports, and unresolved modules stay unexpanded.

The Canvas command engine rejects mutations against read-only regions independently of Inspector state. Graph construction is read-only and never writes repository files.

See `docs/existing-screen-import.md` and `docs/multi-file-screen-import.md`.

## Live project session

Canvas and Source Sync share one active session:

```text
UiDocument + command history
  -> exact layout and variant transitions
  -> source snapshots and patch plans
  -> reviewed diffs
  -> verified writes or rollback
```

Undo and redo preserve provenance. New visual changes invalidate stale plans. Successful writes advance only the synchronized node.

See `docs/live-project-session.md`.

## Workspace

- `apps/studio` — Canvas, Source Sync, Binding Manager, Style Ownership, Variants, bounded component-graph import, and Transactions workbenches.
- `apps/preview-host` — opaque-origin trusted SolidJS and React component preview.
- `apps/project-bridge` — authenticated localhost source, import, planning, single-file verified-write, multi-file transaction, and rollback service.
- `packages/ui-ir` — Semantic UI IR, variants, and provenance contracts.
- `packages/canvas-engine` — reversible document commands and read-only enforcement.
- `packages/project-session` — live session state and transition provenance.
- `packages/framework-core` — framework and patch-plan contracts.
- `packages/binding-core` — target discovery and stable-marker plans.
- `packages/style-core` — base style ownership strategies.
- `packages/variants-core` — responsive/state resolution and source materialization strategies.
- `packages/import-core` — bounded single-file screen-import adapters.
- `packages/import-core/graph` — multi-file component graph traversal, resolution, budgets, cycles, and provenance.
- `packages/verified-write` — approval, staging, compare-and-swap, verification, and rollback.
- `packages/adapter-solid` — SolidJS framework, binding, and screen-import adapter factories.
- `packages/adapter-react` — React framework, binding, and screen-import adapter factories.
- `packages/project-indexer` — static SolidJS component catalog.
- `packages/indexer-react` — static React component catalog.
- `packages/protocol` — catalog, preview, bridge, binding, style, variant, import, and transaction schemas.

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

The bridge listens on `127.0.0.1:4175` by default and prints a generated session token. Paste it into Source Sync, Binding Manager, Style Ownership, Variants, Screen Import, or Transactions.

Verification:

```bash
pnpm typecheck
pnpm test
pnpm build
```

The next slice introduces a constrained semantic-operation API for project-aware AI commands such as `convert_to_grid`, `create_responsive_variant`, `replace_spacing_with_token`, and `explain_unpatchable_region`.
