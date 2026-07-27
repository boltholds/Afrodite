# Afrodite

Afrodite is a Git-native visual frontend IDE that keeps semantic UI structure and production code synchronized through minimal, reviewable, and verified changes.

## Current capabilities

Afrodite can:

1. render and edit a framework-neutral `UiDocument`;
2. statically index SolidJS and React components without executing project modules;
3. compose trusted components through an isolated preview host;
4. preserve framework-qualified source bindings;
5. create and repair stable JSX bindings through exact reviewed patches;
6. record reversible visual commands and source provenance;
7. declare which layout properties Afrodite owns and how they are represented in source;
8. patch React and SolidJS inline styles safely;
9. patch static Tailwind classes, flat CSS Module rules, and existing design tokens;
10. show exact unified diffs, require approval, verify writes, and roll back failures;
11. import existing React or SolidJS screens into Semantic UI IR without executing them;
12. expand bounded graphs of direct local JSX components with cycle detection and deterministic budgets;
13. preserve unsupported behavior and unresolved imports as source-backed boundaries;
14. apply several existing source-file changes through one reviewed staged transaction and shared verification boundary;
15. represent responsive breakpoints and `hover`, `focus`, `disabled`, `loading`, and `error` states independently from base layout;
16. materialize owned variants through static Tailwind utilities or generated CSS Module regions;
17. plan constrained project-aware semantic operations without granting automation direct code-edit authority;
18. expose semantic inspection, dry runs, and human approval requests through a policy-controlled local MCP gateway.

## Architecture

Shared editor code remains framework-neutral.

- `@afrodite/ui-ir` defines semantic layout, responsive/state variants, source bindings, style ownership, and source-backed regions.
- `@afrodite/framework-core` defines framework adapters, source operations, deterministic patch plans, diagnostics, and verification steps.
- `@afrodite/binding-core` discovers source targets and plans stable-marker installation.
- `@afrodite/style-core` maps semantic base layout to inline styles, Tailwind utilities, CSS Modules, or design tokens.
- `@afrodite/variants-core` resolves effective variant layout and materializes owned responsive/state overrides.
- `@afrodite/import-core` reconstructs bounded existing screens through syntax-specific import adapters.
- `@afrodite/import-core/graph` follows direct local component imports through a provider-controlled, budgeted graph.
- `@afrodite/semantic-ops` turns API v1 commands into deterministic UI-document effects and typed style or variant intents.
- `@afrodite/agent-gateway-core` applies agent policy, redaction, inspection budgets, dry-run limits, approval-request rules, and audit records.
- `@afrodite/verified-write` provides single-file and multi-file approval, staging, compare-and-swap writes, verification, and rollback.
- `@afrodite/project-session` keeps Canvas and Source Sync inside one command history and provenance timeline.

React and SolidJS use separate adapter identities. They currently share static JSX binding and screen-import implementations while keeping framework-specific runtime and source-style behavior behind adapters.

## Safe source synchronization

```text
visual or semantic operation
  -> explicit source binding and ownership
  -> framework, style, or variant strategy adapter
  -> deterministic SourcePatchPlan
  -> exact unified diff
  -> approval bound to planId + sourceVersion
  -> compare-and-swap write
  -> formatter/typecheck/test/build verification
  -> applied result or rollback
```

Afrodite does not accept browser- or agent-authored text edits, offsets, staging paths, or verification commands. The local project bridge owns source reads, patch storage, filesystem access, process execution, and verified writes.

## Constrained semantic operation API

The semantic API currently supports:

```text
convert_to_grid
create_responsive_variant
replace_spacing_with_token
explain_unpatchable_region
```

A command resolves one existing UI IR node, checks read-only state, binding, stable marker, style ownership, and adapter capability, then returns one of:

```text
ready
blocked
informational
```

Document effects and source effects remain separate. A plan may be `document-only` when the semantic change is valid but Afrodite cannot prove authority over production source.

Automation cannot invent a target, binding, marker, ownership scope, source replacement, shell command, or approval. See `docs/semantic-operations.md`.

