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
- one-file, one-export bounded import without module execution or bundler startup;
- recovery of native elements, component references, static props, stable markers, hierarchy, and basic inline/Tailwind layout;
- conditional rendering, multiple returns, iteration, calls, fragments, text, dynamic expressions, and server modules preserved as read-only regions;
- authenticated import route and Studio Screen Import workbench;
- command-engine enforcement against read-only mutations.

## VS-012: Bounded multi-file import graph — complete

**Goal:** expand an explicitly selected screen through imported child components while retaining deterministic limits and provenance.

Delivered:

- asynchronous graph orchestration over framework-specific import adapters;
- fixed-root source access through an abstract provider;
- direct relative TSX/JSX resolution for default and named imports;
- recursive local component expansion without executing target modules;
- instance-scoped node IDs and per-file provenance;
- cycle detection and explicit graph boundaries;
- hard file, node, graph-depth, and syntax-depth budgets;
- `all-local`, `explicit`, include, and stop controls;
- structured `expanded`, `boundary`, `cycle`, `missing`, `budget`, and `failed` edge outcomes;
- Studio graph review and tests for recursion, cycles, uniqueness, and budgets.

Current boundary:

- aliases, package exports, barrel re-exports, lazy loaders, routers, and provider trees remain boundaries;
- expanded definitions are semantic inspection children rather than executable preview bundles.

## VS-013: Atomic multi-file verified transactions — complete

**Goal:** apply one reviewed semantic change across several existing source files through one staged compare-and-swap transaction with complete rollback.

Delivered:

- deterministic transaction identities over sorted plans and shared verification;
- approval bound to transaction ID and every reviewed source version;
- preflight reads, filesystem staging, compare-and-swap commits, and shared verification;
- reverse-order rollback after commit or required-verification failure;
- explicit `applied`, `rejected`, `rolled-back`, and `rollback-failed` outcomes;
- authenticated plan/apply routes;
- exact per-file diff review in Studio;
- tests for stale sources, verification rollback, partial commits, duplicate targets, and staging.

Current boundary:

- targets must already exist and remain unique;
- same-file plan merging, file creation/deletion, import insertion, and crash recovery are deferred.

## VS-014: Responsive variants and component states — complete

**Goal:** represent breakpoint and interaction-state intent in Semantic UI IR and materialize owned variants without flattening runtime behavior.

Delivered:

- optional responsive and state overrides separate from base layout;
- explicit pixel ranges and stable variant IDs;
- `hover`, `focus`, `disabled`, `loading`, and `error` states;
- deterministic effective-layout preview;
- reversible variant commands and ownership checks;
- Tailwind variant materialization and generated CSS Module regions;
- explicit blocking for unsupported inline or unscoped token variants;
- bridge planning, transaction support, Studio workbench, and tests.

Current boundary:

- breakpoint names are local IDs rather than imported project configuration;
- compound states and runtime loading/error logic remain source-controlled;
- dynamic class helpers remain read-only.

## VS-015: Constrained semantic operation API — complete

**Goal:** expose project-aware automation as validated semantic operations that reuse UI IR ownership, adapters, diagnostics, and verified-write boundaries.

Delivered:

- framework-neutral `@afrodite/semantic-ops`;
- deterministic semantic plan IDs and UI-document versions;
- API v1 commands `convert_to_grid`, `create_responsive_variant`, `replace_spacing_with_token`, and `explain_unpatchable_region`;
- exact node-ID targeting with read-only, binding, ownership, and capability checks;
- explicit `ready`, `blocked`, and `informational` statuses;
- explicit `document-and-source`, `document-only`, and `informational` application modes;
- typed style or variant intents with no text edits, offsets, shell commands, or approval decisions;
- source planning through existing project-bridge strategies and server-owned patch storage;
- authenticated `/api/semantic/plan` route;
- stale-document protection for reviewed UI IR mutations;
- Studio Semantic API workbench with separate document and source approvals;
- planner and bridge integration tests.

Current boundary:

- one explicit target node is handled per command;
- no natural-language parser belongs to the trusted core;
- no command may invent a binding, marker, ownership scope, or target;
- token replacement only remaps existing design-token ownership;
- semantic batching remains deferred.

## VS-016: Policy-controlled MCP agent gateway — complete

**Goal:** expose semantic inspection and planning to MCP hosts without giving agents direct filesystem, shell, write, transaction, or approval-decision authority.

Delivered:

- framework-neutral `@afrodite/agent-gateway-core` policy engine;
- a bounded operation catalog shared by MCP and future agent transports;
- sanitized Semantic UI IR inspection with prop-value and source-excerpt redaction;
- hard inspection depth and node budgets;
- source-plan count and diff-size limits;
- dry-run semantic planning through the existing authenticated project bridge;
- process-local plan provenance so an agent cannot invent approval targets;
- pending/expired human approval requests with no approve method;
- bounded in-memory audit events for succeeded, denied, and failed calls;
- local MCP stdio server using the stable v1 TypeScript SDK line;
- exactly six read/plan/request tools and no apply/write/shell tools;
- bridge token loading from environment without tool-result exposure;
- one explicitly selected UI IR snapshot loaded into memory at startup;
- core redaction, policy, limit, approval-request, and MCP-surface tests;
- setup and threat-model documentation in `docs/agent-gateway.md`.

Current boundary:

- the document is a startup snapshot rather than a live project-session subscription;
- approval requests are process-memory records and disappear on restart;
- Studio does not yet provide a shared approval inbox;
- agents plan one command at a time;
- audit persistence and signed actor identities are deferred.

## VS-017: Live agent review session

**Goal:** connect MCP dry runs to the active Studio project session and a durable human review inbox without expanding agent authority.

Planned acceptance criteria:

- expose the active project-session document through a read-only session provider instead of a startup JSON snapshot;
- persist approval requests outside the MCP process;
- show semantic document effects and exact source diffs in a Studio review inbox;
- allow only a human Studio action to approve, reject, expire, or apply a request;
- invalidate requests when document or source versions become stale;
- retain actor, session, policy, command, plan, decision, verification, and rollback provenance;
- keep MCP free of apply, approval-decision, filesystem, and shell tools.
