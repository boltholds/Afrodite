# Afrodite

Afrodite is a code-aware visual UI editor that keeps visual design, semantic structure, and production code synchronized.

## Bootstrap scope

The first vertical slice targets an existing SolidJS project:

1. index project components;
2. place real components on a visual canvas;
3. edit layout and props;
4. persist a Semantic UI IR document;
5. produce a safe source-code diff without overwriting handwritten logic.

## Workspace

- `apps/studio` — SolidJS visual editor shell.
- `packages/ui-ir` — framework-neutral Semantic UI IR types and validation.
- `docs` — product vision, architecture, and vertical slices.

## Development

```bash
corepack enable
pnpm install
pnpm dev
```
