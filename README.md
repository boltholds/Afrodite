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

The component composition slice can:

1. load and validate a component catalog in Studio;
2. show indexed components, source paths, prop counts, and diagnostics;
3. place a component into the selected UI IR container;
4. persist source bindings and JSON-safe initial props;
5. send the document to a separate preview application through a versioned protocol;
6. render trusted components inside an iframe with `sandbox="allow-scripts"` and no same-origin permission;
7. report unsupported frameworks, missing registry entries, and runtime failures as structured diagnostics.

## Framework adapters

Afrodite no longer treats SolidJS as part of the shared architecture.

- `@afrodite/framework-core` defines framework descriptors, capability flags, detection, adapter registration, framework-neutral operations, source snapshots, patch plans, diagnostics, and verification steps.
- `@afrodite/adapter-solid` declares the active SolidJS capabilities.
- `@afrodite/adapter-react` declares React as an independent expansion target and already supports static project detection.
- UI IR source bindings can carry `frameworkId`, `adapterId`, and `componentId`.
- catalogs can describe multiple frameworks;
- preview requests declare required frameworks;
- preview hosts announce available runtime adapters.

The next safe-write slice resolves an adapter from the source binding and asks it for a `SourcePatchPlan`. Diff generation, approval, application, rollback, and verification stay shared across SolidJS, React, and later frameworks.

See `docs/framework-adapters.md` for the extension contract.

## Workspace

- `apps/studio` — visual editor, component library, layout inspector, and preview client.
- `apps/preview-host` — isolated runtime component renderer with a framework runtime registry.
- `packages/ui-ir` — framework-neutral Semantic UI IR, serialization, diagnostics, and source bindings.
- `packages/canvas-engine` — immutable document commands with undo/redo history.
- `packages/framework-core` — shared adapter and source-patch contracts.
- `packages/adapter-solid` — SolidJS adapter identity and detection.
- `packages/adapter-react` — React adapter identity and detection.
- `packages/project-indexer` — current static SolidJS component and prop discovery.
- `packages/protocol` — framework-aware catalog and preview schemas.
- `docs` — product vision, architecture, visual language, framework adapters, indexing, preview security, and vertical slices.

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
