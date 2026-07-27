# Vertical slices

## VS-001: Semantic canvas bootstrap — complete

**Goal:** prove that the editor can render and edit a framework-neutral UI document.

Delivered:

- framework-neutral `UiDocument` rendering;
- synchronized hierarchy, canvas, and inspector selection;
- reversible layout commands;
- undo, redo, serialization, persistence, and structured diagnostics.

## VS-002: SolidJS component indexing — complete

**Goal:** build a component catalog from a SolidJS workspace without executing its code.

Delivered:

- TypeScript compiler-based static discovery;
- barrel export resolution and deduplication;
- typed props, defaults, source locations, and serializability metadata;
- deterministic catalog JSON and explicit diagnostics.

## VS-003: Visual composition with real components — complete

**Goal:** place indexed components in UI IR and render them through an isolated preview host.

Delivered:

- catalog and preview protocols;
- Studio component library;
- reversible source-bound component insertion;
- opaque-origin preview host and trusted runtime registry.

## VS-003.5: Framework adapter foundation — complete

**Goal:** remove SolidJS assumptions from extension and safe-write boundaries.

Delivered:

- `@afrodite/framework-core` adapter contracts;
- independent React and SolidJS identities;
- framework metadata in UI IR, catalogs, previews, and bindings;
- explicit unsupported-runtime diagnostics.

## VS-004: Framework-neutral safe source patch — complete

**Goal:** turn a visual edit into an approved and verified source patch.

Delivered:

- deterministic source versions and patch IDs;
- path, bounds, overlap, and stale-source validation;
- exact previews and unified diffs;
- approval bound to plan and source version;
- compare-and-swap writes, verification, and rollback;
- first SolidJS inline-layout patcher.

## VS-005: React indexing and preview parity — complete

**Goal:** prove the adapter model by adding React without modifying shared editor architecture.

Delivered:

- static React component indexing;
- exported component and re-export discovery;
- serializable prop and framework metadata;
- trusted React preview through `react-dom/client`;
- framework-qualified binding preservation.

## VS-006: React source patch parity — complete

**Goal:** implement React syntax planning against the shared verified-write boundary.

Delivered:

- React layout patch planning;
- unique static stable-marker targeting;
- React inline-style casing;
- hook, callback, child, attribute, and unrelated-style preservation;
- refusal on dynamic or ambiguous owned syntax.

## VS-007: Studio source synchronization workflow — complete

**Goal:** expose safe writes as an end-to-end Studio workflow.

Delivered:

- authenticated localhost project bridge;
- fixed-root source reads and versioned snapshots;
- server-side patch-plan storage;
- Source Sync workspace;
- exact diff review, approval, verification, write results, and rollback output.

## VS-008: Live Studio project session — complete

**Goal:** make source synchronization part of the active editing session.

Delivered:

- shared Canvas and Source Sync document, selection, command history, revision, and source state;
- exact before/after layout transitions;
- undo/redo provenance;
- transition aggregation and stale-plan invalidation;
- per-node synchronization cursors.

## VS-009: Visual source-binding manager — complete

**Goal:** create and repair source bindings without manual UI IR editing or silent target guessing.

Delivered:

- framework-neutral binding contracts and registry;
- static JSX candidate discovery for React and SolidJS;
- explicit target selection with line, column, snippet, marker state, and diagnostics;
- verified stable-marker installation;
- reversible source-binding commands;
- rejection of stale, duplicate, dynamic, server-only, or ambiguous targets.

## VS-010: Style ownership and strategy adapters — complete

**Goal:** make Afrodite's style authority explicit across different source representations.

Delivered:

- `SourceBinding.styleOwnership` with exact managed properties;
- framework-neutral style strategy registry;
- React and SolidJS inline strategies;
- static Tailwind utility strategy;
- explicit flat CSS Module strategy;
- existing CSS custom-property token strategy;
- `update-style` plans through the verified-write boundary;
- reversible ownership commands and Studio workbench.

