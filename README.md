# Afrodite

Afrodite is a code-aware visual UI editor that keeps visual design, semantic structure, and production code synchronized.

## Current vertical slice

The semantic canvas can now:

1. render a framework-neutral `UiDocument`;
2. select nodes through the hierarchy or canvas;
3. edit flex/grid display, direction, spacing, padding, and sizing constraints;
4. undo and redo every document mutation through reversible commands;
5. validate, import, save, copy, and download Semantic UI IR JSON;
6. report invalid JSON, schema failures, and duplicate stable IDs explicitly.

The next vertical slice will index exported SolidJS components through static analysis without executing the target project.

## Workspace

- `apps/studio` — SolidJS visual editor and layout inspector.
- `packages/ui-ir` — framework-neutral Semantic UI IR, serialization, and diagnostics.
- `packages/canvas-engine` — immutable document commands with undo/redo history.
- `docs` — product vision, architecture, and vertical slices.

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
