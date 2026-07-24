import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import {
  canRedo,
  canUndo,
  createCommandHistory,
  createInsertNodeCommand,
  createLayoutCommand,
  createReplaceDocumentCommand,
  executeCommand,
  findNode,
  redoCommand,
  undoCommand,
  type DocumentCommand,
  type LayoutPatch,
} from "@afrodite/canvas-engine";
import {
  createPreviewRenderRequest,
  decodeComponentCatalog,
  decodePreviewMessage,
  serializeComponentCatalog,
  type CatalogProtocolDiagnostic,
  type ComponentCatalog,
  type IndexedComponent,
  type IndexedProp,
  type PreviewDiagnostic,
} from "@afrodite/protocol";
import {
  decodeUiDocument,
  parseUiDocument,
  serializeUiDocument,
  type Layout,
  type LayoutDirection,
  type UiDiagnostic,
  type UiDocument,
  type UiNode,
} from "@afrodite/ui-ir";
import { sampleCatalog } from "./sampleCatalog";

const STORAGE_KEY = "afrodite.ui-document.v1";
const PREVIEW_URL = import.meta.env.VITE_PREVIEW_HOST_URL ?? "http://localhost:4174";

const initialDocument = parseUiDocument({
  schemaVersion: 1,
  id: "document.demo",
  name: "Afrodite component composition",
  root: {
    id: "node.workspace",
    kind: "element",
    element: "main",
    name: "Workspace",
    layout: {
      display: "flex",
      direction: "row",
      gap: 16,
      padding: 16,
      sizing: { width: "fill", height: "fill" },
    },
    children: [
      {
        id: "node.sidebar",
        kind: "element",
        element: "aside",
        name: "Navigation",
        layout: {
          display: "flex",
          direction: "column",
          gap: 8,
          padding: 16,
          sizing: { width: 220, height: "fill" },
        },
        props: {},
        children: [],
      },
      {
        id: "node.canvas",
        kind: "element",
        element: "section",
        name: "Content",
        layout: {
          display: "flex",
          direction: "column",
          gap: 16,
          padding: 24,
          sizing: { width: "fill", height: "fill" },
        },
        props: {},
        children: [],
      },
      {
        id: "node.inspector",
        kind: "element",
        element: "aside",
        name: "Context panel",
        layout: {
          display: "flex",
          direction: "column",
          gap: 8,
          padding: 16,
          sizing: { width: 260, height: "fill" },
        },
        props: {},
        children: [],
      },
    ],
    props: {},
  },
});

type SizingAxis = keyof Layout["sizing"];
type SizingMode = "fill" | "hug" | "fixed";

interface FlatNode {
  node: UiNode;
  depth: number;
}

let insertedNodeSequence = 0;
let previewRequestSequence = 0;

