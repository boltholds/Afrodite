# Visual source-binding manager

Afrodite does not infer an arbitrary production-code target from a visual node. A source binding is created through an explicit, reviewed workflow.

## Binding identity

A confirmed binding records:

```text
frameworkId
adapterId
repositoryPath
exportName
componentId
stableMarker
```

The binding identifies a source location strategy. It does not grant filesystem access by itself.

## Workflow

```text
select UI IR node
  -> choose framework adapter
  -> enter explicit repository path
  -> bridge reads a versioned source snapshot
  -> adapter discovers static JSX candidates
  -> user selects one candidate
  -> adapter plans data-afrodite-id insertion
  -> Studio shows exact unified diff
  -> user confirms candidate, binding identity, plan ID, and source version
  -> verified-write applies or rolls back the marker patch
  -> Studio records SourceBinding through a reversible command
```

Candidate discovery never imports the target module or executes its code. The first implementation parses TSX or JSX with the TypeScript compiler API.

## Candidate information

Each candidate contains:

- deterministic candidate ID based on the reviewed file and source offsets;
- JSX element or component name;
- one-based line and column;
- bounded source snippet;
- current marker state;
- existing static marker when present;
- patchability flag;
- structured diagnostics.

Studio lists all candidates and never chooses one silently.

## Marker ownership

The first binding strategy owns only one attribute:

```tsx
<section data-afrodite-id="ui.card.primary" />
```

Afrodite inserts the attribute when it is absent. It does not automatically replace a different existing marker. Dynamic attributes, duplicate marker attributes, and duplicate marker values are rejected.

A matching existing marker can be confirmed without creating an empty filesystem write. The source version and candidate still have to be reviewed.

## Trust boundary

The browser sends only:

- adapter ID;
- repository path;
- candidate ID;
- desired marker;
- reviewed source version;
- optional component and export identity.

The browser never sends text edits or verification commands. Marker patch plans are created and stored inside the local project bridge. Writes continue to use exact approval, compare-and-swap, required verification, and rollback.

## Framework extensibility

`@afrodite/binding-core` defines a separate `SourceBindingAdapter` contract. React and SolidJS currently share one generic JSX implementation. A future Vue or Svelte adapter can discover template candidates and plan its own stable identity mechanism without introducing framework branches into Studio.

## Current limitations

- discovery is limited to one explicitly entered file at a time;
- candidates are JSX opening or self-closing elements rather than semantic runtime instances;
- export boundaries are displayed but not yet used to restrict traversal to one component body;
- removing obsolete markers is not automatic;
- source bindings currently target one file and one stable marker.
