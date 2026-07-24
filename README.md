# Afrodite

Afrodite is a code-aware visual UI editor that keeps visual design, semantic structure, and production code synchronized.

## Current capabilities

The semantic canvas can:

1. render and edit a framework-neutral `UiDocument`;
2. select nodes through the hierarchy or canvas;
3. edit flex/grid display, direction, spacing, padding, and sizing constraints;
4. undo and redo document mutations through reversible commands;
5. validate, import, save, copy, and download Semantic UI IR JSON;
6. report invalid JSON, schema failures, and duplicate stable IDs explicitly.

The SolidJS project indexer can:

1. parse a workspace through the TypeScript compiler API;
2. discover exported PascalCase JSX components and barrel re-exports;
3. record public names, source paths, and source locations;
4. extract typed public props and simple defaults;
5. classify JSON-safe prop values;
6. report callbacks and unsupported runtime types instead of guessing;
7. emit a deterministic component-catalog JSON file without executing target code.

## Workspace

- `apps/studio` — SolidJS visual editor and layout inspector.
- `packages/ui-ir` — framework-neutral Semantic UI IR, serialization, and diagnostics.
- `packages/canvas-engine` — immutable document commands with undo/redo history.
- `packages/project-indexer` — static SolidJS component and prop discovery.
- `docs` — product vision, architecture, visual language, indexing rules, and vertical slices.

## Development

```bash
corepack enable
pnpm install
pnpm dev
```

Verification:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Build and run the indexer:

```bash
pnpm --filter @afrodite/project-indexer build
node packages/project-indexer/dist/cli.js ./path/to/solid-project \
  --out ./component-catalog.json
```
