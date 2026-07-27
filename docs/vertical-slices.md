# Vertical slices

## VS-001: Semantic canvas bootstrap — complete

**Goal:** render and edit a framework-neutral UI document.

Delivered framework-neutral `UiDocument` rendering, synchronized hierarchy/canvas/inspector selection, reversible layout commands, undo/redo, serialization, persistence, and structured diagnostics.

## VS-002: SolidJS component indexing — complete

**Goal:** build a component catalog without executing project code.

Delivered TypeScript compiler-based SolidJS discovery, barrel export resolution, typed props/defaults/source locations, serializability metadata, deterministic catalog JSON, and explicit diagnostics.

## VS-003: Visual composition with real components — complete

**Goal:** place indexed components in UI IR and render them through an isolated preview host.

Delivered catalog and preview protocols, Studio component library, reversible source-bound component insertion, and an opaque-origin trusted runtime registry.

## VS-003.5: Framework adapter foundation — complete

**Goal:** remove SolidJS assumptions from extension and safe-write boundaries.

Delivered `@afrodite/framework-core`, independent React/Solid identities, framework metadata across UI IR/catalogs/previews/bindings, and explicit unsupported-runtime diagnostics.

## VS-004: Framework-neutral safe source patch — complete

**Goal:** turn a visual edit into an approved and verified source patch.

Delivered deterministic versions and plan IDs, path/bounds/overlap/stale-source validation, unified diffs, approval bound to plan and source version, compare-and-swap writes, verification, rollback, and the first SolidJS inline-layout patcher.

## VS-005: React indexing and preview parity — complete

Delivered static React indexing, exported component and re-export discovery, serializable prop metadata, trusted React preview, and framework-qualified bindings.

## VS-006: React source patch parity — complete

Delivered React layout patch planning, unique stable-marker targeting, React inline-style casing, unrelated behavior preservation, and refusal on dynamic or ambiguous owned syntax.

## VS-007: Studio source synchronization workflow — complete

Delivered an authenticated localhost project bridge, fixed-root source reads, server-held patch plans, Source Sync workspace, exact diff review, explicit approval, verification, write results, and rollback output.

## VS-008: Live Studio project session — complete

Delivered one Canvas/Source Sync document, selection, command history, revision, source state, exact layout transitions, undo/redo provenance, transition aggregation, stale-plan invalidation, and per-node synchronization cursors.

## VS-009: Visual source-binding manager — complete

Delivered framework-neutral binding contracts, static JSX candidate discovery, manual target selection with source context, verified stable-marker installation, reversible binding commands, and rejection of stale, duplicate, dynamic, server-only, or ambiguous targets.

## VS-010: Style ownership and strategy adapters — complete

Delivered explicit `SourceBinding.styleOwnership`, style strategy registry, React/Solid inline strategies, static Tailwind, flat CSS Modules, existing design tokens, verified `update-style` plans, reversible ownership commands, and Studio ownership review.

Current boundary: nested CSS, dynamic class helpers, and token creation remain read-only or deferred.

## VS-011: Existing screen import — complete

Delivered static one-file/one-export import, source-region provenance, editable/requires-binding/read-only modes, native and component hierarchy recovery, static props/markers/basic layout, unsupported control flow preserved as source-backed boundaries, authenticated import, and Studio review.

## VS-012: Bounded multi-file import graph — complete

Delivered bounded recursive local component expansion, direct relative TSX/JSX resolution, instance-scoped IDs, cycle detection, explicit graph boundaries, file/node/depth budgets, include/stop controls, and structured edge outcomes.

Current boundary: aliases, package exports, barrel re-exports, lazy loaders, routers, and provider trees remain boundaries.

## VS-013: Atomic multi-file verified transactions — complete

Delivered deterministic transaction IDs, approval bound to every source version, preflight reads, staging, compare-and-swap commits, shared verification, reverse-order rollback, explicit outcomes, authenticated routes, Studio per-file review, and stale/rollback/duplicate/staging tests.

Current boundary: targets must already exist and remain unique; same-file merging, creation/deletion, import insertion, and crash recovery are deferred.

## VS-014: Responsive variants and component states — complete

Delivered responsive/state overrides separate from base layout, explicit ranges and stable IDs, hover/focus/disabled/loading/error states, effective-layout preview, reversible commands, Tailwind and generated CSS Module materialization, bridge/transaction support, and Studio review.

