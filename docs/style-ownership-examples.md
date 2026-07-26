# Style ownership examples

Inline React ownership:

```json
{
  "strategy": "inline",
  "managedProperties": ["display", "direction", "gap", "padding"]
}
```

CSS Module ownership:

```json
{
  "strategy": "css-module",
  "managedProperties": ["display", "gap", "padding"],
  "stylesheetPath": "src/Card.module.css",
  "className": "card"
}
```

Tailwind ownership:

```json
{
  "strategy": "utility",
  "dialect": "tailwind",
  "attribute": "className",
  "managedProperties": ["display", "direction", "gap", "width"]
}
```

Design-token ownership:

```json
{
  "strategy": "design-token",
  "managedProperties": ["gap", "padding"],
  "tokenFilePath": "src/tokens.css",
  "tokens": {
    "gap": "--card-gap",
    "padding": "--card-padding"
  }
}
```
