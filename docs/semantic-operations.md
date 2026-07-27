# Constrained semantic operation API

Afrodite exposes project-aware automation as a small typed command surface rather than arbitrary code generation.

```text
validated semantic command
  -> current UiDocument version
  -> target and read-only checks
  -> ownership and binding capability verdict
  -> deterministic semantic plan
  -> optional updated UiDocument
  -> optional server-owned style or variant patch plan
  -> separate document and source approvals
```

The command payload never contains source offsets, text replacements, staging paths, shell commands, or approval decisions.

## Initial commands

### `convert_to_grid`

```json
{
  "type": "convert_to_grid",
  "nodeId": "node.card",
  "gap": 16
}
```

The planner changes only semantic layout properties. A source plan is produced only when the node has a stable binding and Afrodite explicitly owns every affected property.

### `create_responsive_variant`

```json
{
  "type": "create_responsive_variant",
  "nodeId": "node.card",
  "variantId": "tablet",
  "minWidth": 768,
  "layout": {
    "direction": "row",
    "gap": 20
  }
}
```

The planner never replaces an existing variant ID implicitly. Tailwind and CSS Module ownership can produce a source plan through the existing variant adapters. Other representations remain document-only with an explicit capability diagnostic.

### `replace_spacing_with_token`

```json
{
  "type": "replace_spacing_with_token",
  "nodeId": "node.card",
  "property": "gap",
  "tokenName": "--space-card",
  "tokenFilePath": "src/tokens.css"
}
```

The first implementation deliberately refuses to claim token ownership automatically. It can remap a spacing property only when the node already has explicit `design-token` ownership. This protects handwritten CSS and avoids pretending that a component already references a token when it does not.

### `explain_unpatchable_region`

```json
{
  "type": "explain_unpatchable_region",
  "nodeId": "node.card"
}
```

This command is informational. It reports source-region provenance, binding state, stable-marker state, style ownership, and safe next actions. It never mutates UI IR or source.

## Plan contract

A plan contains:

- deterministic `planId`;
- exact `documentVersion`;
- `ready`, `blocked`, or `informational` status;
- `document-and-source`, `document-only`, or `informational` application mode;
- capability verdict and unmet requirements;
- structured diagnostics;
- optional `documentAfter`;
- zero or more exact source patch views produced by the existing project bridge adapters.

Document application must verify that the current UI document still matches `documentVersion`. Each source plan is independently approved against its own `planId` and `sourceVersion` and then applied through verified write, verification, and rollback.

## Bridge endpoint

```text
POST /api/semantic/plan
```

Request:

```json
{
  "document": { "schemaVersion": 1, "id": "...", "name": "...", "root": {} },
  "command": { "type": "convert_to_grid", "nodeId": "node.card" }
}
```

The bridge validates the document and command, invokes `@afrodite/semantic-ops`, and passes any emitted source intents through public `planStylePatch` or `planVariantPatch` methods. This means automation receives the same exact diffs and diagnostics as a manual Studio workflow.

## Trust boundary

The semantic API is a proposal API. It does not:

- execute natural-language instructions directly;
- invent target node IDs;
- select source elements silently;
- expand style ownership automatically;
- overwrite existing responsive variants;
- create application loading/error state logic;
- apply UI IR mutations or source patches without explicit approval;
- bypass compare-and-swap, verification, or rollback.

A future LLM or MCP adapter should translate user intent into this command schema and remain outside the trusted write boundary.
