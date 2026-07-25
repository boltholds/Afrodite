# Afrodite

Afrodite is a code-aware visual UI editor that keeps visual design, semantic structure, and production code synchronized.

## Current capabilities

The semantic canvas can:

1. render and edit a framework-neutral `UiDocument`;
2. select nodes through the hierarchy or canvas;
3. edit flex/grid display, direction, spacing, padding, and sizing constraints;
4. insert indexed component nodes through reversible commands;
5. preserve framework-qualified bindings during insertion;
6. undo and redo document mutations;
7. validate, import, save, copy, and download Semantic UI IR JSON;
8. report invalid JSON, schema failures, and duplicate stable IDs explicitly.

Static indexers currently support SolidJS and React through separate packages. Both use the TypeScript compiler API, resolve exports without executing project modules, extract typed serializable props and defaults, and emit the same framework-neutral component catalog.

The React indexer additionally reports async components, server-only modules, context dependencies, callbacks, React nodes, DOM events, and other runtime-only values explicitly instead of pretending they are editable JSON props.

The component composition slice can load mixed-framework catalogs, insert source-bound component nodes, and render trusted SolidJS and React components through a separate opaque-origin preview host.

## Framework adapters

Shared editor code is framework-neutral.

- `@afrodite/framework-core` defines descriptors, capabilities, detection, operations, source snapshots, deterministic patch plans, edit validation, and previews.
- `@afrodite/adapter-solid` supports detection, indexing, preview, prop editing, and the first source-patch planner.
- `@afrodite/adapter-react` supports detection, static indexing, isolated runtime preview, and serializable prop editing. React source patching is the next adapter slice.
- UI IR, catalogs, preview messages, command history, and verified writes carry stable framework-neutral contracts.

The preview host owns a runtime-adapter registry. SolidJS components render through Solid's dynamic component runtime; React components mount through `react-dom/client`. Both runtimes use framework-qualified trusted registries and return failures through the same preview diagnostic protocol.

The SolidJS planner binds through a unique `data-afrodite-id` and changes only a static JSX `style` object. It preserves handlers, children, attributes, expressions, spreads, and unrelated CSS properties. Dynamic or ambiguous source is rejected instead of guessed.

## Verified source writes

`@afrodite/verified-write` keeps framework syntax planning separate from filesystem mutation.

```text
FrameworkOperation
  -> adapter.planPatch
  -> SourcePatchPlan
  -> before/after preview and unified diff
  -> explicit approval
  -> compare-and-swap write
  -> formatter/typecheck/test/build verification
  -> keep or rollback
```

Approvals are bound to the exact patch ID and source version. Stale files, overlapping edits, invalid paths, and approval mismatches are rejected. A failed required verification restores the original source when the compare-and-swap rollback is still safe.

See `docs/framework-adapters.md`, `docs/react-indexing.md`, and `docs/verified-write.md`.

## Workspace

- `apps/studio` — visual editor, mixed-framework component library, layout inspector, and preview client.
- `apps/preview-host` — isolated SolidJS and React runtime component renderer.
- `packages/ui-ir` — framework-neutral Semantic UI IR and source bindings.
- `packages/canvas-engine` — immutable document commands, framework-binding preservation, and undo/redo history.
- `packages/framework-core` — adapter, operation, source snapshot, and patch-plan contracts.
- `packages/verified-write` — approval, filesystem compare-and-swap, verification, and rollback.
- `packages/adapter-solid` — SolidJS identity, detection, and layout patch planning.
- `packages/adapter-react` — React identity, detection, indexing/preview capabilities, and future patch planning.
- `packages/project-indexer` — static SolidJS component and prop discovery.
- `packages/indexer-react` — static React component and prop discovery.
- `packages/protocol` — framework-aware catalog and preview schemas.
- `docs` — product vision, architecture, visual language, adapters, indexing, preview security, verified writes, and vertical slices.

## Development

```bash
corepack enable
pnpm install
pnpm dev
```

`pnpm dev` starts Studio on `4173` and the preview host on `4174`.

Verification:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Build and run the SolidJS indexer:

```bash
pnpm --filter @afrodite/project-indexer build
node packages/project-indexer/dist/cli.js ./path/to/solid-project \
  --out ./solid-component-catalog.json
```

Build and run the React indexer:

```bash
pnpm --filter @afrodite/indexer-react build
node packages/indexer-react/dist/cli.js ./path/to/react-project \
  --out ./react-component-catalog.json
```

The next framework slice is React source-patch planning against the existing verified-write boundary.
