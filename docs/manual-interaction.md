# Manual interaction kernel

VS-020 makes the active Afrodite project session usable without an agent or JSON-only workflow. Keyboard, pointer, wheel, clipboard, inline text editing, Inspector fields, and JSON all modify the same Semantic UI IR through reversible commands.

## Input boundary

```text
keyboard / pointer / wheel / object clipboard / Inspector / JSON
  -> context and read-only checks
  -> deterministic DocumentCommand
  -> LiveProjectSession history
  -> revision increment
  -> source-plan invalidation or layout transition
  -> undo / redo
```

DOM handlers never mutate the persisted `UiDocument` directly. Drag and held-wheel updates use transient preview state and create one history entry when the pointer gesture finishes.

## Keyboard map

| Input | Action |
| --- | --- |
| `Delete` or `Backspace` | Delete the selected non-root editable subtree |
| `Tab` | Select the next node in deterministic depth-first order |
| `Shift+Tab` | Select the previous node |
| Arrow keys | Move the selected object by 1 px |
| `Shift` + arrow | Move by 10 px |
| `Ctrl/Cmd+C` | Copy the selected object subtree into the Afrodite object clipboard |
| `Ctrl/Cmd+V` | Paste a fresh detached copy inside the selected object |
| `Ctrl/Cmd+Z` | Undo |
| `Ctrl/Cmd+Y` or `Ctrl/Cmd+Shift+Z` | Redo |
| `Enter` or `F2` | Edit the selected static label/text value |
| `Ctrl/Cmd+L` | Request text editing when the browser dispatches the shortcut to the page |
| `Escape` | Cancel active pointer or inline-text editing state |

Browsers commonly reserve `Ctrl/Cmd+L` for the address bar. Afrodite calls `preventDefault` when it receives the event, but `Enter` and `F2` are the guaranteed shortcuts.

Keyboard commands are ignored while focus is inside an input, textarea, select, or contenteditable element.

## Pointer gestures

Primary-button pointer down selects an object and begins a gesture when the object is editable and is not the document root.

```text
pointerdown
  -> pointer capture
  -> transient position/radius preview
  -> pointermove and optional wheel updates
  -> pointerup
  -> one move, radius, or composite command
```

`Escape` discards the transient preview. A click without movement or wheel change creates no command.

While the primary pointer is held on the selected object:

- wheel up increases `appearance.borderRadius` by 1 px;
- wheel down decreases it by 1 px;
- `Shift+wheel` uses a 5 px step;
- radius never becomes negative.

## UI IR fields

Manual positioning and rounding are first-class UI IR properties:

```json
{
  "position": {
    "x": 24,
    "y": -8
  },
  "appearance": {
    "borderRadius": 18
  }
}
```

Both fields are optional for backward compatibility. Missing values behave as zero. They are visible and editable through the Inspector and the document JSON editor.

These properties are document-owned in VS-020. Existing layout source adapters do not claim authority over position or border radius yet. Manual interaction therefore invalidates stale source plans rather than silently changing handwritten code.

## Object clipboard

Copy and paste operate on semantic object subtrees, not DOM nodes.

On paste Afrodite:

- generates fresh node IDs recursively;
- offsets the new object by 16 px;
- deep-clones serializable props, layout, appearance, and children;
- removes `SourceBinding` and source-region provenance;
- rejects source-region subtrees that require a fresh import or binding review;
- inserts the result through one reversible command.

This prevents two visual objects from claiming the same stable source marker.

## Text editing

Afrodite searches for the first static string in this order:

```text
children
label
text
title
caption
placeholder
aria-label
node name
```

The inline editor changes only that exact semantic slot. Dynamic expressions and read-only source regions remain blocked. Empty node names are rejected by the command boundary.

## Shared project session

The manual canvas and the existing Source Sync/Binding Manager workspace use the same browser-local `LiveProjectSessionState`. Switching workspaces preserves:

- document and selection;
- command history;
- revision;
- layout transition provenance;
- source snapshots and synchronization state.

Layout Inspector changes still emit normal layout transition metadata. Position, radius, text, deletion, paste, and composite gestures invalidate stale source patch state until dedicated source adapters exist.

## Current limits

- selection is single-object; marquee and multi-selection are deferred;
- drag uses free translation without snapping, alignment guides, or parent-bound constraints;
- clipboard is process-local and does not interoperate with OS-level structured clipboard formats;
- pointer gestures do not yet support touch-specific handles or resize grips;
- guaranteed `Ctrl/Cmd+L` capture is impossible when the browser reserves the shortcut;
- position and border-radius source materialization is deferred;
- manual browser end-to-end testing is still required even though typecheck, unit tests, and production build pass.

## Next slice

VS-021 introduces Semantic Motion and JSON Inspector support: typed animation clips, triggers, timelines, tracks, keyframes, preview controls, and reversible JSON-backed editing over the same UI IR command boundary.
