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

Delivered authenticated fresh preparation, current-state re-planning, deterministic approved-vs-fresh comparison, second human confirmation, stale and expiry checks, reversible UI IR application, durable outcomes, strict receipt validation, retry history, Studio review, and architecture documentation.

The single-source execution boundary was replaced by VS-019.

## VS-019: Reviewed multi-file execution transaction — complete

**Goal:** bind fresh multi-file semantic effects to one reviewed transaction, one second confirmation, shared verification, complete rollback, and one durable execution receipt.

Delivered bridge-owned transaction planning, exact file previews and versions, confirmation bound to preparation/transaction/live revision/source versions, staged compare-and-swap execution, document application only after source success, browser receipt forgery rejection, server receipt normalization, truthful rollback and rollback-failed outcomes, retry history, tests, and documentation.

Current boundary: duplicate same-file plans remain blocked; plans retain finite TTL; crash recovery is not journaled; reviewer identity remains local-token based; browser/MCP Inspector E2E remains outstanding.

## VS-020: Manual interaction kernel — complete

**Goal:** make the active project session fully controllable by a human through keyboard, pointer, wheel, object clipboard, Inspector fields, and JSON while preserving one reversible command history.

Delivered:

- semantic optional `position.x/y` and `appearance.borderRadius` fields in UI IR and JSON;
- reversible delete, move, corner-radius, text, duplication, and composite gesture commands;
- deterministic depth-first Tab and Shift+Tab navigation;
- Delete/Backspace removal with root and read-only protection;
- arrow-key movement at 1 px and Shift+arrow movement at 10 px;
- Ctrl/Cmd+C and Ctrl/Cmd+V semantic object clipboard;
- fresh recursive IDs, 16 px paste offset, and source-authority removal for duplicates;
- Ctrl/Cmd+Z, Ctrl/Cmd+Y, and Ctrl/Cmd+Shift+Z history control;
- Enter, F2, and best-effort Ctrl/Cmd+L inline editing for static text props or node name;
- pointer capture, transient drag preview, Escape cancellation, and one command per completed gesture;
- held-pointer wheel corner-radius adjustment with 1 px or Shift 5 px steps;
- one composite history entry when movement and rounding occur in the same gesture;
- Inspector controls for position, radius, layout, sizing, and text;
- JSON editing over the same UI IR rather than a parallel state model;
- a manual Canvas and the existing Source Sync/Binding Manager sharing one browser-local `LiveProjectSessionState`;
- unit tests for deletion/restore, composite gestures, static text editing, safe duplication, and read-only refusal;
- documentation in `docs/manual-interaction.md`.

Current boundary:

- single selection only; marquee and multi-selection are deferred;
- no snapping, alignment guides, resize handles, or parent-bound drag constraints;
- object clipboard is process-local rather than an OS structured clipboard format;
- browsers may reserve Ctrl/Cmd+L, so Enter and F2 are guaranteed alternatives;
- position, radius, text, delete, and paste remain document-owned until dedicated source adapters exist;
- manual browser end-to-end verification remains outstanding.

## VS-021: Semantic Motion and JSON Inspector — complete

**Goal:** represent, preview, and edit animation intent through typed UI IR clips and reversible JSON-backed commands.

Delivered:

- optional `UiNode.animations` under schema version 1 with backward compatibility;
- typed mount, hover, focus, click, semantic-state, and manual triggers;
- duration, delay, easing, iterations, direction, and fill timeline settings;
- opacity, X/Y translation, scale, rotation, radius, and background-color tracks;
- strict keyframe offset ordering and value-type validation;
- unique track identities and one track per property inside a clip;
- reversible create, replace, upsert, and delete animation commands;
- exact restoration of animation absence through undo;
- deterministic delay/fill/iteration/direction/easing resolution;
- numeric interpolation and explicit discrete background-color behavior;
- a Studio Motion workspace over the active browser-local project session;
- node and clip navigation, visual timeline fields, property tracks, keyframe values, play/pause/restart, and playhead scrubbing;
- an Animation JSON panel editing exactly `selectedNode.animations`;
- one reversible command for valid JSON and exact validation paths for invalid JSON;
- UI IR round-trip, schema rejection, command, undo, interpolation, fill, and direction tests;
- documentation in `docs/semantic-motion.md`.