export function App() {
  const restored = restoreSavedDocument();
  const [history, setHistory] = createSignal(createCommandHistory(restored.document));
  const [selectedId, setSelectedId] = createSignal(
    findNode(restored.document.root, "node.canvas")?.id ?? restored.document.root.id,
  );
  const [jsonDraft, setJsonDraft] = createSignal(serializeUiDocument(restored.document));
  const [diagnostics, setDiagnostics] = createSignal<readonly UiDiagnostic[]>(restored.diagnostics);
  const [status, setStatus] = createSignal(restored.status);

  const [catalog, setCatalog] = createSignal<ComponentCatalog>(sampleCatalog);
  const [catalogDraft, setCatalogDraft] = createSignal(serializeComponentCatalog(sampleCatalog));
  const [catalogDiagnostics, setCatalogDiagnostics] = createSignal<readonly CatalogProtocolDiagnostic[]>([]);

  const [previewReady, setPreviewReady] = createSignal(false);
  const [previewDiagnostics, setPreviewDiagnostics] = createSignal<readonly PreviewDiagnostic[]>([]);
  const [previewRequestId, setPreviewRequestId] = createSignal("waiting");
  let previewFrame: HTMLIFrameElement | undefined;

  const document = createMemo(() => history().present);
  const nodes = createMemo(() => flatten(document().root));
  const selectedNode = createMemo(() => findNode(document().root, selectedId()));

  createEffect(() => {
    const current = document();
    if (!findNode(current.root, selectedId())) setSelectedId(current.root.id);
    setJsonDraft(serializeUiDocument(current));
  });

  createEffect(() => {
    const current = document();
    if (!previewReady()) return;
    queueMicrotask(() => sendPreview(current.root));
  });

  const commit = (command: DocumentCommand, message = command.label) => {
    setHistory((current) => executeCommand(current, command));
    setDiagnostics([]);
    setStatus(message);
  };

  const replaceDocument = (next: UiDocument, label: string) => {
    commit(createReplaceDocumentCommand(document(), next, label), label);
    setSelectedId(next.root.id);
  };

  const updateLayout = (patch: LayoutPatch, label: string) => {
    const selected = selectedNode();
    if (!selected) return;
    commit(createLayoutCommand(document(), selected.id, patch, label), label);
  };

  const placeComponent = (component: IndexedComponent) => {
    const parent = selectedNode() ?? document().root;
    const node = createComponentNode(component);
    commit(
      createInsertNodeCommand(
        document(),
        parent.id,
        node,
        undefined,
        `Placed ${component.name} inside ${parent.name}`,
      ),
    );
    setSelectedId(node.id);
  };

  const undo = () => {
    setHistory((current) => {
      const command = current.past.at(-1);
      const next = undoCommand(current);
      if (next !== current) setStatus(`Undid: ${command?.label ?? "change"}`);
      return next;
    });
    setDiagnostics([]);
  };

  const redo = () => {
    setHistory((current) => {
      const command = current.future[0];
      const next = redoCommand(current);
      if (next !== current) setStatus(`Redid: ${command?.label ?? "change"}`);
      return next;
    });
    setDiagnostics([]);
  };

  const changeSizingMode = (axis: SizingAxis, mode: SizingMode) => {
    const selected = selectedNode();
    if (!selected) return;

    const current = selected.layout.sizing[axis];
    const next = mode === "fixed"
      ? typeof current === "number"
        ? current
        : axis === "width"
          ? 320
          : 180
      : mode;
    const sizing = axis === "width" ? { width: next } : { height: next };

    updateLayout({ sizing }, `Set ${axis} sizing to ${mode}`);
  };

  const changeFixedSize = (axis: SizingAxis, value: number) => {
    const sizing = axis === "width" ? { width: value } : { height: value };
    updateLayout({ sizing }, `Set ${axis} to ${value}px`);
  };

  const applyCatalog = () => {
    const decoded = decodeComponentCatalog(catalogDraft());
    if (!decoded.ok) {
      setCatalogDiagnostics(decoded.diagnostics);
      setStatus("Component catalog contains errors");
      return;
    }

    setCatalog(decoded.catalog);
    setCatalogDiagnostics([]);
    setStatus(`Loaded ${decoded.catalog.components.length} indexed components`);
  };

  const restoreSampleCatalog = () => {
    setCatalog(sampleCatalog);
    setCatalogDraft(serializeComponentCatalog(sampleCatalog));
    setCatalogDiagnostics([]);
    setStatus("Restored fixture component catalog");
  };

  const applyJson = () => {
    const decoded = decodeUiDocument(jsonDraft());
    if (!decoded.ok) {
      setDiagnostics(decoded.diagnostics);
      setStatus("Document JSON contains errors");
      return;
    }

    replaceDocument(decoded.document, "Imported UI document");
  };

  const saveDocument = () => {
    try {
      localStorage.setItem(STORAGE_KEY, serializeUiDocument(document()));
      setStatus("Saved UI document in this browser");
      setDiagnostics([]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save document");
    }
  };

  const loadDocument = () => {
    const source = localStorage.getItem(STORAGE_KEY);
    if (!source) {
      setStatus("No saved UI document was found");
      return;
    }

    const decoded = decodeUiDocument(source);
    if (!decoded.ok) {
      setDiagnostics(decoded.diagnostics);
      setStatus("Saved document is invalid");
      return;
    }

    replaceDocument(decoded.document, "Loaded saved UI document");
  };

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(jsonDraft());
      setStatus("Copied document JSON");
    } catch {
      setStatus("Clipboard access was denied");
    }
  };

  const downloadJson = () => {
    const blob = new Blob([serializeUiDocument(document())], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${slugify(document().name)}.afrodite.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus("Downloaded UI document");
  };

  const sendPreview = (node: UiNode) => {
    if (!previewFrame?.contentWindow || !previewReady()) return;
    previewRequestSequence += 1;
    const requestId = `render.${previewRequestSequence}`;
    setPreviewRequestId(requestId);
    previewFrame.contentWindow.postMessage(
      createPreviewRenderRequest(node, requestId),
      "*",
    );
  };

  onMount(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || isTextEditingTarget(event.target)) return;

      if (event.key.toLowerCase() === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
      } else if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
      } else if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
    };

    const handlePreviewMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== previewFrame?.contentWindow) return;
      const message = decodePreviewMessage(event.data);
      if (!message) return;

      if (message.type === "ready") {
        setPreviewReady(true);
        setStatus("Sandbox preview host is ready");
        sendPreview(document().root);
      } else if (message.type === "render-result") {
        setPreviewDiagnostics(message.diagnostics);
        setPreviewRequestId(message.requestId);
        setStatus(message.ok ? "Runtime preview rendered" : "Runtime preview reported errors");
      }
    };

    window.addEventListener("keydown", handleKeyboard);
    window.addEventListener("message", handlePreviewMessage);
    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyboard);
      window.removeEventListener("message", handlePreviewMessage);
    });
  });

  return (
    <div class="studio-shell">
      <header class="topbar">
        <div class="brand">
          <strong>Afrodite</strong>
          <span>Component composition</span>
        </div>
        <div class="history-actions" aria-label="Command history">
          <button disabled={!canUndo(history())} onClick={undo} title="Undo (Ctrl+Z)">Undo</button>
          <button disabled={!canRedo(history())} onClick={redo} title="Redo (Ctrl+Shift+Z)">Redo</button>
        </div>
        <span class="status-line">{status()}</span>
      </header>

      <div class="studio-grid vs003-grid">
        <aside class="panel library-panel">
          <section class="library-section">
            <div class="section-heading">
              <h2>Components</h2>
              <span>{catalog().components.length}</span>
            </div>
            <p class="panel-hint">Place into: <strong>{selectedNode()?.name ?? "Workspace"}</strong></p>
            <div class="component-list">
              <For each={catalog().components}>
                {(component) => (
                  <article class="component-card">
                    <div>
                      <strong>{component.name}</strong>
                      <code>{component.sourcePath}</code>
                    </div>
                    <p>{component.props.filter((prop) => prop.serializable).length} serializable props</p>
                    <button class="primary" onClick={() => placeComponent(component)}>Place</button>
                  </article>
                )}
              </For>
            </div>

            <details class="catalog-source">
              <summary>Catalog JSON</summary>
              <textarea
                value={catalogDraft()}
                spellcheck={false}
                onInput={(event) => setCatalogDraft(event.currentTarget.value)}
              />
              <Show when={catalogDiagnostics().length > 0}>
                <div class="diagnostics" role="alert">
                  <For each={catalogDiagnostics()}>
                    {(diagnostic) => (
                      <p>
                        <code>{diagnostic.path}</code>
                        {diagnostic.message}
                      </p>
                    )}
                  </For>
                </div>
              </Show>
              <div class="document-actions">
                <button class="primary" onClick={applyCatalog}>Apply</button>
                <button onClick={restoreSampleCatalog}>Fixture</button>
              </div>
            </details>
          </section>

          <section class="library-section layers-section">
            <div class="section-heading">
              <h2>Layers</h2>
              <span>{nodes().length}</span>
            </div>
            <For each={nodes()}>
              {({ node, depth }) => (
                <button
                  classList={{ "layer-row": true, selected: node.id === selectedId() }}
                  style={{ "padding-left": `${10 + depth * 14}px` }}
                  onClick={() => setSelectedId(node.id)}
                >
                  <span class="layer-kind">{node.kind === "component" ? "C" : "E"}</span>
                  {node.name}
                </button>
              )}
            </For>
          </section>
        </aside>

        <main class="canvas-panel composition-panel">
          <section class="workspace-pane">
            <div class="pane-heading">
              <div>
                <strong>Semantic canvas</strong>
                <span>Framework-neutral UI IR</span>
              </div>
              <code>{document().id}</code>
            </div>
            <div class="canvas-frame">
              <NodePreview node={document().root} selectedId={selectedId()} onSelect={setSelectedId} />
            </div>
          </section>

          <section class="workspace-pane runtime-pane">
            <div class="pane-heading">
              <div>
                <strong>Runtime preview</strong>
                <span>sandbox="allow-scripts" · no same-origin permission</span>
              </div>
              <code>{previewReady() ? previewRequestId() : "connecting"}</code>
            </div>
            <iframe
              ref={(element) => { previewFrame = element; }}
              class="runtime-frame"
              src={PREVIEW_URL}
              title="Afrodite isolated runtime preview"
              sandbox="allow-scripts"
              onLoad={() => {
                setPreviewReady(false);
                setStatus("Waiting for sandbox preview host");
              }}
            />
            <Show when={previewDiagnostics().length > 0}>
              <div class="preview-result diagnostics">
                <For each={previewDiagnostics()}>
                  {(diagnostic) => (
                    <p>
                      <code>{diagnostic.code}</code>
                      {diagnostic.message}
                    </p>
                  )}
                </For>
              </div>
            </Show>
          </section>
        </main>

        <aside class="panel inspector-panel">
          <h2>Inspector</h2>
          <Show when={selectedNode()} keyed>
            {(node) => (
              <>
                <div class="node-heading">
                  <strong>{node.name}</strong>
                  <span class="node-id">{node.id}</span>
                  <Show when={node.kind === "component" && node.sourceBinding}>
                    <code class="source-binding">
                      {node.sourceBinding?.repositoryPath}#{node.sourceBinding?.exportName}
                    </code>
                  </Show>
                </div>

                <section class="inspector-section">
                  <h3>Layout</h3>
                  <label>
                    Display
                    <select
                      value={node.layout.display}
                      onChange={(event) => updateLayout(
                        { display: event.currentTarget.value as Layout["display"] },
                        `Set display to ${event.currentTarget.value}`,
                      )}
                    >
                      <option value="block">Block</option>
                      <option value="flex">Flex</option>
                      <option value="grid">Grid</option>
                    </select>
                  </label>

                  <label>
                    Direction
                    <select
                      value={node.layout.direction}
                      disabled={node.layout.display !== "flex"}
                      onChange={(event) => updateLayout(
                        { direction: event.currentTarget.value as LayoutDirection },
                        `Set direction to ${event.currentTarget.value}`,
                      )}
                    >
                      <option value="row">Row</option>
                      <option value="column">Column</option>
                    </select>
                  </label>

                  <div class="field-grid">
                    <NumberField
                      label="Gap"
                      value={node.layout.gap ?? 0}
                      onChange={(value) => updateLayout({ gap: value }, `Set gap to ${value}px`)}
                    />
                    <NumberField
                      label="Padding"
                      value={node.layout.padding ?? 0}
                      onChange={(value) => updateLayout({ padding: value }, `Set padding to ${value}px`)}
                    />
                  </div>
                </section>

                <section class="inspector-section">
                  <h3>Sizing</h3>
                  <SizingField
                    axis="width"
                    value={node.layout.sizing.width}
                    onModeChange={changeSizingMode}
                    onFixedChange={changeFixedSize}
                  />
                  <SizingField
                    axis="height"
                    value={node.layout.sizing.height}
                    onModeChange={changeSizingMode}
                    onFixedChange={changeFixedSize}
                  />
                </section>

                <Show when={node.kind === "component"}>
                  <section class="inspector-section">
                    <div class="section-heading">
                      <h3>Props</h3>
                      <span>JSON-safe only</span>
                    </div>
                    <pre>{JSON.stringify(node.props, null, 2)}</pre>
                  </section>
                </Show>

                <section class="inspector-section document-section">
                  <div class="section-heading">
                    <h3>Document JSON</h3>
                    <span>schema v{document().schemaVersion}</span>
                  </div>
                  <textarea
                    value={jsonDraft()}
                    spellcheck={false}
                    onInput={(event) => setJsonDraft(event.currentTarget.value)}
                  />
                  <Show when={diagnostics().length > 0}>
                    <div class="diagnostics" role="alert">
                      <For each={diagnostics()}>
                        {(diagnostic) => (
                          <p>
                            <code>{diagnostic.path}</code>
                            {diagnostic.message}
                          </p>
                        )}
                      </For>
                    </div>
                  </Show>
                  <div class="document-actions">
                    <button class="primary" onClick={applyJson}>Apply JSON</button>
                    <button onClick={saveDocument}>Save</button>
                    <button onClick={loadDocument}>Load</button>
                    <button onClick={copyJson}>Copy</button>
                    <button onClick={downloadJson}>Download</button>
                    <button onClick={() => replaceDocument(initialDocument, "Reset sample document")}>Reset</button>
                  </div>
                </section>
              </>
            )}
          </Show>
        </aside>
      </div>
    </div>
  );
}

