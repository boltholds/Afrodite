# Afrodite

Afrodite is a Git-native visual frontend IDE that keeps semantic UI structure and production code synchronized through minimal, reviewable, and verified changes.

## Current capabilities

Afrodite can:

1. render and edit a framework-neutral `UiDocument`;
2. statically index SolidJS and React components without executing project modules;
3. render trusted components through an opaque-origin preview host;
4. preserve framework-qualified source bindings and explicit ownership;
5. create and repair stable JSX bindings through reviewed patches;
6. record reversible visual commands, provenance, and undo/redo history;
7. patch owned React/Solid inline styles, Tailwind utilities, CSS Modules, and existing design tokens;
8. import bounded existing screens and local component graphs without executing them;
9. represent responsive breakpoints and component states independently from base layout;
10. create constrained semantic operations and ordered semantic batches without granting automation direct write authority;
11. publish live Studio sessions into durable human review inboxes;
12. re-plan approved operations against current document/source versions and require a second execution confirmation;
13. apply several source effects through one staged transaction with shared verification and rollback;
14. edit through keyboard, pointer drag, object clipboard, held-wheel radius control, Inspector fields, and JSON;
15. define, duplicate, combine, and preview typed animation clips through visual controls and the same UI IR JSON;
16. generate reviewed CSS keyframes only for explicitly owned CSS Module regions;
17. verify generated motion against the semantic compositor in an isolated browser fixture before allowing the stylesheet write;
18. expose bounded semantic read/plan/review-request tools through a local MCP gateway with no apply or approval-decision capability.

## Architecture

The three sources of authority are deliberately separate:

```text
source code       authoritative for application behavior and business logic
Semantic UI IR    authoritative for visual structure, intent, bindings, ownership, variants, and motion
rendered preview  observable verification state
```

Shared editor code remains framework-neutral.

- `@afrodite/ui-ir` defines layout, manual position/appearance, animation clips, variants, source bindings, ownership, and source-backed regions.
- `@afrodite/framework-core` defines framework adapters, deterministic source plans, diagnostics, and verification steps.
- `@afrodite/binding-core` discovers static JSX targets and installs reviewed stable markers.
- `@afrodite/style-core` materializes owned base styles.
- `@afrodite/variants-core` resolves and materializes responsive/state overrides.
- `@afrodite/motion-core` creates deterministic owned CSS keyframe regions and rejects unsupported triggers, blend modes, and source-channel conflicts.
- `@afrodite/import-core` reconstructs bounded existing screens and direct local component graphs.
- `@afrodite/semantic-ops` plans constrained single commands and ordered batches.
- `@afrodite/canvas-engine` provides reversible visual, interaction, document, and motion commands plus deterministic motion composition.
- `@afrodite/project-session` keeps Canvas, Motion, Source Sync, and reviewed document effects in one history.
- `@afrodite/verified-write` provides approval, compare-and-swap writes, staging, shared verification, and rollback.
- `@afrodite/agent-gateway-core` enforces redaction, inspection/diff budgets, process-local provenance, and no-write agent policies.
- `@afrodite/protocol` defines all browser, bridge, preview, motion-evidence, semantic, transaction, and review contracts.

React and SolidJS retain separate adapter identities even where bounded static implementations are shared.

## Manual interaction

The active project canvas supports:

```text
Delete / Backspace          delete selected editable subtree
Tab / Shift+Tab             deterministic depth-first navigation
Arrow keys                  move 1 px
Shift + Arrow               move 10 px
Ctrl/Cmd+C and Ctrl/Cmd+V   semantic object copy and paste
Ctrl/Cmd+Z and Ctrl/Cmd+Y   undo and redo
Enter or F2                 edit static text
Ctrl/Cmd+L                  edit text when the browser dispatches it
pointer drag                free object translation
held pointer + wheel        corner-radius adjustment
Escape                      cancel a transient gesture or editor
```

Drag/wheel input is previewed transiently and committed as one history command. Pasted nodes receive fresh IDs and lose source authority. Read-only source regions reject destructive commands. Browsers may reserve `Ctrl/Cmd+L`; `Enter` and `F2` are guaranteed alternatives.

See `docs/manual-interaction.md`.

## Semantic motion

Motion is stored directly on a `UiNode`:

```json
{
  "animations": [
    {
      "id": "button-hover",
      "name": "Button hover",
      "enabled": true,
      "priority": 0,
      "blend": "replace",
      "trigger": { "type": "hover" },
      "timeline": {
        "durationMs": 180,
        "delayMs": 0,
        "easing": "ease-out",
        "iterations": 1,
        "direction": "normal",
        "fill": "both"
      },
      "tracks": [
        {
          "id": "scale",
          "property": "transform.scale",
          "keyframes": [
            { "offset": 0, "value": 1 },
            { "offset": 1, "value": 1.04 }
          ]
        }
      ]
    }
  ]
}
```

The Motion workspace provides reusable presets, clip duplication, multiple active clips on one object, priority/blend controls, a shared playhead, detailed tracks/keyframes, and Animation JSON over the same model.

Semantic preview supports numeric `replace`, `add`, and `multiply`. The CSS source adapter is intentionally narrower: it materializes `replace` clips only, requires existing CSS Module ownership, and blocks simultaneously active clips that write the same CSS channel. Mount, hover, focus, and existing `data-state` selectors are supported. Manual/click runtime wiring is rejected.

See `docs/semantic-motion.md` and `docs/motion-source-composition.md`.

## Isolated motion runtime verification

Every changed motion source plan carries a version-bound verification manifest:

