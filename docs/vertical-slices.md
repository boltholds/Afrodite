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

## VS-002: SolidJS component indexing — complete

**Goal:** build a component catalog from an existing SolidJS workspace without executing its code.

Delivered:

- a serializable `ComponentCatalog` and diagnostic model;
- tsconfig discovery and parsing through the TypeScript compiler API;
- exported PascalCase function and variable component discovery;
- barrel re-export resolution and declaration deduplication;
- component source paths, locations, declaration kinds, public names, props, and defaults;
- JSON-safe classification and explicit unsupported-type diagnostics;
- a deterministic CLI output;
- no target-project module, Vite configuration, or package script execution.

## VS-003: Visual composition with real components — complete

**Goal:** place an indexed component into a document and render it through an isolated preview host.

Delivered:

- validated catalog and preview protocols;
- a component library in Studio;
- reversible insertion of source-bound component nodes;
- separate Studio and preview-host applications;
- an opaque-origin sandbox iframe;
- a trusted static component registry;
- structured missing-component and runtime-failure diagnostics.

## VS-003.5: Framework adapter foundation — complete

**Goal:** remove SolidJS assumptions from the extension and safe-write boundaries before implementing source patching.

Delivered:

- `@afrodite/framework-core` with adapter descriptors, capability flags, detection, registry, operations, source snapshots, text edits, patch plans, diagnostics, and verification steps;
- `@afrodite/adapter-solid` as the first active framework identity;
- `@afrodite/adapter-react` as an independently detected expansion target;
- optional `frameworkId`, `adapterId`, and `componentId` fields in UI IR source bindings;
- framework descriptors and component identities in the catalog protocol;
- required-framework and available-runtime metadata in the preview protocol;
- `FRAMEWORK_NOT_SUPPORTED` diagnostics from the preview host;
- backward compatibility for documents and catalogs created before adapter metadata existed;
- documentation defining how Vue, Svelte, Qwik, and other adapters can be added.

Verification criteria:

- SolidJS and React projects can be detected independently from package manifests;
- multiple adapters can be registered without framework conditionals in shared code;
- a source binding resolves to an adapter through stable IDs;
- preview requests identify the frameworks required by a subtree;
- unsupported preview runtimes fail explicitly;
- all packages pass typecheck, tests, and build.

## VS-004: Framework-neutral safe source patch

**Goal:** convert one visual layout edit into a reviewed and verified source patch, with SolidJS as the first syntax adapter.

Shared acceptance criteria:

- compare the before and after UI IR state and create a `FrameworkOperation`;
- resolve the adapter from `SourceBinding.frameworkId` and `adapterId`;
- reject missing, ambiguous, or capability-incompatible adapters;
- pass an immutable `SourceSnapshot` to the adapter;
- receive a `SourcePatchPlan` containing non-overlapping text edits, diagnostics, source version, and verification steps;
- generate a minimal unified diff independently from the framework;
- preserve unrelated source text and handwritten behavior;
- reject stale source snapshots before applying changes;
- require explicit approval for every plan;
- apply edits atomically and support rollback;
- run formatter, typecheck, tests, or build commands declared by the adapter.

SolidJS adapter acceptance criteria:

- bind a UI IR node to an existing TSX/JSX element;
- change one supported layout property;
- preserve signals, event handlers, expressions, spreads, and component children;
- generate a minimal AST-informed patch rather than rewriting the file;
- verify formatting and TypeScript.

React expansion contract:

- React source patching is implemented in `@afrodite/adapter-react` later;
- it consumes the same `FrameworkOperation` and returns the same `SourcePatchPlan`;
- Studio, UI IR, command history, diff review, approval, apply, rollback, and verification orchestration remain unchanged.

## VS-005: React indexing and preview parity

**Goal:** prove the extension model by adding React without modifying the shared editor architecture.

Acceptance criteria:

- discover exported React function components and serializable props;
- distinguish components from hooks and ordinary functions;
- generate catalog entries with `frameworkId: "react"`;
- compile a trusted React preview runtime registry;
- render React components in an isolated preview host;
- report unsupported server-only, async, context-dependent, or runtime props explicitly;
- reuse the existing catalog, UI IR, preview, command, and diagnostic contracts.
