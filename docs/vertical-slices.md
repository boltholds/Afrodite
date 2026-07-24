# Vertical slices

## VS-001: Semantic canvas bootstrap

**Goal:** prove that the editor can render and edit a framework-neutral UI document.

Acceptance criteria:

- Studio loads a sample `UiDocument`;
- the component hierarchy is visible;
- selecting a node highlights it in the canvas and inspector;
- changing row/column layout updates the preview;
- the document validates through `@afrodite/ui-ir`;
- undo and redo are represented as commands, even if the first implementation is in memory.

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
