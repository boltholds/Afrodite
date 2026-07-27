# Bounded multi-file screen import

VS-012 extends the one-file screen importer into a deterministic graph of direct local JSX components.

The graph importer does not execute the target application. It never imports a project module, starts Vite, calls hooks, evaluates route loaders, resolves runtime dependency injection, or runs package scripts.

## Request

A graph import starts from one explicit adapter, repository path, and export:

```json
{
  "adapterId": "afrodite.adapter.react",
  "repositoryPath": "src/screens/Dashboard.tsx",
  "exportName": "Dashboard",
  "maxDepth": 32,
  "maxFiles": 24,
  "maxNodes": 1200,
  "maxGraphDepth": 8,
  "expansionMode": "all-local",
  "stopComponents": ["HeavyChart"]
}
```

`maxDepth` limits static syntax traversal inside each file. `maxGraphDepth` limits component-definition expansion across files.

## Supported local resolution

The first graph implementation follows direct relative imports only:

```tsx
import Card from "./Card";
import { Toolbar } from "../components/Toolbar";
import { Badge as StatusBadge } from "./Badge";
```

The resolver probes only the source extensions advertised by the selected framework adapter, including direct files and `index` files.

The following remain boundaries:

- package imports;
- TypeScript path aliases;
- barrel re-exports;
- namespace imports;
- dynamic `import()`;
- `lazy()` and other runtime factories;
- router and provider configuration;
- modules that cannot be read under the fixed project root.

A boundary is visible in the graph result. Afrodite does not substitute a guessed component definition.

## Expansion policies

`all-local` expands every supported direct local component unless it matches `stopComponents`.

`explicit` expands only components named in `expandComponents`.

Boundary values may use the local JSX component name:

```text
Card
Toolbar
```

or the parent-file component identity:

```text
src/screens/Dashboard.tsx#HeavyChart
```

Stop boundaries take precedence over explicit includes.

## Deterministic budgets

Every graph request has hard limits:

- maximum successfully read source files;
- maximum materialized UI IR nodes;
- maximum component graph depth;
- maximum static syntax depth per source file.

When a limit is reached, the component instance remains in the recovered tree and its graph edge receives `budget` status. The graph result sets `truncated: true`.

The node budget is enforced with depth-first pruning. The returned document never contains more materialized nodes than requested.

## Cycle detection

The importer tracks the active component-definition path:

```text
src/A.tsx#A
  -> src/B.tsx#B
  -> src/A.tsx#A
```

The second `A` reference receives `cycle` status and is not expanded. This prevents infinite recursion while retaining the original component instance and an explicit diagnostic.

Repeated non-cyclic references are allowed. Each expanded instance receives a unique ID namespace while preserving the original source-region offsets and source version.

## Provenance

Every imported node continues to carry its own `SourceRegion`:

```json
{
  "repositoryPath": "src/components/Card.tsx",
  "sourceVersion": "fnv1a32:...",
  "exportName": "Card",
  "start": 120,
  "end": 360,
  "line": 7,
  "column": 3,
  "mode": "editable",
  "regionKind": "element"
}
```

The graph response additionally contains file records and edges.

A file record identifies the source snapshot and imported export:

```json
{
  "repositoryPath": "src/components/Card.tsx",
  "sourceVersion": "fnv1a32:...",
  "exportName": "Card",
  "depth": 1,
  "nodeCount": 8,
  "root": false
}
```

An edge records why a component was or was not expanded:

```json
{
  "fromRepositoryPath": "src/screens/Dashboard.tsx",
  "fromExportName": "Dashboard",
  "localName": "Card",
  "moduleSpecifier": "../components/Card",
  "importedName": "Card",
  "targetRepositoryPath": "src/components/Card.tsx",
  "status": "expanded",
  "depth": 1
}
```

Possible edge states are:

- `expanded`;
- `boundary`;
- `cycle`;
- `missing`;
- `budget`;
- `failed`.

## Trust boundary

The browser sends semantic graph controls only. Project bridge owns:

- fixed-root file reads;
- relative-path resolution;
- current source versions;
- parser execution;
- graph construction;
- returned provenance.

Graph import is read-only. Opening the result in the project session replaces the active UI IR document only; it does not write to the repository.

## Current limitation

Expanded component definitions are attached as semantic inspection children of component instances. They are not compiled into a runnable preview registry. Executable multi-file preview generation requires a separately reviewed dependency and build boundary.
