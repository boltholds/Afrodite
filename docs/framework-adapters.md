# Framework adapter architecture

Afrodite keeps its canvas, UI IR, command history, catalogs, preview protocol, diff review, and verified write boundary independent from any frontend framework.

SolidJS is the first fully indexed and previewed target. React is registered as the second framework identity so its indexer, preview runtime, and source patcher can be added without changing the shared model.

## Package boundaries

```text
@afrodite/ui-ir
    framework-neutral document and source bindings

@afrodite/protocol
    serializable catalog and preview contracts

@afrodite/framework-core
    adapter interfaces, detection, operation and patch-plan contracts,
    adapter registry, verification requirements

@afrodite/adapter-solid
    SolidJS identity, detection and capabilities

@afrodite/adapter-react
    React identity, detection and capability roadmap

framework-specific indexer / preview / patch implementation
    uses the adapter descriptor but does not leak compiler objects
    into Studio or UI IR
```

## Framework-neutral source binding

A UI node binds to source code through stable metadata rather than through a SolidJS-specific assumption:

```json
{
  "frameworkId": "react",
  "adapterId": "afrodite.adapter.react",
  "componentId": "src/Button.tsx#Button",
  "repositoryPath": "src/Button.tsx",
  "exportName": "Button",
  "stableMarker": "ui:button:primary"
}
```

Older documents without `frameworkId` remain readable. The current preview host treats legacy bindings as SolidJS only for backward compatibility. New adapters must always write explicit framework metadata.

## Adapter contract

Each adapter exposes:

- a stable framework and adapter identifier;
- source extensions and runtime packages;
- capability flags;
- project detection based on manifests and static evidence;
- an optional source patch planner;
- diagnostics and verification commands.

The shared write pipeline does not edit source itself:

```text
UI IR mutation
    -> FrameworkOperation
    -> FrameworkAdapterRegistry.resolveForBinding(...)
    -> adapter.planPatch(operation, sourceSnapshot)
    -> SourcePatchPlan
    -> overlap and stale-source checks
    -> preview unified diff
    -> explicit approval
    -> apply text edits
    -> formatter / typecheck / tests / build
```

`SourcePatchPlan` is framework-neutral. It contains ordered text edits, diagnostics, the source version, required verification steps, and an unconditional `requiresApproval: true` marker.

## Capabilities

Capabilities are advertised rather than inferred:

| Capability | SolidJS now | React foundation |
|---|---:|---:|
| Project detection | yes | yes |
| Static component indexing | yes | planned |
| Runtime preview | yes | planned |
| Serializable prop editing | yes | planned |
| Source patching | VS-004 first adapter | planned after SolidJS |

Studio must disable unsupported actions and explain the missing capability instead of attempting a framework-specific fallback.

## Preview runtimes

The preview host announces its available runtimes through the versioned protocol. Render requests list the frameworks required by the UI subtree. A host that receives an unsupported framework returns `FRAMEWORK_NOT_SUPPORTED`.

Executable components are still resolved through a trusted registry. A source binding never grants permission to dynamically import an arbitrary path.

## Adding another framework

Adding Vue, Svelte, Qwik, or another framework should require:

1. a package implementing `FrameworkAdapter`;
2. static detection and indexing tests;
3. a trusted preview runtime registration;
4. a source patch planner for supported operations;
5. framework-specific verification commands;
6. capability declarations in the component catalog.

No change should be required in UI IR, command history, catalog transport, diff review, approval flow, or patch application.

## VS-004 scope

VS-004 is now a framework-neutral safe-write vertical slice with SolidJS as its first implementation:

1. convert one layout edit into `FrameworkOperation`;
2. resolve the adapter from `SourceBinding`;
3. let the SolidJS adapter create a minimal patch plan;
4. review and approve the diff through shared infrastructure;
5. verify formatting and TypeScript;
6. prove the same operation can later be handled by a React adapter without changing the editor or write boundary.
