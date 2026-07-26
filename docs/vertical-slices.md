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
- adapter diagnostics, verification steps, exact unified diff, approval, write outcomes, and rollback output.

## VS-008: Live Studio project session — complete

**Goal:** remove the browser-storage handoff and make source synchronization part of the active editing session.

Delivered:

- `@afrodite/project-session` owns the live framework-neutral session state;
- Canvas and Source Sync share one UI document, selection, command history, revision counter, source snapshots, patch plans, write results, and synchronization cursors;
- switching workspaces preserves undo/redo history and the selected node;
- every visual layout command records exact before/after layouts;
- undo and redo are also recorded as explicit layout transitions;
- multiple unsynchronized visual transitions are aggregated into one source operation;
- source planning uses the recorded visual operation rather than a separate target-layout editor;
- new visual edits invalidate reviewed plans for the affected node;
- refreshing a changed source version invalidates stale patch plans;
- successful verified writes advance only the applied node's synchronization cursor;
- session telemetry exposes revision, command count, and transition count;
- Source Sync includes a recent transition audit;
- tests cover workspace switching, transition aggregation, undo/redo provenance, stale-plan invalidation, and synchronization cursors.

## VS-009: Visual source-binding manager

**Goal:** let users create and repair source bindings without manually editing UI IR JSON or allowing Afrodite to guess arbitrary code targets.

Acceptance criteria:

- inspect repository path, framework, adapter, component identity, export, and stable marker in Studio;
- discover candidate JSX targets through the selected framework adapter;
- show confidence and ambiguity diagnostics without silently choosing a target;
- add or update `data-afrodite-id` through an exact reviewed patch;
- store binding changes as reversible session commands;
- invalidate source plans when a binding changes;
- support assisted binding for previously unbound nodes;
- keep target discovery and patch planning framework-specific behind adapter contracts.