Current boundary:

- one verified source file is changed per style operation;
- nested CSS, dynamic class helpers, token creation, and multi-file atomic changes remain read-only or deferred.

## VS-011: Existing screen import — complete

**Goal:** reconstruct a bounded Semantic UI IR tree from an existing component while preserving unsupported behavior as source-backed read-only regions.

Delivered:

- `SourceRegion` provenance with framework, adapter, file, source version, export, offsets, line, column, mode, kind, excerpt, and reason;
- explicit `editable`, `requires-binding`, and `read-only` modes;
- a `source-region` UI IR node for unsupported control flow and expressions;
- `@afrodite/import-core` with adapter contracts, registry, diagnostics, and import statistics;
- shared static JSX import implementation behind separate React and SolidJS adapter identities;
- one-file, one-export bounded import without module execution, bundler startup, hook calls, data fetching, or package scripts;
- recovery of native elements, component references, static props, stable markers, hierarchy, and basic inline/Tailwind layout;
- conditional rendering, multiple return paths, iteration, calls, fragments, text, dynamic expressions, and depth limits preserved as read-only source regions;
- React `use server` modules imported as read-only;
- authenticated `/api/import/screen` project-bridge route;
- Studio Screen Import workbench with adapter/file/export controls, diagnostics, statistics, tree review, download, and explicit project-session opening;
- command-engine enforcement that rejects layout mutations against read-only regions;
- tests for UI IR validation, import behavior, adapter registration, bridge routing, server-module handling, and command safety.

## VS-012: Bounded multi-file import graph — complete

**Goal:** expand an explicitly selected screen through imported child components while retaining deterministic limits and provenance.

Delivered:

- asynchronous graph orchestration in `@afrodite/import-core/graph` over the existing framework-specific import adapters;
- fixed-root source access through an abstract `ScreenImportSourceProvider` supplied by project bridge;
- direct relative TSX/JSX resolution for default and named imports;
- recursive local component expansion without importing or executing target modules;
- instance-scoped node IDs when the same component definition is expanded more than once;
- exact `SourceRegion` provenance retained for every expanded file;
- file records and component edges with source version, export, depth, node count, target, status, and reason;
- cycle detection using the active component path, with cyclic references retained as explicit boundaries;
- hard file, node, graph-depth, and per-file syntax-depth budgets;
- depth-first node pruning that never exceeds the configured materialized-node budget;
- `all-local` and `explicit` expansion modes;
- user-defined include and stop boundaries by component name or parent-file component identity;
- structured `expanded`, `boundary`, `cycle`, `missing`, `budget`, and `failed` edge outcomes;
- external packages, aliases, barrels, namespace imports, dynamic imports, and unresolved files left unexpanded rather than guessed;
- protocol schemas for graph controls, file provenance, edges, and budget telemetry;
- Studio controls and visual review for graph budgets, files, edges, cycles, truncation, and recovered UI IR;
- tests covering recursive expansion, unique IDs, provenance, cycles, explicit boundaries, stop boundaries, file limits, node limits, depth limits, and bridge integration.

Current boundary:

- only direct relative JSX source imports are followed;
- path aliases, package exports, barrel re-exports, lazy loaders, router configuration, and provider trees remain boundaries;
- graph construction remains read-only and never modifies source;
- expanded definitions are semantic inspection children of component instances, not executable preview bundles.

## VS-013: Atomic multi-file verified transactions

**Goal:** apply one reviewed semantic operation across component, stylesheet, token, and import files as a single compare-and-swap transaction with complete rollback.

Planned acceptance criteria:

- represent several source snapshots and edit sets in one deterministic plan;
- bind approval to every file version in the transaction;
- reject the whole transaction when any source became stale;
- write through a staged commit boundary rather than independent file writes;
- run shared verification only after all staged edits are present;
- roll every changed file back when a required check fails;
- expose one combined diff and per-file verification outcome in Studio.