```text
planId + stylesheet sourceVersion
+ exact generated CSS region and fingerprint
+ random plan challenge
+ bounded clips, scenarios, and sample times
```

Studio sends this manifest to the preview host through a dedicated protocol channel. The host creates a closed Shadow DOM with a static `div`; it does not render project React/Solid components or execute application modules.

For bounded mount, hover, focus, and explicit `data-state` scenarios it:

```text
injects the exact generated CSS region
-> activates a deterministic sandbox scenario
-> pauses CSS animations
-> assigns sampled currentTime values
-> reads opacity, transform matrix, radius, color, and animation count
-> compares them with resolveMotionComposition
-> returns structured expected/actual evidence
```

Project bridge accepts evidence only for the complete exact scenario/sample set with matching source version, fingerprint, and challenge. Bridge issues the evidence ID itself. `/api/motion/apply` requires:

```text
planId + sourceVersion + bridge-issued runtimeEvidenceId
```

Runtime evidence is observational local-browser verification, not cryptographic attestation. It supplements explicit human diff review, compare-and-swap writes, formatter/build verification, and rollback.

See `docs/isolated-motion-runtime-verification.md`.

## Constrained semantic operations and batches

The semantic API currently supports:

```text
convert_to_grid
create_responsive_variant
replace_spacing_with_token
explain_unpatchable_region
```

A batch contains one to sixteen existing typed commands. Every command is independently preflighted against one immutable input document before ordered composition. Same-field writes and unproven same-file source merging block the entire batch.

```text
one input UiDocument
-> bounded typed-command validation
-> independent capability/ownership preflight
-> semantic and source conflict detection
-> ordered combined documentAfter
-> zero/one source plan or one bridge-owned transaction
```

Studio shows step provenance, exact diffs, transactions, and the combined document. Human approval remains distinct from application. Source effects execute before the reversible UI IR command.

See `docs/semantic-operations.md` and `docs/semantic-batches.md`.

## Safe source synchronization

```text
visual or semantic intent
-> explicit binding and ownership
-> deterministic adapter plan
-> exact unified diff
-> optional runtime evidence
-> approval bound to plan/source version
-> compare-and-swap write
-> formatter/typecheck/test/build verification
-> applied result or rollback
```

Browser and agent clients never provide source replacement text, edit offsets, staging paths, verification commands, commit order, or rollback behavior. Project bridge owns source reads, plan storage, filesystem access, process execution, verification, and rollback.

## Agent boundary

The local MCP gateway exposes bounded read/plan/review-request tools for single semantic operations and batches. It exposes no filesystem, shell, arbitrary source read, source write, patch apply, transaction apply, execution, approval-decision, commit, or merge capability.

The default policy redacts prop values/source excerpts, limits document inspection, limits command/source-plan/diff budgets, and requires plans to originate in the same gateway process before durable review submission.

See `docs/agent-gateway.md`.

## Reviewed execution

Single-operation agent changes follow:

```text
agent dry run
-> durable pending review
-> first human approve/reject decision
-> fresh server-side re-plan
-> approved-vs-current drift comparison
-> exact current document/source effects
-> second confirmation bound to preparation and live revision
-> verified patch or atomic transaction
-> reversible document command after source success
-> durable execution receipt or retry history
```

Typed batches currently use exact version-bound review plus compare-and-swap execution. Fresh batch re-planning and durable batch execution receipts remain deferred.

See `docs/live-agent-review.md`, `docs/reviewed-execution.md`, and `docs/reviewed-multifile-execution.md`.

## Existing screen import

Import is bounded static analysis. It never imports project modules, starts project Vite, calls hooks, evaluates conditions, fetches data, or runs package scripts. Unsupported control flow and unresolved imports remain explicit source-backed boundaries.

See `docs/existing-screen-import.md` and `docs/multi-file-screen-import.md`.

## Workspace

- `apps/studio` — Manual Canvas, Motion/compositor/evidence review, Batches, Source Sync, Binding Manager, ownership, variants, import, transactions, semantic API, and review inboxes.
- `apps/preview-host` — opaque-origin React/Solid component preview plus independent static motion-verification fixture.
- `apps/project-bridge` — authenticated source planning, live-session/review persistence, runtime-evidence normalization, verified writes, and transactions.
- `apps/agent-gateway` — policy-controlled MCP stdio adapter over live semantic planning boundaries.
- `packages/ui-ir` — Semantic UI IR contracts.
- `packages/canvas-engine` — reversible editor commands and semantic motion composition.
- `packages/framework-core`, `binding-core`, `style-core`, `variants-core`, `motion-core`, `import-core` — bounded source and import strategies.
- `packages/semantic-ops` — constrained single-command and batch planners.
- `packages/verified-write` — compare-and-swap writes, transactions, verification, and rollback.
- `packages/protocol` — browser, bridge, preview, motion-evidence, semantic, transaction, and review schemas.

## Development

```bash
corepack enable
pnpm install
pnpm dev
```

`pnpm dev` starts Studio on `4173` and preview host on `4174`.

Start project bridge separately:

```bash
pnpm dev:bridge --project ./path/to/project
```

Open Studio and paste the printed bridge token into Project session. Motion source plans appear in Motion; after planning, the isolated runtime evidence panel appears above the workbench. A successful evidence run records a bridge-issued evidence ID, after which the exact plan can be approved and applied.

For MCP:

```bash
export AFRODITE_BRIDGE_TOKEN='<local bridge token>'

pnpm dev:agent \
  --bridge-url http://127.0.0.1:4175 \
  --actor codex
```

Target projects should ignore local collaboration state:

```gitignore
.afrodite/
```

Verification:

```bash
pnpm typecheck
pnpm test
pnpm build
```
