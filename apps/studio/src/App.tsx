import { createMemo, createSignal, For } from "solid-js";
import {
  parseUiDocument,
  type LayoutDirection,
  type UiNode,
} from "@afrodite/ui-ir";

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

function flatten(node: UiNode): UiNode[] {
  return [node, ...node.children.flatMap(flatten)];
}

export function App() {
  const [document, setDocument] = createSignal(initialDocument);
  const [selectedId, setSelectedId] = createSignal(initialDocument.root.id);

  const nodes = createMemo(() => flatten(document().root));
  const selectedNode = createMemo(() =>
    nodes().find((node) => node.id === selectedId()),
  );

  const updateDirection = (direction: LayoutDirection) => {
    const selected = selectedNode();
    if (!selected) return;

    setDocument((current) => ({
      ...current,
      root: updateNode(current.root, selected.id, (node) => ({
        ...node,
        layout: { ...node.layout, display: "flex", direction },
      })),
    }));
  };

  return (
    <div class="studio-shell">
      <header class="topbar">
        <strong>Afrodite</strong>
        <span>Semantic canvas bootstrap</span>
      </header>

      <div class="studio-grid">
        <nav class="panel hierarchy-panel" aria-label="Document hierarchy">
          <h2>Layers</h2>
          <For each={nodes()}>
            {(node) => (
              <button
                classList={{ "layer-row": true, selected: node.id === selectedId() }}
                onClick={() => setSelectedId(node.id)}
              >
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
          <p class="node-id">{selectedNode()?.id}</p>
          <label>
            Direction
            <select
              value={selectedNode()?.layout.direction ?? "column"}
              onChange={(event) => updateDirection(event.currentTarget.value as LayoutDirection)}
            >
              <option value="row">Row</option>
              <option value="column">Column</option>
            </select>
          </label>
          <pre>{JSON.stringify(selectedNode()?.layout, null, 2)}</pre>
        </aside>
      </div>
    </div>
  );
}

function updateNode(node: UiNode, id: string, transform: (node: UiNode) => UiNode): UiNode {
  if (node.id === id) return transform(node);
  return { ...node, children: node.children.map((child) => updateNode(child, id, transform)) };
}

function NodePreview(props: {
  node: UiNode;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const style = () => ({
    display: props.node.layout.display === "flex" ? "flex" : "block",
    "flex-direction": props.node.layout.direction,
    gap: `${props.node.layout.gap ?? 0}px`,
    padding: `${props.node.layout.padding ?? 0}px`,
    "flex-grow": props.node.layout.sizing.width === "fill" ? 1 : 0,
    width: typeof props.node.layout.sizing.width === "number" ? `${props.node.layout.sizing.width}px` : undefined,
    height: props.node.layout.sizing.height === "fill" ? "100%" : undefined,
  });

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
