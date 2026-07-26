# React source patching

`@afrodite/adapter-react` converts framework-neutral layout operations into reviewable React TSX/JSX text edits. It does not write files. File mutation, approval, compare-and-swap checks, verification, and rollback remain in `@afrodite/verified-write`.

## Binding

A React UI IR node must point to its source file and carry a unique static marker:

```tsx
<section data-afrodite-id="card.primary" />
```

The corresponding source binding uses:

```json
{
  "frameworkId": "react",
  "adapterId": "afrodite.adapter.react",
  "repositoryPath": "src/Card.tsx",
  "stableMarker": "card.primary"
}
```

The adapter refuses missing markers, duplicate markers, path mismatches, framework mismatches, adapter mismatches, and modules marked with `"use server"`.

## Managed React style properties

The first React operation owns only these inline style keys:

```text
display
flexDirection
gap
padding
width
height
```

React casing is preserved. `flexDirection` is emitted instead of the CSS spelling `flex-direction` used by the SolidJS adapter.

When the target has no `style` prop, Afrodite inserts a static object. When a static object exists, unmanaged properties are preserved verbatim while managed properties are replaced from UI IR.

```tsx
<section
  data-afrodite-id="card.primary"
  style={{ color: theme.color, display: "block" }}
/>
```

becomes a patch preview such as:

```tsx
<section
  data-afrodite-id="card.primary"
  style={{ color: theme.color, display: "flex", flexDirection: "row", gap: "16px" }}
/>
```

Hooks, callbacks, JSX children, attributes, `className`, ARIA properties, and expressions outside managed style values remain untouched because the adapter edits only the style object span.

## Refusal rules

Afrodite does not guess through runtime-dependent style ownership. The plan is blocked when:

- `style` points to a variable, function, or conditional expression;
- a managed key such as `display` has a dynamic value;
- the object contains a spread that may provide managed keys;
- the object contains computed property names;
- a managed key appears more than once;
- the marked element declares more than one `style` attribute.

Representative diagnostics include:

```text
DYNAMIC_STYLE_NOT_PATCHABLE
DYNAMIC_MANAGED_STYLE_NOT_PATCHABLE
STYLE_SPREAD_NOT_PATCHABLE
COMPUTED_STYLE_PROPERTY_NOT_PATCHABLE
AMBIGUOUS_MANAGED_STYLE_PROPERTY
AMBIGUOUS_STYLE_ATTRIBUTE
SERVER_MODULE_NOT_PATCHABLE
```

Unmanaged dynamic properties such as `color: theme.color` remain supported because their ownership is not changed.

## Verification

The React adapter declares a non-blocking Prettier check and a required TypeScript check. The shared verified-write service applies the exact approved patch, runs those steps, and rolls the source back when a required verification fails and the compare-and-swap rollback remains safe.
