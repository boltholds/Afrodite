# Afrodite

Afrodite is a code-aware visual UI editor that keeps visual design, semantic structure, and production code synchronized.

## Current capabilities

The semantic canvas can:

1. render and edit a framework-neutral `UiDocument`;
2. select nodes through the hierarchy or canvas;
3. edit flex/grid display, direction, spacing, padding, and sizing constraints;
4. insert indexed component nodes through reversible commands;
5. undo and redo document mutations;
6. validate, import, save, copy, and download Semantic UI IR JSON;
7. report invalid JSON, schema failures, and duplicate stable IDs explicitly.

The current SolidJS project indexer can:

1. parse a workspace through the TypeScript compiler API;
2. discover exported PascalCase JSX components and barrel re-exports;
3. record public names, source paths, and source locations;
4. extract typed public props and simple defaults;
5. classify JSON-safe prop values;
6. report callbacks and unsupported runtime types instead of guessing;
7. emit deterministic component-catalog JSON without executing target code.

The component composition slice can load catalogs, insert source-bound component nodes, and render trusted components through a separate opaque-origin preview host.

## Framework adapters

Shared editor code is framework-neutral.

- `@afrodite/framework-core` defines descriptors, capabilities, detection, operations, source snapshots, deterministic patch plans, edit validation, and previews.
- `@afrodite/adapter-solid` supports detection, indexing, preview, prop editing, and the first source-patch planner.
- `@afrodite/adapter-react` declares React independently and currently supports project detection.
- UI IR, catalogs, and preview messages carry explicit framework and adapter identities.

The SolidJS planner binds through a unique `data-afrodite-id` and changes only a static JSX `style` object. It preserves handlers, children, attributes, expressions, spreads, and unrelated CSS properties. Dynamic or ambiguous source is rejected instead of guessed.

## Verified source writes

`@afrodite/verified-write` keeps framework syntax planning separate from filesystem mutation.

```text
FrameworkOperation
  -> adapter.planPatch
  -> SourcePatchPlan
  -> before/after preview
  -> explicit approval
  -> compare-and-swap write
  -> formatter/typecheck/test/build verification
  -> keep or rollback
```

Approvals are bound to the exact patch ID and source version. Stale files, overlapping edits, invalid paths, and approval mismatches are rejected. A failed required verification restores the original source when the compare-and-swap rollback is still safe.

See `docs/framework-adapters.md` and `docs/verified-write.md`.

## Workspace

- `apps/studio` — visual editor, component library, layout inspector, and preview client.
- `apps/preview-host` — isolated runtime component renderer with a framework registry.
- `packages/ui-ir` — framework-neutral Semantic UI IR and source bindings.
- `packages/canvas-engine` — immutable document commands and undo/redo history.
- `packages/framework-core` — adapter, operation, source snapshot, and patch-plan contracts.
- `packages/verified-write` — approval, filesystem compare-and-swap, verification, and rollback.
- `packages/adapter-solid` — SolidJS detection and layout patch planning.
- `packages/adapter-react` — React adapter identity and detection.
- `packages/project-indexer` — current static SolidJS component and prop discovery.
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

Build and run the current SolidJS indexer:

```bash
pnpm --filter @afrodite/project-indexer build
node packages/project-indexer/dist/cli.js ./path/to/solid-project \
  --out ./component-catalog.json
```

The next framework slice is React indexing and preview parity, followed by React source-patch planning against the same verified-write boundary.
