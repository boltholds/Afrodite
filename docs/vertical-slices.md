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
- nested CSS, dynamic class helpers, and token creation remain read-only or deferred.

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

## VS-013: Atomic multi-file verified transactions — complete

**Goal:** apply one reviewed semantic change across component, stylesheet, token, and other existing source files through one staged compare-and-swap transaction with complete rollback.

Delivered:

- deterministic `MultiFileTransactionPlan` identities over sorted file plans and shared verification;
- approval bound to the transaction ID and the complete reviewed path/source-version set;
- preflight re-read of every target before staging and again before each commit;
- rejection of stale files, unchanged targets, duplicate paths, or blocked adapter plans before a complete commit;
- filesystem staging of every final file body into temporary sibling files before the first source replacement;
- compare-and-swap commit of staged files;
- shared verification deduplicated across all adapter plans and run once after every commit;
- reverse-order rollback of every committed file after commit failure or required verification failure;
- compare-and-swap rollback that refuses to overwrite later independent changes;
- explicit `applied`, `rejected`, `rolled-back`, and `rollback-failed` transaction results;
- authenticated `/api/transaction/plan` and `/api/transaction/apply` bridge routes;
- semantic `layout`, `style`, and `variant` operation input with no browser-authored edits, staging paths, or verification commands;
- exact per-file unified diff review and one approval covering every source version;
- Studio Transactions workbench with shared verification review and per-file before/after/restored versions;
- tests for success, stale-source rejection, verification rollback, partial-commit rollback, duplicate-target refusal, filesystem staging, and bridge integration.

Current boundary:

- transaction targets must already exist;
- one deterministic adapter plan is allowed per target file;
- same-file plan merging, file creation/deletion, import insertion, and component extraction are deferred;
- the transaction is logically all-or-rollback while the bridge process is alive, but a process or machine crash between file replacements is not yet recoverable.

## VS-014: Responsive variants and component states — complete

**Goal:** represent breakpoint and interaction-state intent in Semantic UI IR and materialize owned variants through style adapters without flattening runtime behavior.

Delivered:

- optional `UiNode.variants` with partial responsive and state layout overrides;
- pixel `minWidth`/`maxWidth` breakpoint ranges with stable IDs and validation;
- `hover`, `focus`, `disabled`, `loading`, and `error` state variants;
- duplicate-ID, duplicate-state, empty-override, and invalid-range validation;
- deterministic effective-layout resolution for viewport and selected preview states;
- reversible `createVariantsCommand` with source-backed read-only enforcement;
- framework-neutral `@afrodite/variants-core` registry and operation contracts;
- explicit ownership validation for every property changed by a variant;
- React and SolidJS static Tailwind variant materialization;
- generated, replaceable CSS Module variant regions for media queries and state selectors;
- explicit blocking diagnostics for static inline and unscoped design-token variants;
- authenticated `/api/variant/plan` bridge route;
- semantic `variant` operations inside atomic multi-file transactions;
- Studio Variants workbench with semantic preview, selected viewport/states, exact diff approval, verification, and rollback;
- tests for UI IR validation, reversible commands, effective layout, Tailwind/CSS Module output, unsupported strategies, bridge planning, and multi-file transactions;
- architecture and trust-boundary documentation in `docs/responsive-state-variants.md`.

Current boundary:

- breakpoint names are local IDs over explicit pixel ranges rather than imported project breakpoint configuration;
- compound state combinations do not have separate override records;
- loading/error variants do not create application state logic;
- dynamic class helpers remain read-only;
- inline and design-token variants require future deterministic selector/runtime scopes;
- manual browser visual inspection remains separate from CI verification.

## VS-015: Constrained semantic operation API

**Goal:** expose project-aware AI and automation commands as validated semantic operations that reuse UI IR ownership, adapters, transactions, diagnostics, and approval rather than rewriting files directly.

Planned acceptance criteria:

- define versioned operations such as `convert_to_grid`, `create_responsive_variant`, `replace_spacing_with_token`, and `explain_unpatchable_region`;
- resolve every target through existing node IDs and source bindings;
- provide dry-run effects, capability checks, and human-readable explanations;
- require exact diff approval before any source write;
- group multi-file effects through the VS-013 transaction boundary;
- keep unsupported or ambiguous commands read-only with structured diagnostics;
- expose the same operation API to Studio and future MCP/agent adapters.