Current boundary:

- triggers are declarative and do not synthesize runtime event handlers or application state;
- background colors switch discretely rather than interpolating through a color space;
- preview resolves one selected clip rather than composing simultaneous clips;
- no spring, cubic-bezier, path-motion, or audio timeline model;
- no CSS keyframe, Web Animations, Motion One, Framer Motion, GSAP, React, or Solid source adapter;
- animation remains document-owned until a capability adapter proves source ownership;
- manual browser end-to-end verification remains outstanding.

## VS-022: Typed semantic batches — complete

**Goal:** combine several explicit typed semantic commands into one deterministic reviewed operation without introducing natural-language ambiguity or direct agent write authority.

Delivered:

- `@afrodite/semantic-ops/batch` with a hard default maximum of sixteen commands;
- independent command preflight against one immutable input document;
- rejection of informational and independently blocked commands;
- deterministic same-field semantic write keys and early conflict diagnostics;
- ordered composition into one exact `documentAfter` with per-step before/after document versions;
- deterministic batch IDs over input version, commands, document result, and typed source intents;
- actual source-target resolution for JSX, CSS Module stylesheet, and design-token files;
- rejection of duplicate actual source targets until same-file merging is proven;
- explicit `document-and-source`, `document-only`, and `mixed` application modes;
- shared protocol schemas for batch planning and durable batch review;
- authenticated `/api/semantic/batch/plan` planning through project bridge;
- one server-held patch for one source effect or one bridge-owned transaction for multiple distinct files;
- Studio **Batches** review of ordered steps, diagnostics, exact diffs, transaction, and combined document;
- source-first execution and one reversible replace-document command only after complete source success;
- durable `.afrodite/semantic-batch-reviews.json` with stale/expiry/one-decision checks;
- separate human approve/reject and exact apply actions;
- three policy-controlled MCP tools for batch dry run, review submission, and status observation;
- process-local batch provenance plus command/source/diff budgets;
- explicit absence of MCP apply, execute, source-write, or approval-decision tools;
- core, protocol, bridge, durable-store, gateway-policy, MCP-surface, strategy-target, stale, and conflict tests;
- documentation in `docs/semantic-batches.md`.

Current boundary:

- commands are limited to semantic API v1 and a maximum of sixteen items;
- informational operations remain separate from mutation batches;
- same-field writes and same actual source-file intents are rejected rather than merged;
- only existing style and responsive-variant source intents are supported;
- mixed source coverage requires explicit review of document-only steps;
- batch review uses exact version-bound plans and compare-and-swap but does not yet perform fresh approved-vs-current re-planning;
- batch execution does not yet use the durable execution receipt/history model from VS-018/019;
- transaction crash journaling and manual browser/MCP Inspector E2E remain outstanding.

## VS-023: Semantic motion source adapters

**Goal:** materialize proven animation intent into existing source formats without inventing runtime state or overwriting handwritten behavior.

Planned acceptance criteria:

- add explicit motion ownership and source-capability contracts;
- support generated ownership regions for static CSS `@keyframes` and animation declarations;
- optionally support bounded Web Animations API descriptors where an existing stable runtime hook is explicitly owned;
- map only supported numeric/color tracks and timeline settings;
- require an explicit representation for hover/focus/mount/manual triggers and reject unsupported state/click behavior;
- create exact reviewed patch/transaction plans through project bridge;
- preserve handwritten keyframes, event handlers, hooks, and application state outside owned regions;
- expose source materialization in Motion Studio and semantic batch planning without granting agents write authority.