function NumberField(props: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {props.label}
      <div class="number-input">
        <input
          type="number"
          min="0"
          step="1"
          value={props.value}
          onChange={(event) => props.onChange(toNonNegativeNumber(event.currentTarget.value))}
        />
        <span>px</span>
      </div>
    </label>
  );
}

function SizingField(props: {
  axis: SizingAxis;
  value: Layout["sizing"][SizingAxis];
  onModeChange: (axis: SizingAxis, mode: SizingMode) => void;
  onFixedChange: (axis: SizingAxis, value: number) => void;
}) {
  const mode = () => sizingMode(props.value);

  return (
    <div class="sizing-field">
      <label>
        {capitalize(props.axis)}
        <select
          value={mode()}
          onChange={(event) => props.onModeChange(props.axis, event.currentTarget.value as SizingMode)}
        >
          <option value="fill">Fill</option>
          <option value="hug">Hug</option>
          <option value="fixed">Fixed</option>
        </select>
      </label>
      <Show when={typeof props.value === "number"}>
        <div class="number-input fixed-size-input">
          <input
            aria-label={`${props.axis} in pixels`}
            type="number"
            min="0"
            step="1"
            value={typeof props.value === "number" ? props.value : 0}
            onChange={(event) => props.onFixedChange(
              props.axis,
              toNonNegativeNumber(event.currentTarget.value),
            )}
          />
          <span>px</span>
        </div>
      </Show>
    </div>
  );
}

