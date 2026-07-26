# Style ownership

Afrodite treats visual layout and source-code representation as separate concerns. A UI IR node stores semantic layout, while its source binding may declare which style strategy owns which layout properties.

## Ownership contract

`SourceBinding.styleOwnership` is explicit and strategy-specific. It contains a non-empty list of managed properties:

- `display`;
- `direction`;
- `gap`;
- `padding`;
- `width`;
- `height`.

Properties not listed remain owned by handwritten code. Afrodite preserves them and refuses a patch when an owned value is dynamic or ambiguous.

## Strategies

### Inline

The marked JSX element owns a static object-literal `style` attribute. React uses camel-cased keys such as `flexDirection`; SolidJS uses CSS keys such as `flex-direction`. Unmanaged properties remain unchanged. Spreads, computed keys, duplicate owned properties, and dynamic owned values block the patch.

### CSS Modules

Ownership points to an explicit stylesheet path and class name. Afrodite updates only the managed declarations inside one unique flat class rule. It does not guess imports, selectors, nesting, or class composition.

### Utility classes

The first supported dialect is Tailwind. Ownership targets the static `className` or `class` attribute of the stable-marked JSX element. Afrodite replaces only utility groups corresponding to managed properties and preserves unrelated classes. Dynamic class expressions are read-only.

### Design tokens

Each managed property maps to an existing CSS custom property in an explicit token file. Afrodite updates one unique declaration per token. Missing or duplicate declarations are blocking errors because the editor cannot safely infer the intended scope.

## Verified write flow

```text
semantic layout transition
  -> explicit StyleOwnership
  -> strategy registry
  -> strategy-specific source target
  -> SourcePatchPlan(update-style)
  -> exact unified diff
  -> approval bound to planId and sourceVersion
  -> compare-and-swap write
  -> formatter and required typecheck/build verification
  -> applied result or rollback
```

The browser never supplies text offsets, replacement strings, or verification commands. Those are created by the local project bridge.

## Trust rules

- ownership stored in the source binding must match the ownership sent for planning;
- a strategy may edit only properties listed in `managedProperties`;
- dynamic values inside an owned region are not silently overwritten;
- unrelated declarations and utility classes are preserved;
- CSS Module and token paths are explicit;
- all writes use the existing approval, stale-source protection, verification, and rollback boundary;
- framework syntax remains outside Studio and behind strategy adapters.

## Current scope

VS-010 supports React and SolidJS inline styles, React and SolidJS Tailwind class strings, flat CSS Module rules, and existing CSS custom-property tokens. Complex CSS nesting, conditional utility expressions, generated class-name helpers, token creation, and atomic multi-file changes remain outside this slice.
