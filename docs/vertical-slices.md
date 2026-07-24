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

## VS-003: Visual composition with real components

**Goal:** place an indexed component into a document and render it in an isolated preview host.

Acceptance criteria:

- Studio can load a generated component catalog;
- component names, paths, prop editors, and diagnostics are visible;
- drag a catalog component into a valid container;
- persist its component reference and serializable props in UI IR;
- render it from the target workspace inside an isolated preview host;
- display import, compilation, and runtime failures as structured diagnostics;
- target-project execution requires explicit trust.

## VS-004: Safe SolidJS code patch

**Goal:** write one visual layout change back to TypeScript/JSX.

Acceptance criteria:

- bind an IR node to an existing JSX element;
- change a supported layout property visually;
- generate a minimal source diff;
- preserve unrelated event handlers and expressions;
- run formatter and TypeScript checks;
- require approval before applying the patch.