function NodePreview(props: {
  node: UiNode;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const style = () => {
    const width = props.node.layout.sizing.width;
    const height = props.node.layout.sizing.height;

    return {
      display: props.node.layout.display,
      "flex-direction": props.node.layout.direction,
      gap: `${props.node.layout.gap ?? 0}px`,
      padding: `${props.node.layout.padding ?? 0}px`,
      "flex-grow": width === "fill" ? 1 : 0,
      width: typeof width === "number" ? `${width}px` : width === "hug" ? "fit-content" : undefined,
      height: typeof height === "number" ? `${height}px` : height === "hug" ? "fit-content" : height === "fill" ? "100%" : undefined,
    };
  };

  return (
    <div
      classList={{
        "preview-node": true,
        selected: props.node.id === props.selectedId,
        component: props.node.kind === "component",
      }}
      style={style()}
      onClick={(event) => {
        event.stopPropagation();
        props.onSelect(props.node.id);
      }}
    >
      <span class="preview-label">{props.node.name}</span>
      <For each={props.node.children}>
        {(child) => <NodePreview node={child} selectedId={props.selectedId} onSelect={props.onSelect} />}
      </For>
    </div>
  );
}

function createComponentNode(component: IndexedComponent): UiNode {
  insertedNodeSequence += 1;
  const id = `node.component.${slugify(component.name)}.${insertedNodeSequence}`;

  return {
    id,
    kind: "component",
    component: component.name,
    name: component.name,
    layout: {
      display: "block",
      direction: "column",
      gap: 8,
      padding: 8,
      sizing: { width: "hug", height: "hug" },
    },
    props: createDefaultProps(component),
    sourceBinding: {
      repositoryPath: component.sourcePath,
      exportName: component.exportName,
      stableMarker: component.id,
    },
    children: [],
  };
}

function createDefaultProps(component: IndexedComponent): Record<string, unknown> {
  const props: Record<string, unknown> = {};

  for (const prop of component.props) {
    if (!prop.serializable) continue;
    if (prop.defaultValue !== undefined) {
      props[prop.name] = cloneJsonValue(prop.defaultValue);
    } else if (prop.required) {
      props[prop.name] = fallbackPropValue(component, prop);
    }
  }

  return props;
}

function fallbackPropValue(component: IndexedComponent, prop: IndexedProp): unknown {
  switch (prop.valueKind) {
    case "string":
      return component.name;
    case "number":
      return 0;
    case "boolean":
      return false;
    case "array":
      return [];
    case "object":
      return {};
    case "enum":
    case "literal":
      return prop.typeText.match(/["']([^"']+)["']/)?.[1] ?? "default";
    case "null":
      return null;
    default:
      return null;
  }
}

function cloneJsonValue(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function flatten(node: UiNode, depth = 0): FlatNode[] {
  return [
    { node, depth },
    ...node.children.flatMap((child) => flatten(child, depth + 1)),
  ];
}

function sizingMode(value: Layout["sizing"][SizingAxis]): SizingMode {
  return typeof value === "number" ? "fixed" : value;
}

function restoreSavedDocument(): {
  document: UiDocument;
  status: string;
  diagnostics: readonly UiDiagnostic[];
} {
  const source = localStorage.getItem(STORAGE_KEY);
  if (!source) return { document: initialDocument, status: "Ready", diagnostics: [] };

  const decoded = decodeUiDocument(source);
  if (!decoded.ok) {
    return {
      document: initialDocument,
      status: "Saved document was invalid; loaded the sample",
      diagnostics: decoded.diagnostics,
    };
  }

  return { document: decoded.document, status: "Restored saved document", diagnostics: [] };
}

function toNonNegativeNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable);
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "node";
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
