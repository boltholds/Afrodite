# Vertical slices

## VS-001: Semantic canvas bootstrap — complete

**Goal:** prove that the editor can render and edit a framework-neutral UI document.

Delivered:

- Studio loads and renders a sample `UiDocument`;
- the semantic component hierarchy is visible and selectable;
- selection is synchronized between layers, canvas, and inspector;
- display, direction, gap, padding, width, and height constraints are editable;
- every document mutation is represented by a reversible command;
- undo and redo work through buttons and keyboard shortcuts;
- JSON documents can be validated, applied, saved in the browser, copied, and downloaded;
- invalid JSON, schema violations, and duplicate stable IDs produce structured diagnostics;
- command history and serialization behavior are covered by unit tests.

Verification boundary:

- `pnpm typecheck` passes;
- `pnpm test` passes;
- `pnpm build` passes.

## VS-002: SolidJS component indexing — complete

**Goal:** build a component catalog from an existing SolidJS workspace without executing its code.

Delivered:

- a framework-neutral `ComponentCatalog` and diagnostic model;
- tsconfig discovery and parsing through the TypeScript compiler API;
- exported PascalCase function and variable component discovery;
- barrel re-export resolution and declaration deduplication;
- component source paths, lines, columns, declaration kinds, and public export names;
- typed prop extraction with required state, documentation, type text, and simple defaults;
- JSON-safe classification for primitives, literal unions, arrays, tuples, and plain objects;
- explicit diagnostics for callbacks, runtime objects, unconstrained types, and compiler failures;
- a Node CLI that writes deterministic component-catalog JSON;
- fixture coverage proving components are found while ordinary functions are ignored;
- no use of dynamic imports, target application startup, Vite, or package-script execution.

Verification boundary:

- `pnpm typecheck` passes;
- `pnpm test` passes;
- `pnpm build` passes.

## VS-003: Visual composition with real components — complete

**Goal:** place an indexed component into a document and render it through an isolated preview host.

Delivered:

- `@afrodite/protocol` validates component catalogs and preview messages at process boundaries;
- Studio loads editable component-catalog JSON and displays component names, source paths, prop counts, and indexer diagnostics;
- an indexed component can be placed into the currently selected UI IR container;
- insertion is represented by a reversible command and participates in undo/redo;
- component nodes persist stable source bindings and JSON-safe default props;
- Studio and the preview host run as separate Vite applications;
- the preview host is embedded with `sandbox="allow-scripts"` and no same-origin permission;
- preview messages are validated before they are accepted;
- components are resolved only through a trusted static registry, never through arbitrary document-supplied imports;
- the indexed Button and Panel fixtures render as real SolidJS components;
- missing registry entries and runtime render failures produce structured preview diagnostics;
- protocol decoding and insertion history are covered by unit tests.

Current trust boundary:

- static indexing remains safe and does not execute the target project;
- runtime preview executes only components explicitly included in the preview-host registry;
- connecting an arbitrary repository will require an explicit build/approval step that creates an isolated registry bundle.

Verification boundary:

- `pnpm typecheck` passes;
- `pnpm test` passes;
- `pnpm build` passes.

## VS-004: Safe SolidJS code patch

**Goal:** write one visual layout change back to TypeScript/JSX.

Acceptance criteria:

- bind an IR node to an existing JSX element;
- change a supported layout property visually;
- generate a minimal source diff;
- preserve unrelated event handlers and expressions;
- run formatter and TypeScript checks;
- require approval before applying the patch.
