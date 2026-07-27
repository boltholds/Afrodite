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

Delivered bounded sanitized inspection, operation catalog, policy and redaction, inspection and dry-run budgets, semantic planning through project bridge, approval-request provenance, audit events, read/plan/request MCP tools, environment-only bridge token handling, and threat-model tests/documentation.

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

Delivered semantic position/radius fields, reversible delete/move/radius/text/duplication/composite commands, deterministic keyboard navigation, semantic clipboard, drag and held-wheel gestures, inline text editing, Inspector and JSON editing, and one browser-local project-session history shared with Source Sync.

Current boundary: single selection, no snapping/guides/resize handles, process-local clipboard, and document-owned position/radius/text/delete/paste.

## VS-021: Semantic Motion and JSON Inspector — complete

**Goal:** represent, preview, and edit animation intent through typed UI IR clips and reversible JSON-backed commands.

Delivered typed triggers, timelines, tracks and keyframes, strict validation, reversible animation commands, deterministic single-clip playback, a visual Motion workspace, and Animation JSON editing over the same UI IR.

The single-selected-clip preview and document-only source boundary were extended by VS-023.

## VS-022: Typed semantic batches — complete

**Goal:** combine several explicit typed semantic commands into one deterministic reviewed operation without introducing natural-language ambiguity or direct agent write authority.

Delivered bounded independent preflight, semantic/source conflict detection, ordered document composition, deterministic batch IDs, one patch or one atomic transaction, Studio batch review, durable batch requests, separate human decision/application, policy-controlled MCP batch tools, and core/protocol/bridge/gateway tests.

Current boundary: semantic API v1 only, same-file writes rejected rather than merged, exact version-bound review without fresh batch re-planning, and no durable batch execution history.

## VS-023: Composed semantic motion and CSS source adapters — complete

**Goal:** add reusable animations, preview several clips on one object, and materialize only proven motion behavior into existing CSS without inventing runtime state.

Delivered backward-compatible priority/blend fields, deterministic multi-clip composition, reusable presets, clip duplication, a Studio compositor, generated CSS keyframes and animation lists, bounded mount/hover/focus/data-state mappings, source channel conflict detection, exact diff review, compare-and-swap writes, verification, rollback, and motion-specific tests.

Current boundary: existing CSS Module ownership is required; source composition is replace-only; manual/click wiring and runtime animation libraries remain unsupported; motion writes remain single-file.

## VS-024: Isolated motion runtime verification — complete

**Goal:** prove that generated and semantic motion resolve to the same observable browser result without executing target application business logic.

Delivered:

- a dedicated typed motion-verification protocol channel separate from ordinary component rendering;
- version-bound manifests containing exact plan/source versions, managed clips, generated CSS region, deterministic fingerprint, and random challenge;
- bounded same-trigger mount, hover, focus, and explicit `data-state` scenarios;
- removal/baseline verification with zero active animations;
- deterministic sample times derived by project bridge;
- a static closed Shadow DOM fixture that never renders target React/Solid components;
- forbidden external-resource and executable CSS checks;
- deterministic pseudo-class activation inside the sandbox copy of the generated region;
- paused CSSAnimation sampling through `currentTime`;
- computed opacity, transform matrix, border radius, background color, and animation-count evidence;
- comparison against `resolveMotionComposition` with explicit browser-rounding tolerances;
- structured per-sample expected/actual differences;
- Studio evidence review through an opaque-origin `sandbox="allow-scripts"` iframe;
- server-side validation of the complete exact scenario/sample set;
- evidence bound to `planId + sourceVersion + CSS fingerprint + challenge`;
- `/api/motion/runtime-evidence` and evidence-required `/api/motion/apply`;
- protocol, bridge, fingerprint, completeness, apply-gating, matrix, and tolerance tests;
- documentation in `docs/isolated-motion-runtime-verification.md`.

Current boundary:

- up to eight managed clips per plan;
- scenarios group clips by one exact trigger rather than cross-trigger cascade combinations;
- hover/focus use deterministic sandbox attributes rather than native pointer automation;
- evidence is observational local-browser verification, not cryptographic attestation;
- evidence remains process-memory state and expires with its plan or bridge restart;
- no screenshot, geometry, performance, accessibility, reduced-motion, Playwright, or cross-browser verification;
- manual browser end-to-end verification remains outstanding.

## VS-025: Persistent motion ownership and cross-trigger composition

**Goal:** persist reviewed motion authority and verify the real cascade of compatible mount, hover, focus, and state animations before integrating motion into semantic batches and transactions.

Planned acceptance criteria:

- add explicit `SourceBinding.motionOwnership` with reversible Studio assignment and source provenance;
- compose bounded cross-trigger scenario combinations rather than testing one exact trigger group at a time;
- add reduced-motion policy and source representation;
- invalidate ownership and runtime evidence on binding/class/stylesheet drift;
- integrate motion intents into typed semantic batches and multi-file transactions;
- retain agent read/plan/request authority without approve/apply access;
- add real Playwright browser E2E for the isolated evidence workflow.
