# Vertical slices

## VS-001: Semantic canvas bootstrap — complete

**Goal:** prove that the editor can render and edit a framework-neutral UI document.

Delivered:

- Studio loads and renders a `UiDocument`;
- hierarchy, canvas, and inspector selection are synchronized;
- layout constraints are editable through reversible commands;
- undo, redo, serialization, persistence, and structured diagnostics are covered by tests.

## VS-002: SolidJS component indexing — complete

**Goal:** build a component catalog from a SolidJS workspace without executing its code.

Delivered:

- TypeScript compiler-based static discovery;
- barrel export resolution and component deduplication;
- public prop, default, source-location, and serializability metadata;
- deterministic catalog JSON and explicit unsupported-type diagnostics;
- no target-project module, Vite configuration, or package-script execution.

## VS-003: Visual composition with real components — complete

**Goal:** place an indexed component into UI IR and render it through an isolated preview host.

Delivered:

- validated catalog and preview protocols;
- a component library in Studio;
- reversible insertion of source-bound component nodes;
- separate Studio and opaque-origin preview-host applications;
- a trusted component registry and structured runtime diagnostics.

## VS-003.5: Framework adapter foundation — complete

**Goal:** remove SolidJS assumptions from extension and safe-write boundaries.

Delivered:

- `@afrodite/framework-core` with adapter descriptors, capabilities, detection, registry, operations, source snapshots, patch plans, diagnostics, and verification steps;
- independent SolidJS and React adapter identities;
- framework metadata in UI IR, catalogs, and preview messages;
- explicit unsupported-runtime diagnostics;
- backward compatibility for older Solid-only documents and catalogs.

## VS-004: Framework-neutral safe source patch — complete

**Goal:** convert a visual layout edit into an approved and verified source patch, with SolidJS as the first syntax adapter.

Delivered in the shared boundary:

- deterministic content versions and patch IDs;
- sorted, non-overlapping text edits;
- path, bounds, overlap, and stale-source validation;
- deterministic before/after previews;
- approvals bound to `planId` and `sourceVersion`;
- compare-and-swap filesystem writes below a configured project root;
- formatter, typecheck, test, build, or custom verification steps;
- automatic compare-and-swap rollback when a required check fails;
- explicit `applied`, `rejected`, `rolled-back`, and `rollback-failed` results.

Delivered in the SolidJS adapter:

- `sourcePatching: true` and a real `planPatch` implementation;
- binding through a unique static `data-afrodite-id` marker;
- AST-informed replacement of an existing static `style` object;
- insertion of a style object when the marked JSX element has none;
- preservation of event handlers, expressions, children, attributes, spreads, and unmanaged CSS properties;
- refusal to guess when markers are absent or duplicated, bindings target another file/framework, or styles are dynamic;
- formatter and TypeScript verification declarations.

Verification boundary:

- framework-core patch planning tests pass;
- SolidJS planner preservation and refusal tests pass;
- approval, compare-and-swap, successful apply, and rollback tests pass;
- workspace typecheck, tests, and production builds pass.

## VS-005: React indexing and preview parity

**Goal:** prove the adapter model by adding React without modifying the shared editor architecture.

Acceptance criteria:

- discover exported React function components and serializable props;
- distinguish components from hooks and ordinary functions;
- generate catalog entries with `frameworkId: "react"`;
- compile a trusted React preview runtime registry;
- render React components in an isolated preview host;
- report unsupported server-only, async, context-dependent, or runtime props explicitly;
- reuse the existing catalog, UI IR, preview, command, patch-plan, approval, write, verification, and rollback contracts.

## VS-006: React source patch parity

**Goal:** implement React syntax planning against the same verified-write boundary.

Acceptance criteria:

- consume the existing `FrameworkOperation` contract;
- bind React JSX through stable markers;
- return the same `SourcePatchPlan` shape;
- preserve hooks, callbacks, expressions, children, and unrelated styles;
- use the existing preview, approval, compare-and-swap, verification, and rollback services unchanged.
