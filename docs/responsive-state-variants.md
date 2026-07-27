# Responsive and component-state variants

Afrodite stores breakpoint and interaction-state intent in Semantic UI IR instead of flattening it into the base layout.

```json
{
  "variants": {
    "responsive": [
      {
        "id": "tablet",
        "name": "Tablet and wider",
        "minWidth": 768,
        "layout": {
          "direction": "row",
          "gap": 16
        }
      }
    ],
    "states": [
      {
        "id": "loading",
        "state": "loading",
        "layout": {
          "display": "grid"
        }
      }
    ]
  }
}
```

Variant overrides are partial layouts. The base node layout remains unchanged and independently reversible. Responsive overrides are applied from the lowest matching `minWidth` upward. Active states are resolved in deterministic order:

```text
hover -> focus -> disabled -> loading -> error
```

Later states win when several preview states are active. This ordering is an editor preview rule; Afrodite does not mutate the running application's state.

## Supported states

The current UI IR supports:

- `hover`;
- `focus`;
- `disabled`;
- `loading`;
- `error`.

`loading` and `error` are represented in static source through `data-state="loading"` and `data-state="error"` selectors or Tailwind arbitrary data variants. Afrodite does not invent application state management or event handlers.

## Ownership

Every property changed by a variant must be present in `SourceBinding.styleOwnership.managedProperties`. A variant that attempts to change a handwritten property is blocked with `VARIANT_PROPERTY_NOT_OWNED`.

This keeps base styles and variant styles under the same explicit ownership contract.

## Tailwind materialization

Static Tailwind `class` or `className` strings support responsive and state prefixes.

Examples:

```text
min-[768px]:flex-row
min-[768px]:gap-[16px]
hover:gap-[20px]
focus:p-[12px]
disabled:block
data-[state=loading]:grid
data-[state=error]:gap-[32px]
```

Afrodite removes only previously owned classes whose variant prefix and utility group are known from the reviewed before/after variants. Unrelated classes are preserved.

Dynamic class expressions, `clsx`, conditional strings, spreads, and server-only React modules remain read-only because class ownership cannot be proven statically.

## CSS Module materialization

CSS Module ownership writes one replaceable generated region per owned class:

```css
/* afrodite-variants:card:start */
@media (min-width: 768px) {
  .card {
    flex-direction: row;
    gap: 16px;
  }
}

.card:hover {
  gap: 20px;
}

.card[data-state="loading"] {
  display: grid;
}
/* afrodite-variants:card:end */
```

The generated block is separate from the handwritten base `.card` rule. Missing, duplicated, or damaged ownership markers block the patch rather than causing Afrodite to guess.

## Read-only strategies

Static inline style objects cannot express pseudo states or media queries without adding runtime behavior. Unscoped design-token bindings also do not identify a selector or media-query scope. Both currently return explicit blocking diagnostics:

```text
INLINE_VARIANTS_NOT_PATCHABLE
DESIGN_TOKEN_VARIANTS_NOT_PATCHABLE
```

A later adapter may support these representations only after the source binding carries a deterministic runtime or selector scope.

## Verified source flow

A single variant operation follows the normal verified-write path:

```text
UiVariants before/after
  -> VariantPatchOperation
  -> ownership-aware variant strategy
  -> exact SourcePatchPlan
  -> unified diff
  -> approval bound to planId + sourceVersion
  -> compare-and-swap write
  -> verification
  -> applied result or rollback
```

Variant operations are also accepted by the VS-013 transaction boundary:

```json
{
  "type": "variant",
  "operation": {
    "kind": "update-variants"
  }
}
```

This allows variants belonging to different JSX, CSS Module, or other future source targets to be reviewed and committed under one transaction ID and complete source-version set.

## Current boundary

- responsive variants use explicit pixel ranges rather than project-specific named breakpoint configuration;
- Tailwind and flat generated CSS Module regions are writable;
- inline and unscoped token variants remain read-only;
- compound state combinations such as `hover + error` do not have separate UI IR records;
- variants do not create runtime loading/error state logic;
- several plans targeting the same source file still require future syntax-aware plan merging;
- manual browser visual inspection is separate from CI typecheck, tests, and production build.
