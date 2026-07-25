# React indexing and preview

## Static indexing

`@afrodite/indexer-react` reads a React TypeScript/TSX project through the TypeScript compiler API. It does not dynamically import source modules, start Vite or Next.js, execute package scripts, or evaluate component code.

The indexer discovers exported PascalCase function and variable components, including barrel re-exports and common wrapper forms whose initializer contains a component function. Lowercase hooks and ordinary functions are ignored.

Each catalog entry uses the shared protocol and contains:

```text
id
frameworkId: react
adapterId: afrodite.adapter.react
name
exportName
sourcePath
source location
declaration kind
serializable prop metadata
```

The React catalog ID is framework-qualified:

```text
react:src/ActionCard.tsx#ActionCard
```

This lets the framework-neutral insertion boundary preserve React identity even when an older Studio caller only copies the stable catalog marker into `SourceBinding`.

## Prop boundary

JSON-safe values are editable and persistable:

- strings, numbers, booleans, null;
- literal unions;
- arrays and tuples of safe values;
- plain nested objects without required runtime-only members.

The following values remain outside UI IR props:

- callbacks and event handlers;
- `ReactNode`, `ReactElement`, and JSX elements;
- DOM nodes and synthetic events;
- promises, dates, maps, sets, files, and similar runtime objects;
- recursive or unconstrained `any`/`unknown` structures.

Unsupported props produce `UNSUPPORTED_PROP_TYPE` diagnostics instead of generated placeholder behavior.

## Component diagnostics

The indexer reports framework-specific execution boundaries:

- `ASYNC_COMPONENT_UNSUPPORTED` for async client components;
- `SERVER_COMPONENT_UNSUPPORTED` for `.server.tsx`, `"use server"`, `server-only`, and known server imports;
- `CONTEXT_DEPENDENCY_UNSUPPORTED` when a component calls `useContext` and may require a provider harness.

Async and server-only components are excluded from the browser catalog. Context-dependent components may remain indexed, but their preview warning is preserved so a future project registry can attach a provider harness explicitly.

## Preview runtime

The isolated preview host contains a framework runtime registry. React is registered independently from SolidJS and mounts trusted components through `react-dom/client`.

```text
UiNode frameworkId=react
    -> React runtime adapter
    -> framework-qualified trusted registry lookup
    -> React root mount
    -> React error boundary
    -> shared PreviewRenderResult
```

The iframe remains `sandbox="allow-scripts"` without `allow-same-origin`. UI IR paths are never used as arbitrary dynamic imports. Only components compiled into an approved registry bundle can execute.

The fixture registry proves runtime parity. Connecting an arbitrary repository still requires an explicit, isolated bundle-build approval step with dependency review and resource limits.

## CLI

```bash
pnpm --filter @afrodite/indexer-react build
node packages/indexer-react/dist/cli.js ./path/to/react-project \
  --out ./react-component-catalog.json
```

A non-default TypeScript configuration can be selected with `--tsconfig`.
