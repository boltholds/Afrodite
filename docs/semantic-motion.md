# Semantic Motion and JSON Inspector

VS-021 adds animation intent to Semantic UI IR and exposes the same data through a visual timeline and validated JSON.

## UI IR model

Animations belong to a node:

```json
{
  "animations": [
    {
      "id": "button-hover",
      "name": "Button hover",
      "enabled": true,
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

Supported triggers:

```text
mount
hover
focus
click
state
manual
```

Supported track properties:

```text
opacity
transform.x
transform.y
transform.scale
transform.rotate
borderRadius
backgroundColor
```

Numeric tracks are linearly interpolated after timeline easing. `backgroundColor` is discrete in this slice: the preceding keyframe value remains active until the next keyframe boundary.

## Validation

The trusted schema requires:

- finite positive duration;
- finite non-negative delay;
- one through 100 iterations;
- two through 64 keyframes per track;
- first offset `0` and last offset `1`;
- strictly increasing offsets;
- numeric values for numeric properties;
- string values for `backgroundColor`;
- unique track IDs and unique properties inside a clip;
- at least one track per clip;
- at most 32 clips per node.

Documents without `animations` remain valid under schema version 1.

## Playback semantics

`resolveMotionStyle(clip, elapsedMs)` is a pure deterministic resolver. It applies:

```text
delay
iterations
direction
fill
easing
keyframe interpolation
```

Supported directions are `normal`, `reverse`, `alternate`, and `alternate-reverse`. Supported fill modes are `none`, `forwards`, `backwards`, and `both`.

The Studio preview uses the same resolver as tests and future adapters. Play, pause, restart, and playhead scrubbing do not mutate the document.

## Visual and JSON editing

The Motion workspace reads the selected node from the active browser-local project session. Visual controls edit clips, triggers, duration, delay, iterations, easing, direction, fill, tracks, properties, and keyframe values.

The JSON panel edits exactly:

```text
selectedNode.animations
```

It is not a parallel representation. Applying valid JSON creates one reversible document command, increments the live revision, invalidates stale source plans, and participates in the common undo/redo history. Invalid JSON or schema violations leave the document unchanged and report exact validation paths.

## Trust boundary

Motion is document-owned in VS-021. The preview does not:

- import or execute application modules;
- create React hooks or Solid signals;
- synthesize event handlers;
- infer application loading/error state;
- write CSS, JSX, TSX, or JavaScript;
- approve or apply source patches.

Triggers describe intended activation. A later runtime/source adapter must prove how a project represents that trigger before Afrodite can materialize it.

## Current limits

- no CSS keyframe or framework-motion source adapter;
- no cubic-bezier editor;
- no spring or physics tracks;
- no path motion;
- no audio synchronization;
- no compound trigger expressions;
- `backgroundColor` is discrete rather than color-space interpolated;
- playback previews one selected clip rather than composing several simultaneous clips;
- manual browser end-to-end testing remains outstanding.
