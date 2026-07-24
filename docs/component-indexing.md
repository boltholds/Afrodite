# SolidJS component indexing

`@afrodite/project-indexer` builds a deterministic component catalog from a TypeScript or SolidJS workspace without importing or executing target-project modules.

## Pipeline

```text
project root
    -> locate and parse tsconfig.json
    -> create a TypeScript Program
    -> inspect module exports and aliases
    -> identify exported PascalCase JSX components
    -> resolve props through the TypeChecker
    -> classify JSON-safe values
    -> emit catalog JSON and diagnostics
```

The indexer reads source files through the TypeScript compiler host. It does not call `import()`, start Vite, evaluate JSX, load application configuration, or execute package scripts.

## Component discovery

The first implementation recognizes exported function declarations and variable declarations when:

- the public export name is PascalCase;
- the declaration contains JSX; or
- a variable has an explicit SolidJS component type such as `Component<Props>`.

Barrel re-exports are resolved through TypeScript symbols and deduplicated by their original declaration. A default component re-exported under a named alias uses the named public export in the catalog.

## Prop extraction

For each component, the catalog records:

- stable catalog ID;
- public component and export names;
- source path, line, and column;
- declaration kind;
- prop name, type text, required state, documentation, and simple default value;
- whether the prop can be represented safely in UI IR.

The initial JSON-safe set includes strings, numbers, booleans, null, literal unions, arrays, tuples, and plain nested objects composed from the same values.

Functions, constructors, DOM nodes, promises, dates, maps, sets, unconstrained `any` or `unknown`, and recursive object graphs produce diagnostics instead of guessed editors.

## CLI

After building the workspace:

```bash
pnpm --filter @afrodite/project-indexer build
node packages/project-indexer/dist/cli.js ./path/to/solid-project \
  --out ./component-catalog.json
```

A custom TypeScript configuration can be supplied with `--tsconfig`.

## Current limitations

- components created entirely through runtime factories without JSX or an explicit Solid component type may not be detected;
- generic props need a concrete exported component type before useful editors can be generated;
- callbacks remain visible in the catalog but are marked non-serializable;
- token, story, and safe insertion-point discovery belong to later slices.

These limitations are reported or documented rather than hidden behind speculative inference.
