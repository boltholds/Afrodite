# Motion composition and CSS source adapters

VS-023 extends Semantic Motion in two directions:

1. several animation clips can be previewed on one UI node at the same time;
2. a bounded subset of those clips can be materialized as generated CSS keyframes through the normal verified-write boundary.

## UI IR composition

Every animation clip has explicit composition metadata:

```json
{
  "id": "button-pulse",
  "name": "Button pulse",
  "enabled": true,
  "priority": 20,
  "blend": "multiply",
  "trigger": { "type": "hover" },
  "timeline": {
    "durationMs": 240,
    "delayMs": 0,
    "easing": "ease-in-out",
    "iterations": 2,
    "direction": "alternate",
    "fill": "both"
  },
  "tracks": [
    {
      "id": "scale",
      "property": "transform.scale",
      "keyframes": [
        { "offset": 0, "value": 1 },
        { "offset": 1, "value": 1.06 }
      ]
    }
  ]
}
```

Documents created before VS-023 remain valid. Missing `priority` becomes `0`; missing `blend` becomes `replace`.

The compositor sorts active clips by ascending priority and then by stable clip ID. Later `replace` values win. Numeric tracks may use:

- `replace` — replace the current channel value;
- `add` — add to the current channel value;
- `multiply` — multiply the current channel value.

`backgroundColor` is not numeric and supports `replace` only. Opacity is clamped to `[0, 1]`; scale and border radius remain non-negative.

The preview active set is Studio-local playback state. It does not alter the node's production runtime state.

## Animation library

The Motion workspace can add these typed presets:

```text
fade-in
slide-up
scale-in
spin
pulse
color-shift
```

A preset creates an ordinary `AnimationClip`. It can immediately be renamed, duplicated, reordered through priority, composed with other clips, edited in the detailed timeline, or changed through the same Animation JSON.

Duplication creates a fresh clip ID. All edits continue through reversible project-session commands and the shared undo/redo history.

## Source ownership

CSS source generation is deliberately narrower than semantic preview.

A motion patch must provide:

```ts
interface MotionOwnership {
  strategy: "css-keyframes";
  stylesheetPath: string;
  className: string;
  managedClipIds: readonly string[];
}
```

This reviewed ownership scope must match an existing CSS Module `SourceBinding.styleOwnership` exactly:

- the same stylesheet path;
- the same class name.

VS-023 does not persist independent motion ownership on the node. The managed clip list is approved per source plan. Persistent reusable motion ownership is deferred.

## Generated CSS region

Afrodite owns one generated region per node:

```css
/* afrodite-motion:node.card:start */
@keyframes afrodite-node-card-fade {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

.card:hover {
  animation-name: afrodite-node-card-fade;
  animation-duration: 200ms;
  animation-delay: 0ms;
  animation-timing-function: ease-out;
  animation-iteration-count: 1;
  animation-direction: normal;
  animation-fill-mode: both;
}
/* afrodite-motion:node.card:end */
```

An existing valid region is replaced deterministically. An absent region is appended. Duplicate, incomplete, or reversed markers block the patch.

Several clips can be emitted in one selector rule as comma-separated animation lists when their CSS channels do not conflict.

## Trigger mappings

The CSS adapter proves only these mappings:

```text
mount  -> .class
hover  -> .class:hover
focus  -> .class:focus
state  -> .class[data-state="state-name"]
```

`manual` and `click` remain document-only. Materializing them would require inventing JavaScript, event handlers, signals, hooks, or application state.

The `state` mapping assumes the target application already owns and updates the declared `data-state` attribute. Afrodite creates no state machine.

## Composition boundary in source

Semantic preview supports `replace`, `add`, and `multiply`. CSS source materialization supports `replace` only in VS-023.

Potentially simultaneous clips must write separate CSS channels:

```text
opacity
transform
border-radius
background-color
```

All `transform.x`, `transform.y`, `transform.scale`, and `transform.rotate` tracks share the single CSS `transform` channel. Two overlapping clips that both write any transform track are rejected rather than silently overwriting each other.

Different explicit state values are treated as mutually exclusive. Mount, hover, focus, and matching state selectors may overlap.

## Verified-write flow

```text
selected UI node and managed clip IDs
  -> protocol validation
  -> CSS Module ownership match
  -> trigger / blend / channel capability checks
  -> server-generated keyframes and selector declarations
  -> exact unified diff
  -> approval bound to planId + stylesheet sourceVersion
  -> compare-and-swap write
  -> formatter/build verification
  -> applied result or rollback
```

The browser never supplies CSS text, source offsets, edit ranges, verification commands, or rollback behavior.

Routes:

```text
POST /api/motion/plan
POST /api/motion/apply
```

Motion uses a verified single-file stylesheet boundary in this slice. It is not yet included in multi-file semantic transactions.

## Current boundary

- generated CSS requires existing CSS Module ownership;
- source output supports replace composition only;
- transform sub-properties share one source channel;
- manual and click triggers are not materialized;
- state triggers depend on pre-existing application-owned `data-state` behavior;
- no Web Animations API, Motion One, Framer Motion, GSAP, React hook, or Solid signal adapter;
- no persistent motion ownership on `SourceBinding`;
- no multi-file motion transaction;
- browser end-to-end and MCP Inspector verification remain outstanding.
