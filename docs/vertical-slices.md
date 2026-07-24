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

## VS-002: SolidJS component indexing

**Goal:** build a component catalog from an existing SolidJS workspace.

Acceptance criteria:

- exported JSX components are discovered through static analysis;
- component names and source paths are shown;
- serializable props are extracted where possible;
- unsupported types produce diagnostics rather than silent guesses;
- no target-project code is executed during indexing.

## VS-003: Visual composition with real components

**Goal:** place an indexed component into a document and render it in an isolated preview host.

Acceptance criteria:

- drag a catalog component into a valid container;
- persist its component reference and props in UI IR;
- render it from the target workspace;
- display import or runtime failures as structured diagnostics.

## VS-004: Safe SolidJS code patch

**Goal:** write one visual layout change back to TypeScript/JSX.

Acceptance criteria:

- bind an IR node to an existing JSX element;
- change a supported layout property visually;
- generate a minimal source diff;
- preserve unrelated event handlers and expressions;
- run formatter and TypeScript checks;
- require approval before applying the patch.
