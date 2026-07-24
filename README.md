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

The SolidJS project indexer can:

1. parse a workspace through the TypeScript compiler API;
2. discover exported PascalCase JSX components and barrel re-exports;
3. record public names, source paths, and source locations;
4. extract typed public props and simple defaults;
5. classify JSON-safe prop values;
6. report callbacks and unsupported runtime types instead of guessing;
7. emit deterministic component-catalog JSON without executing target code.

The component composition slice can:

1. load and validate a component catalog in Studio;
2. show indexed components, source paths, prop counts, and diagnostics;
3. place a component into the selected UI IR container;
4. persist source bindings and JSON-safe initial props;
5. send the document to a separate preview application through a versioned protocol;
6. render trusted SolidJS components inside an iframe with `sandbox="allow-scripts"` and no same-origin permission;
7. report missing registry entries and runtime render failures as structured diagnostics.

## Workspace

- `apps/studio` — SolidJS visual editor, component library, layout inspector, and preview client.
- `apps/preview-host` — isolated runtime component renderer.
- `packages/ui-ir` — framework-neutral Semantic UI IR, serialization, and diagnostics.
- `packages/canvas-engine` — immutable document commands with undo/redo history.
- `packages/project-indexer` — static SolidJS component and prop discovery.
- `packages/protocol` — catalog and preview message schemas.
- `docs` — product vision, architecture, visual language, indexing, preview security, and vertical slices.

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

Build and run the indexer:

```bash
pnpm --filter @afrodite/project-indexer build
node packages/project-indexer/dist/cli.js ./path/to/solid-project \
  --out ./component-catalog.json
```
