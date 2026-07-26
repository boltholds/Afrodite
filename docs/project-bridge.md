# Local project bridge

The project bridge is the privileged local boundary between Afrodite Studio and a source repository. Studio runs in a browser and never receives direct filesystem or process access. The bridge owns the configured project root, source snapshots, framework adapter resolution, patch-plan storage, verified writes, verification, and rollback.

## Trust model

The bridge is intentionally local and explicit:

- it binds to `127.0.0.1` by default;
- the project root is fixed when the process starts;
- every API request requires a bearer session token;
- browser access is limited to an allowlist of Studio origins;
- repository paths are resolved below the configured root and traversal is rejected;
- request bodies have a size limit;
- patch plans are produced by registered adapters and stored only in bridge memory;
- the client cannot submit arbitrary text edits or verification commands;
- plans expire after ten minutes by default;
- approval must match the exact `planId` and `sourceVersion` shown in Studio;
- writes use compare-and-swap and cannot overwrite a file that changed after planning;
- failed required verification triggers compare-and-swap rollback.

The token is printed in the terminal at startup when one is not supplied. Studio keeps a pasted token in `sessionStorage`, not persistent browser storage.

## API

```text
GET  /api/health
POST /api/source/read
POST /api/patch/plan
POST /api/patch/apply
```

`/api/source/read` returns the repository-relative path, source text, and deterministic content version.

`/api/patch/plan` accepts a framework-neutral `update-layout` operation. The bridge resolves `SourceBinding` through the adapter registry, reads the current source snapshot, invokes `adapter.planPatch`, validates the plan, creates a unified diff, and stores approvable plans server-side.

`/api/patch/apply` accepts only the stored plan ID, the reviewed source version, and an optional approval identity. It does not accept edits. The verified-write service re-reads the source, checks the approval, applies the exact stored plan, runs adapter-declared verification, and either keeps the change or restores the original file.

## Running the bridge

Install and build the workspace, then start the bridge with an explicit project root:

```bash
pnpm install
pnpm dev:bridge --project ./path/to/project
```

Optional arguments:

```text
--host 127.0.0.1
--port 4175
--token <at-least-16-characters>
--origin http://localhost:4173
```

Equivalent environment variables:

```text
AFRODITE_PROJECT_ROOT
AFRODITE_PROJECT_BRIDGE_HOST
AFRODITE_PROJECT_BRIDGE_PORT
AFRODITE_PROJECT_BRIDGE_TOKEN
AFRODITE_STUDIO_ORIGINS
```

For the trusted React fixture:

```bash
pnpm dev:bridge --project packages/indexer-react/test/fixtures/react-app
```

Copy the terminal token into Studio, open the `Source Sync` workspace, reload the saved Canvas document, choose a source-bound node, and connect.

## Studio workflow

```text
saved Semantic UI IR
    -> choose a source-bound node
    -> read current source snapshot
    -> edit or confirm the target layout
    -> request a patch plan
    -> inspect adapter diagnostics and unified diff
    -> confirm exact plan ID and source version
    -> apply through verified-write
    -> inspect verification and final status
```

The result is one of:

```text
applied
rejected
rolled-back
rollback-failed
```

`rollback-failed` requires immediate manual inspection because the source was changed but automatic restoration could not safely complete.

## Current limits

The bridge stores plans in process memory. Restarting the process invalidates them. It handles one configured project root per process. Verification commands are executed with the current user permissions inside that project root. Arbitrary user-project preview bundles remain a separate, more restricted execution boundary.
