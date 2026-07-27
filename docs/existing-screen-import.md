# Existing screen import

VS-011 imports a bounded React or SolidJS screen into Semantic UI IR without executing the target project.

## Import boundary

The user explicitly selects:

- a framework adapter;
- one repository-relative TSX or JSX file;
- one exported function or arrow component;
- an optional maximum traversal depth.

The local project bridge reads the current source snapshot and invokes the selected screen-import adapter. Studio never receives filesystem authority and does not submit AST offsets or reconstructed source.

The importer does not:

- import the target module;
- start Vite or another bundler;
- call hooks or components;
- evaluate conditions;
- fetch data;
- execute package scripts;
- resolve runtime-generated JSX.

## Framework-neutral contracts

`@afrodite/import-core` defines:

```text
ScreenImportRequest
ScreenImportResult
ScreenImportStats
ScreenImportAdapter
ScreenImportAdapterRegistry
```

React and SolidJS expose separate adapter identities but currently reuse the same TypeScript JSX importer. Vue, Svelte, Qwik, Flutter, or native importers can return the same UI IR contracts while using different syntax parsers.

## Source-backed regions

Every imported node can carry `sourceRegion` provenance:

```json
{
  "frameworkId": "react",
  "adapterId": "afrodite.adapter.react",
  "repositoryPath": "src/Dashboard.tsx",
  "sourceVersion": "fnv1a32:...",
  "exportName": "Dashboard",
  "start": 120,
  "end": 310,
  "line": 6,
  "column": 5,
  "mode": "requires-binding",
  "regionKind": "element",
  "excerpt": "<main className=...>"
}
```

The mode is explicit:

- `editable` — the element already owns a unique static `data-afrodite-id`;
- `requires-binding` — the JSX structure is understood, but stable identity must be installed through the Binding Manager before source writes;
- `read-only` — the region cannot be changed safely by the current importer.

A `read-only` region always includes a reason. The Canvas command engine rejects layout command creation for these nodes, even when called outside Inspector.

## Recovered structure

The current JSX importer recovers:

- native JSX elements;
- component references;
- nested JSX hierarchy;
- unique static stable markers;
- serializable static props;
- basic inline layout values;
- basic static Tailwind layout utilities;
- source file, export, snapshot version, offsets, line, and column.

The importer does not claim style ownership. Inferred layout is an observed semantic value. Source writes still require an explicit `styleOwnership` strategy from VS-010.

## Preserved read-only behavior

The following constructs remain visible as `source-region` nodes:

- conditional and logical rendering;
- multiple return paths;
- collection iteration such as `.map(...)`;
- fragments;
- function calls and runtime factories;
- static text until a dedicated text primitive exists;
- dynamic expressions;
- unresolved or depth-limited syntax.

A conditional region may contain imported branch children. Afrodite can therefore display the recovered hierarchy without pretending that it owns the condition itself.

Dynamic props and spreads remain in source and are omitted from serializable imported props with structured diagnostics.

React modules marked with `"use server"` are imported as read-only rather than being rejected or treated as editable browser UI.

## Studio flow

Run Studio and a bridge bound to the target project:

```bash
pnpm dev
pnpm dev:bridge --project ./path/to/project
```

Open **Screen import**, connect the bridge, choose the adapter, file, and export, then review:

- import diagnostics;
- total node count;
- editable nodes;
- nodes requiring a stable binding;
- read-only source regions;
- the recovered tree and exact source locations.

The result can be downloaded as UI IR or explicitly opened in the project session. Opening is an explicit document replacement action; it does not modify the target repository.

## Current limitations

VS-011 intentionally imports one source file and one exported component. It does not yet follow imported child components across files, reconstruct router configuration, evaluate CSS cascade, resolve context providers, or build a runnable preview bundle for the imported application.

The next slice should add a bounded import graph: explicit child-component expansion across files with cycle detection, import budgets, provenance per file, and user-controlled boundaries.
