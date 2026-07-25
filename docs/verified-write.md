# Verified source writes

Afrodite treats source-code mutation as a privileged operation. Framework adapters may only produce a `SourcePatchPlan`; they never write files directly.

## Pipeline

```text
UI IR change
  -> FrameworkOperation
  -> adapter.planPatch(operation, source snapshot)
  -> SourcePatchPlan
  -> deterministic preview
  -> explicit approval bound to planId + sourceVersion
  -> compare-and-swap write
  -> formatter/typecheck/test/build verification
  -> keep the write or restore the original source
```

## Plan invariants

A patch plan contains:

- the framework and adapter identity;
- one repository-relative path;
- the exact source version used during planning;
- sorted, non-overlapping text edits;
- diagnostics;
- verification commands;
- a deterministic `planId`;
- `requiresApproval: true`.

The common framework core rejects stale snapshots, path mismatches, out-of-bounds ranges, and overlapping edits before producing an editable preview.

## Approval

Approval is not a boolean stored on the plan. It is a separate value created only after the user has reviewed the preview. It is bound to both `planId` and `sourceVersion`, so approval becomes invalid when either the plan or file changes.

## Compare-and-swap

`FileSystemSourceRepository` reads the current file immediately before writing. The write proceeds only when its content-derived version still equals the version approved by the user. This prevents a visual edit from overwriting concurrent manual changes.

Repository paths are resolved below the configured project root. Paths that escape through `..` or absolute traversal are rejected.

## Verification and rollback

After writing, `VerifiedWriteService` runs every verification step declared by the adapter. Optional failures are reported. A failed required step triggers a compare-and-swap rollback to the original source.

The result distinguishes:

- `applied`;
- `rejected`;
- `rolled-back`;
- `rollback-failed`.

A rollback failure is surfaced as a high-severity state because the written source may require manual recovery.

## SolidJS first implementation

The SolidJS adapter currently supports `update-layout` for JSX elements carrying a unique static marker:

```tsx
<section data-afrodite-id="card.primary" style={{ color: "red" }} />
```

The adapter updates only the static `style` object. It preserves event handlers, attributes, children, spread attributes, and style properties outside Afrodite's managed layout keys.

The adapter refuses to patch when:

- the stable marker is missing or duplicated;
- the binding points to another framework, adapter, or file;
- `style` is a dynamic expression rather than a static object literal.

This conservative rule is intentional. Later SolidJS and React operations will reuse the same approval, versioning, write, verification, and rollback boundary.