## VS-015: Constrained semantic operation API — complete

Delivered `@afrodite/semantic-ops`, deterministic semantic plan/document versions, typed API v1 commands, exact node targeting, capability and ownership checks, ready/blocked/informational results, document/source separation, server-owned source planning, authenticated planning, Studio workbench, and tests.

Current boundary: one typed command and one explicit target per request; natural-language parsing does not belong to the trusted core.

## VS-016: Policy-controlled MCP agent gateway — complete

Delivered bounded sanitized inspection, operation catalog, policy and redaction, inspection and dry-run budgets, semantic planning through project bridge, approval-request provenance, audit events, six read/plan/request MCP tools, environment-only bridge token handling, and threat-model tests/documentation.

The gateway exposes no filesystem, shell, write, apply, approval-decision, commit, or merge tools.

## VS-017: Live agent review session — complete

Delivered live Studio snapshot publishing, durable `.afrodite/collaboration.json` review storage, agent planning against the current document, authenticated review routes, expiry/stale/repeated-decision rejection, Human Review Inbox, independent human approve/reject decisions, MCP status observation, and persistence tests.

The page-reload and expiring original-plan application limitations were replaced by VS-018.

## VS-018: Reviewed execution orchestration — complete

**Goal:** execute an approved request through fresh deterministic planning while keeping approval separate from execution.

Delivered:

- authenticated fresh-preparation and execution-record routes;
- re-planning of the original typed command against current Studio and source state;
- new server-held source plans for every preparation;
- deterministic approved-vs-fresh document/source comparison;
- preparation identity bound to live session ID, revision, and document version;
- a second explicit human confirmation;
- stale-session and expired-plan rejection;
- verified single-file source application;
- browser-local project-session registry;
- reversible replace-document command receipts;
- durable applied/document-only/source-only/partial/failed outcomes;
- strict receipt validation and failed/partial retry history;
- Studio exact-match/drift review UI;
- architecture documentation in `docs/reviewed-execution.md`.

The single-source execution boundary was replaced by VS-019.

## VS-019: Reviewed multi-file execution transaction — complete

**Goal:** bind fresh multi-file semantic effects to one reviewed transaction, one second confirmation, shared verification, complete rollback, and one durable execution receipt.

Delivered:

- semantic orchestration that groups several source intents into one bridge-owned transaction;
- one transaction preview containing every exact file diff, plan ID, source version, diagnostic, and shared verification step;
- fresh preparations that persist the transaction beside the semantic plan and approved-vs-fresh comparison;
- confirmation bound to preparation ID, transaction ID, live revision, and every source version;
- Studio atomic transaction review and one-button execution;
- staged compare-and-swap commits through the VS-013 transaction service;
- UI IR application only after the complete source transaction returns `applied`;
- browser rejection from manufacturing per-file transaction receipts;
- project-bridge validation and normalization of one shared transaction result into durable per-plan provenance;
- complete rollback recorded as failed with no durable source effect;
- rollback-failed inspection that records remaining changed files and derives a truthful partial outcome;
- retry history followed by a complete fresh re-plan and second confirmation;
- protocol, applied, forged-receipt, transaction-ID, rollback, and rollback-failed tests;
- documentation in `docs/reviewed-multifile-execution.md`.

Current boundary:

- semantic API v1 still accepts one typed command; only commands that produce several source intents enter this path;
- duplicate same-file source plans remain blocked rather than merged;
- plans and transactions retain finite in-memory TTL;
- crash recovery across project-bridge process failure is not journaled;
- a network failure after effects but before receipt persistence may require manual reconciliation;
- reviewer identity is authenticated by the local bridge token rather than a signed account;
- manual browser and MCP Inspector end-to-end testing remains outstanding.

## VS-020: Typed semantic batches

**Goal:** combine several explicit typed semantic commands into one deterministic reviewed operation without introducing natural-language ambiguity or direct agent write authority.

Planned acceptance criteria:

- accept an ordered bounded list of existing typed commands;
- validate every target and capability against the same input document;
- detect conflicting document mutations and duplicate source ownership before planning;
- produce one combined `documentAfter` with deterministic command provenance;
- combine distinct source effects into one reviewed transaction;
- reject ambiguous ordering, same-field conflicts, same-file unmergeable plans, and partial target resolution;
- expose one dry run and one human review request while keeping MCP free of execution authority.