## Policy-controlled MCP agent gateway

The local stdio gateway exposes exactly these tools:

```text
afrodite_list_semantic_operations
afrodite_inspect_policy
afrodite_inspect_document
afrodite_plan_semantic_operation
afrodite_request_human_approval
afrodite_get_approval_request
```

The gateway deliberately exposes no filesystem, shell, arbitrary source-read, patch-apply, transaction-apply, commit, merge, or approval-decision tools.

Its default policy:

- redacts prop values and source excerpts;
- limits inspection to depth 8 and 250 nodes;
- limits one dry run to 8 source plans and 80,000 diff characters;
- loads one explicitly selected Semantic UI IR snapshot at startup;
- keeps the project bridge token private to the process;
- records a bounded in-memory audit trail;
- allows approval requests to remain only `pending` or `expired`.

An MCP host or model may request human review, but it cannot approve or apply its own plan. See `docs/agent-gateway.md`.

## Atomic multi-file transactions

Several server-generated source plans can be grouped into one deterministic transaction:

```text
semantic layout/style/variant operations
  -> one adapter plan per target file
  -> exact diff for every file
  -> approval bound to transactionId + every source version
  -> preflight read of every target
  -> stage every final file body
  -> compare-and-swap commit
  -> one shared verification sequence
  -> keep every file or restore every committed file
```

The boundary is logically all-or-rollback while the project bridge process remains alive. Crash recovery across a process or machine failure is still deferred. See `docs/multi-file-transactions.md`.

## Existing screen import

The importer performs bounded static analysis only. It never imports target modules, starts Vite, calls hooks, evaluates conditions, fetches data, or runs package scripts.

Unsupported conditions, calls, iterations, fragments, dynamic expressions, multiple return paths, server-only modules, aliases, packages, lazy loaders, and unresolved imports remain explicit read-only boundaries with source provenance.

See `docs/existing-screen-import.md` and `docs/multi-file-screen-import.md`.

## Workspace

- `apps/studio` — Canvas, Source Sync, Binding Manager, Style Ownership, Variants, Screen Import, Transactions, and Semantic API workbenches.
- `apps/preview-host` — opaque-origin trusted SolidJS and React component preview.
- `apps/project-bridge` — authenticated localhost source, import, planning, verified-write, transaction, and rollback service.
- `apps/agent-gateway` — policy-controlled MCP stdio adapter over the semantic planning boundary.
- `packages/ui-ir` — Semantic UI IR, variants, bindings, ownership, and provenance contracts.
- `packages/canvas-engine` — reversible document commands and read-only enforcement.
- `packages/project-session` — live session state and transition provenance.
- `packages/framework-core` — framework and patch-plan contracts.
- `packages/binding-core` — target discovery and stable-marker plans.
- `packages/style-core` — base style ownership strategies.
- `packages/variants-core` — responsive/state resolution and source materialization strategies.
- `packages/import-core` — bounded screen and component-graph import.
- `packages/semantic-ops` — constrained semantic command planner.
- `packages/agent-gateway-core` — agent policy, redaction, dry-run, approval-request, and audit layer.
- `packages/verified-write` — approval, staging, compare-and-swap, verification, and rollback.
- `packages/adapter-solid` and `packages/adapter-react` — framework identities and adapter factories.
- `packages/project-indexer` and `packages/indexer-react` — static component catalogs.
- `packages/protocol` — catalog, preview, bridge, binding, style, variant, import, transaction, and semantic schemas.

## Development

```bash
corepack enable
pnpm install
pnpm dev
```

`pnpm dev` starts Studio on `4173` and preview host on `4174`.

Start project bridge in another terminal:

```bash
pnpm dev:bridge --project ./path/to/project
```

Start the MCP gateway with the bridge token and an explicit document snapshot:

```bash
export AFRODITE_BRIDGE_TOKEN='<local bridge token>'

pnpm dev:agent \
  --document ./screen.afrodite.json \
  --bridge-url http://127.0.0.1:4175 \
  --actor codex
```

Verification:

```bash
pnpm typecheck
pnpm test
pnpm build
```
