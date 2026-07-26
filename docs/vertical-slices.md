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

Delivered:

- deterministic content versions and patch IDs;
- sorted, non-overlapping text edits;
- path, bounds, overlap, and stale-source validation;
- deterministic previews and unified diffs;
- approvals bound to `planId` and `sourceVersion`;
- compare-and-swap filesystem writes below a configured project root;
- formatter, typecheck, test, build, or custom verification steps;
- automatic compare-and-swap rollback when a required check fails;
- explicit `applied`, `rejected`, `rolled-back`, and `rollback-failed` results;
- SolidJS static inline-style layout planning with refusal on dynamic or ambiguous ownership.

## VS-005: React indexing and preview parity — complete

**Goal:** prove the adapter model by adding React without modifying the shared editor architecture.

Delivered:

- static React TypeScript/TSX analysis without project execution;
- exported component and barrel re-export discovery;
- serializable prop, default, source, framework, and adapter metadata;
- explicit async, server-only, context, callback, React-node, and DOM-runtime diagnostics;
- trusted React preview through `react-dom/client` behind the shared runtime registry;
- framework-qualified binding preservation during insertion.

## VS-006: React source patch parity — complete

**Goal:** implement React syntax planning against the existing verified-write boundary.

Delivered:

- React `sourcePatching` capability and `planReactLayoutPatch`;
- the existing `FrameworkOperation` and `SourcePatchPlan` contracts;
- unique static `data-afrodite-id` binding;
- React inline-style casing such as `flexDirection`;
- preservation of hooks, callbacks, children, attributes, `className`, ARIA props, and unrelated styles;
- explicit rejection of dynamic managed values, style variables, spreads, computed keys, duplicates, and `use server` modules;
- unchanged shared diff, approval, compare-and-swap, verification, and rollback services.

## VS-007: Studio source synchronization workflow — complete

**Goal:** expose the safe-write architecture as an end-to-end workflow inside Afrodite Studio.

Delivered:

- `apps/project-bridge` as an authenticated localhost service bound to one explicit project root;
- fixed-root source reads and versioned snapshots;
- SolidJS and React adapter resolution through the shared registry;
- bridge protocol schemas for health, reads, planning, approval, verification, and write results;
- server-side patch-plan storage with expiration;
- no client-authored text edits or verification commands;
- bearer-token authentication, Studio-origin allowlisting, request-size limits, and traversal protection;
- a `Source Sync` Studio workspace alongside Canvas;
- source-bound node selection from saved Semantic UI IR;
- current source inspection and editable target layout JSON;
- adapter diagnostics, planned verification, exact unified diff, plan ID, and source version display;
- explicit review confirmation before apply;
- application through `VerifiedWriteService`;
- applied, rejected, rolled-back, and rollback-failed outcome views;
- verification output and refreshed source snapshots;
- service and protocol tests covering successful apply and stale-source rejection.

Current handoff limitation:

- Canvas and Source Sync share the saved UI document through browser storage rather than a live editor session.

## VS-008: Live Studio project session and source bindings

**Goal:** remove the browser-storage handoff and make source synchronization part of the active editing session.

Acceptance criteria:

- one shared Studio state owns Canvas, selection, pending operations, project connection, source snapshots, plans, and write results;
- switching workspaces does not unmount or lose command history;
- a layout command records the exact before and after UI IR state for source planning;
- source binding paths, framework adapter, component identity, and stable marker are inspectable and editable through validated commands;
- the current project catalog and bridge grant are associated with one explicit project session;
- successful writes update the source baseline and clear only the applied pending operation;
- external source changes invalidate plans and surface a rebase or re-plan action;
- unbound nodes can enter an assisted binding workflow without arbitrary source guessing;
- session state remains framework-neutral and does not introduce SolidJS or React branches into Studio.
