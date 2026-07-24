# Preview host

Afrodite separates static project indexing from runtime component execution.

Static indexing reads TypeScript syntax and types without importing application modules. Runtime preview is allowed to execute component code, so it runs behind a separate boundary.

## Current vertical slice

Studio runs on port `4173` and the preview host runs on port `4174`.

```bash
pnpm dev
```

Studio embeds the preview host using:

```html
<iframe
  src="http://localhost:4174"
  sandbox="allow-scripts"
></iframe>
```

The iframe is not granted `allow-same-origin`. Its document receives an opaque origin and communicates with Studio through versioned `postMessage` objects from `@afrodite/protocol`.

## Message flow

```text
preview host -> ready
Studio       -> render(UiNode)
preview host -> render-result(diagnostics)
```

Every message includes the `afrodite.preview.v1` channel and is schema-validated before use.

## Registry rule

A UI IR source binding such as:

```json
{
  "repositoryPath": "src/Button.tsx",
  "exportName": "Button"
}
```

does not authorize an import. The preview host resolves it only when a trusted registry contains an exact entry for `src/Button.tsx#Button`.

The current registry contains the Button and Panel fixtures used by the project indexer tests. Unknown bindings produce `COMPONENT_NOT_REGISTERED` diagnostics.

## Arbitrary repositories

Connecting an arbitrary repository requires a stronger execution boundary than the browser iframe alone. The planned pipeline is:

1. statically index the project;
2. show dependencies and build configuration;
3. request explicit execution approval;
4. build a dedicated registry bundle in an isolated worker, process, or container;
5. enforce resource, filesystem, network, and timeout limits;
6. serve only the generated preview assets to the sandboxed iframe.

Studio must never translate a document-supplied path directly into `import(path)`.
