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
  createLayoutCommand,
  createReplaceDocumentCommand,
  executeCommand,
  findNode,
  redoCommand,
  undoCommand,
  type LayoutPatch,
} from "@afrodite/canvas-engine";
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

const STORAGE_KEY = "afrodite.ui-document.v1";

const initialDocument = parseUiDocument({
  schemaVersion: 1,
  id: "document.demo",
  name: "Afrodite bootstrap",
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
        name: "Component library",
        layout: {
          display: "flex",
          direction: "column",
          gap: 8,
          padding: 16,
          sizing: { width: 240, height: "fill" },
        },
        children: [],
      },
      {
        id: "node.canvas",
        kind: "element",
        element: "section",
        name: "Canvas",
        layout: {
          display: "flex",
          direction: "column",
          gap: 12,
          padding: 24,
          sizing: { width: "fill", height: "fill" },
        },
        children: [],
      },
      {
        id: "node.inspector",
        kind: "element",
        element: "aside",
        name: "Inspector",
        layout: {
          display: "flex",
          direction: "column",
          gap: 8,
          padding: 16,
          sizing: { width: 280, height: "fill" },
        },
        children: [],
      },
    ],
  },
});

type SizingAxis = keyof Layout["sizing"];
type SizingMode = "fill" | "hug" | "fixed";

interface FlatNode {
  node: UiNode;
  depth: number;
}

export function App() {
  const restored = restoreSavedDocument();
  const [history, setHistory] = createSignal(createCommandHistory(restored.document));
  const [selectedId, setSelectedId] = createSignal(restored.document.root.id);
  const [jsonDraft, setJsonDraft] = createSignal(serializeUiDocument(restored.document));
  const [diagnostics, setDiagnostics] = createSignal<readonly UiDiagnostic[]>(restored.diagnostics);
  const [status, setStatus] = createSignal(restored.status);

  const document = createMemo(() => history().present);
  const nodes = createMemo(() => flatten(document().root));
  const selectedNode = createMemo(() => findNode(document().root, selectedId()));

  createEffect(() => {
    const current = document();
    if (!findNode(current.root, selectedId())) {
      setSelectedId(current.root.id);
    }
  });

  createEffect(() => {
    setJsonDraft(serializeUiDocument(document()));
  });

  const commit = (command: ReturnType<typeof createLayoutCommand>, message = command.label) => {
    setHistory((current) => executeCommand(current, command));
    setDiagnostics([]);
    setStatus(message);
  };

  const replaceDocument = (next: UiDocument, label: string) => {
    const command = createReplaceDocumentCommand(document(), next, label);
    setHistory((current) => executeCommand(current, command));
    setDiagnostics([]);
    setSelectedId(next.root.id);
    setStatus(label);
  };

  const updateLayout = (patch: LayoutPatch, label: string) => {
    const selected = selectedNode();
    if (!selected) return;
    commit(createLayoutCommand(document(), selected.id, patch, label), label);
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

    window.addEventListener("keydown", handleKeyboard);
    onCleanup(() => window.removeEventListener("keydown", handleKeyboard));
  });

  return (
    <div class="studio-shell">
      <header class="topbar">
        <div class="brand">
          <strong>Afrodite</strong>
          <span>Semantic canvas</span>
        </div>
        <div class="history-actions" aria-label="Command history">
          <button disabled={!canUndo(history())} onClick={undo} title="Undo (Ctrl+Z)">Undo</button>
          <button disabled={!canRedo(history())} onClick={redo} title="Redo (Ctrl+Shift+Z)">Redo</button>
        </div>
        <span class="status-line">{status()}</span>
      </header>

      <div class="studio-grid">
        <nav class="panel hierarchy-panel" aria-label="Document hierarchy">
          <h2>Layers</h2>
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
        </nav>

        <main class="canvas-panel">
          <div class="canvas-frame">
            <NodePreview node={document().root} selectedId={selectedId()} onSelect={setSelectedId} />
          </div>
        </main>

        <aside class="panel inspector-panel">
          <h2>Inspector</h2>
          <Show when={selectedNode()} keyed>
            {(node) => (
              <>
                <div class="node-heading">
                  <strong>{node.name}</strong>
                  <span class="node-id">{node.id}</span>
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
      classList={{ "preview-node": true, selected: props.node.id === props.selectedId }}
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
  if (!source) {
    return { document: initialDocument, status: "Ready", diagnostics: [] };
  }

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
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "document";
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
