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
  createInsertNodeCommand,
  createLayoutCommand,
  createReplaceDocumentCommand,
  findNode,
  type DocumentCommand,
  type LayoutPatch,
} from "@afrodite/canvas-engine";
import {
  cloneNodeForPaste,
  createBorderRadiusCommand,
  createCompositeCommand,
  createDeleteNodeCommand,
  createMoveNodeCommand,
  createTextCommand,
  findParentNode,
  flattenNodeIds,
  isNodeReadOnly,
  resolveEditableTextSlot,
  type EditableTextSlot,
} from "@afrodite/canvas-engine/interaction";
import {
  createLiveProjectSession,
  currentLiveProjectSessionState,
  executeLiveCommand,
  redoLiveCommand,
  replaceCurrentLiveProjectSessionState,
  selectLiveNode,
  sessionDocument,
  setLiveWorkspace,
  undoLiveCommand,
  type LiveProjectSessionState,
} from "@afrodite/project-session";
import type { IndexedComponent, IndexedProp } from "@afrodite/protocol";
import {
  decodeUiDocument,
  parseUiDocument,
  serializeUiDocument,
  type Layout,
  type LayoutDirection,
  type Position,
  type UiDiagnostic,
  type UiDocument,
  type UiNode,
} from "@afrodite/ui-ir";
import { LiveStudioAppV9 } from "./LiveStudioAppV9";
import { sampleCatalog } from "./sampleCatalog";

const STORAGE_KEY = "afrodite.ui-document.v1";
const CLIPBOARD_OFFSET = 16;

const initialDocument = parseUiDocument({
  schemaVersion: 1,
  id: "document.demo",
  name: "Afrodite manual interaction session",
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
    props: {},
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
        props: { label: "Navigation" },
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
        props: { label: "Content" },
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
        props: { label: "Context panel" },
        children: [],
      },
    ],
  },
});

type SizingAxis = keyof Layout["sizing"];
type SizingMode = "fill" | "hug" | "fixed";

interface FlatNode {
  readonly node: UiNode;
  readonly depth: number;
}

interface GestureState {
  readonly nodeId: string;
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly originPosition: Position;
  readonly originRadius: number;
  readonly previewPosition: Position;
  readonly previewRadius: number;
}

interface TextEditorState {
  readonly nodeId: string;
  readonly slot: EditableTextSlot;
  readonly draft: string;
}

let pastedNodeSequence = 0;
let insertedNodeSequence = 0;

export function ManualProjectStudio() {
  const [showSourceSync, setShowSourceSync] = createSignal(false);

  const openSourceSync = () => {
    const current = currentLiveProjectSessionState();
    if (current) replaceCurrentLiveProjectSessionState(setLiveWorkspace(current, "source-sync"));
    setShowSourceSync(true);
  };

  const closeSourceSync = () => {
    const current = currentLiveProjectSessionState();
    if (current) replaceCurrentLiveProjectSessionState(setLiveWorkspace(current, "canvas"));
    setShowSourceSync(false);
  };

  return (
    <div class="manual-project-root">
      <Show when={showSourceSync()} fallback={<ManualCanvasWorkspace onOpenSourceSync={openSourceSync} />}>
        <div class="manual-source-sync-shell">
          <button class="manual-back-button" onClick={closeSourceSync}>Back to manual canvas</button>
          <LiveStudioAppV9 />
        </div>
      </Show>
    </div>
  );
}

function ManualCanvasWorkspace(props: { readonly onOpenSourceSync: () => void }) {
  const restored = restoreDocument();
  const existing = currentLiveProjectSessionState();
  const initialSelection = findNode(restored.document.root, "node.canvas")?.id ?? restored.document.root.id;
  const [session, setSession] = createSignal<LiveProjectSessionState>(
    existing ?? createLiveProjectSession(restored.document, initialSelection),
  );
  const [status, setStatus] = createSignal(restored.status);
  const [diagnostics, setDiagnostics] = createSignal<readonly UiDiagnostic[]>(restored.diagnostics);
  const [jsonDraft, setJsonDraft] = createSignal(serializeUiDocument(sessionDocument(session())));
  const [clipboardNode, setClipboardNode] = createSignal<UiNode>();
  const [gesture, setGesture] = createSignal<GestureState>();
  const [textEditor, setTextEditor] = createSignal<TextEditorState>();

  const document = createMemo(() => sessionDocument(session()));
  const selectedId = createMemo(() => session().selectedNodeId);
  const selectedNode = createMemo(() => findNode(document().root, selectedId()));
  const nodes = createMemo(() => flatten(document().root));

  createEffect(() => {
    const current = session();
    replaceCurrentLiveProjectSessionState(current);
    setJsonDraft(serializeUiDocument(current.history.present));
  });

  const updateSession = (next: LiveProjectSessionState) => {
    replaceCurrentLiveProjectSessionState(next);
    setSession(next);
  };

  const selectNode = (nodeId: string) => updateSession(selectLiveNode(session(), nodeId));

  const commit = (
    command: DocumentCommand,
    message = command.label,
    options: Parameters<typeof executeLiveCommand>[2] = { invalidateAllPatchState: true },
  ) => {
    updateSession(executeLiveCommand(session(), command, options));
    setDiagnostics([]);
    setStatus(message);
  };

  const commitLayout = (patch: LayoutPatch, label: string) => {
    const node = selectedNode();
    if (!node) return;
    try {
      const command = createLayoutCommand(document(), node.id, patch, label);
      const afterNode = findNode(command.apply(document()).root, node.id);
      if (!afterNode) return;
      commit(command, label, {
        layout: {
          nodeId: node.id,
          before: cloneLayout(node.layout),
          after: cloneLayout(afterNode.layout),
          ...(node.sourceBinding ? { binding: { ...node.sourceBinding } } : {}),
        },
      });
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const commitPosition = (position: Position, label: string) => {
    const node = selectedNode();
    if (!node) return;
    try {
      commit(createMoveNodeCommand(document(), node.id, position, label), label);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const commitRadius = (radius: number, label: string) => {
    const node = selectedNode();
    if (!node) return;
    try {
      commit(createBorderRadiusCommand(document(), node.id, radius, label), label);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const undo = () => {
    const command = session().history.past.at(-1);
    const next = undoLiveCommand(session());
    if (next === session()) return;
    updateSession(next);
    setStatus(`Undid: ${command?.label ?? "change"}`);
    setDiagnostics([]);
  };

  const redo = () => {
    const command = session().history.future[0];
    const next = redoLiveCommand(session());
    if (next === session()) return;
    updateSession(next);
    setStatus(`Redid: ${command?.label ?? "change"}`);
    setDiagnostics([]);
  };

  const deleteSelection = () => {
    const node = selectedNode();
    if (!node || node.id === document().root.id) {
      setStatus("The document root cannot be deleted");
      return;
    }
    const parent = findParentNode(document().root, node.id);
    try {
      commit(createDeleteNodeCommand(document(), node.id, `Delete ${node.name}`));
      if (parent) selectNode(parent.parent.id);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const copySelection = () => {
    const node = selectedNode();
    if (!node) return;
    if (node.id === document().root.id) {
      setStatus("Copy a node inside the document root");
      return;
    }
    setClipboardNode(cloneJson(node));
    setStatus(`Copied ${node.name}`);
  };

  const pasteSelection = () => {
    const source = clipboardNode();
    const parent = selectedNode() ?? document().root;
    if (!source) {
      setStatus("The Afrodite object clipboard is empty");
      return;
    }
    if (isNodeReadOnly(parent)) {
      setStatus("Cannot paste inside a read-only source region");
      return;
    }
    try {
      const duplicate = cloneNodeForPaste(source, (sourceId) => {
        pastedNodeSequence += 1;
        return `${sourceId}.copy.${pastedNodeSequence}`;
      });
      const command = createInsertNodeCommand(
        document(),
        parent.id,
        duplicate,
        undefined,
        `Paste ${duplicate.name} into ${parent.name}`,
      );
      commit(command);
      selectNode(duplicate.id);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const navigateSelection = (direction: 1 | -1) => {
    const ids = flattenNodeIds(document().root);
    const currentIndex = Math.max(0, ids.indexOf(selectedId()));
    const nextIndex = (currentIndex + direction + ids.length) % ids.length;
    const nextId = ids[nextIndex];
    if (nextId) selectNode(nextId);
  };

  const nudgeSelection = (dx: number, dy: number) => {
    const node = selectedNode();
    if (!node || node.id === document().root.id) return;
    const current = node.position ?? { x: 0, y: 0 };
    commitPosition(
      { x: current.x + dx, y: current.y + dy },
      `Move ${node.name} to ${current.x + dx}, ${current.y + dy}`,
    );
  };

  const startTextEditing = () => {
    const node = selectedNode();
    if (!node) return;
    const slot = resolveEditableTextSlot(node);
    if (!slot) {
      setStatus("The selected node does not expose editable static text");
      return;
    }
    setTextEditor({ nodeId: node.id, slot, draft: slot.value });
    setStatus(`Editing text for ${node.name}`);
  };

  const updateTextDraft = (draft: string) => {
    const current = textEditor();
    if (current) setTextEditor({ ...current, draft });
  };

  const commitTextEditing = () => {
    const current = textEditor();
    if (!current) return;
    try {
      commit(
        createTextCommand(document(), current.nodeId, current.slot, current.draft, `Edit text on ${current.nodeId}`),
      );
      setTextEditor(undefined);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const cancelTextEditing = () => {
    if (textEditor()) setStatus("Cancelled text editing");
    setTextEditor(undefined);
  };

  const beginGesture = (event: PointerEvent, node: UiNode) => {
    event.stopPropagation();
    selectNode(node.id);
    if (event.button !== 0 || node.id === document().root.id || isNodeReadOnly(node)) return;
    const element = event.currentTarget as HTMLElement;
    element.setPointerCapture(event.pointerId);
    setGesture({
      nodeId: node.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originPosition: { x: node.position?.x ?? 0, y: node.position?.y ?? 0 },
      originRadius: node.appearance?.borderRadius ?? 0,
      previewPosition: { x: node.position?.x ?? 0, y: node.position?.y ?? 0 },
      previewRadius: node.appearance?.borderRadius ?? 0,
    });
  };

  const updateGesture = (event: PointerEvent) => {
    const current = gesture();
    if (!current || event.pointerId !== current.pointerId) return;
    setGesture({
      ...current,
      previewPosition: {
        x: current.originPosition.x + event.clientX - current.startClientX,
        y: current.originPosition.y + event.clientY - current.startClientY,
      },
    });
  };

  const updateGestureRadius = (event: WheelEvent, nodeId: string) => {
    const current = gesture();
    if (!current || current.nodeId !== nodeId) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 5 : 1;
    const delta = event.deltaY < 0 ? step : -step;
    setGesture({ ...current, previewRadius: Math.max(0, current.previewRadius + delta) });
  };

  const finishGesture = (event: PointerEvent) => {
    const current = gesture();
    if (!current || event.pointerId !== current.pointerId) return;
    setGesture(undefined);
    const commands: DocumentCommand[] = [];
    try {
      if (
        current.previewPosition.x !== current.originPosition.x
        || current.previewPosition.y !== current.originPosition.y
      ) {
        commands.push(createMoveNodeCommand(document(), current.nodeId, current.previewPosition));
      }
      if (current.previewRadius !== current.originRadius) {
        commands.push(createBorderRadiusCommand(document(), current.nodeId, current.previewRadius));
      }
      if (commands.length === 0) return;
      const node = findNode(document().root, current.nodeId);
      const label = `Manual gesture on ${node?.name ?? current.nodeId}`;
      commit(commands.length === 1 ? commands[0]! : createCompositeCommand(commands, label), label);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const cancelGesture = () => {
    if (gesture()) setStatus("Cancelled pointer gesture");
    setGesture(undefined);
  };

  const previewPosition = (node: UiNode): Position => {
    const current = gesture();
    return current?.nodeId === node.id
      ? current.previewPosition
      : node.position ?? { x: 0, y: 0 };
  };

  const previewRadius = (node: UiNode): number => {
    const current = gesture();
    return current?.nodeId === node.id
      ? current.previewRadius
      : node.appearance?.borderRadius ?? 0;
  };

  const changeSizingMode = (axis: SizingAxis, mode: SizingMode) => {
    const node = selectedNode();
    if (!node) return;
    const current = node.layout.sizing[axis];
    const next = mode === "fixed"
      ? typeof current === "number"
        ? current
        : axis === "width"
          ? 320
          : 180
      : mode;
    commitLayout(
      { sizing: axis === "width" ? { width: next } : { height: next } },
      `Set ${axis} sizing to ${mode}`,
    );
  };

  const placeComponent = (component: IndexedComponent) => {
    const parent = selectedNode() ?? document().root;
    if (isNodeReadOnly(parent)) {
      setStatus("Cannot place a component inside a read-only source region");
      return;
    }
    const node = createComponentNode(component);
    commit(createInsertNodeCommand(document(), parent.id, node, undefined, `Place ${component.name}`));
    selectNode(node.id);
  };

  const applyJson = () => {
    const decoded = decodeUiDocument(jsonDraft());
    if (!decoded.ok) {
      setDiagnostics(decoded.diagnostics);
      setStatus("Document JSON contains errors");
      return;
    }
    const command = createReplaceDocumentCommand(document(), decoded.document, "Apply document JSON");
    commit(command, command.label);
    selectNode(decoded.document.root.id);
  };

  const saveDocument = () => {
    localStorage.setItem(STORAGE_KEY, serializeUiDocument(document()));
    setStatus("Saved the current manual project session");
  };

  const resetDocument = () => {
    const command = createReplaceDocumentCommand(document(), initialDocument, "Reset sample document");
    commit(command, command.label);
    selectNode(initialDocument.root.id);
  };

  onMount(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if (isTextEditingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      const primary = event.ctrlKey || event.metaKey;

      if (event.key === "Escape") {
        cancelGesture();
        cancelTextEditing();
        return;
      }
      if (primary && key === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
        return;
      }
      if (primary && key === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (primary && key === "c") {
        event.preventDefault();
        copySelection();
        return;
      }
      if (primary && key === "v") {
        event.preventDefault();
        pasteSelection();
        return;
      }
      if ((primary && key === "l") || event.key === "F2" || event.key === "Enter") {
        event.preventDefault();
        startTextEditing();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelection();
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        navigateSelection(event.shiftKey ? -1 : 1);
        return;
      }
      const step = event.shiftKey ? 10 : 1;
      if (event.key === "ArrowLeft") { event.preventDefault(); nudgeSelection(-step, 0); }
      else if (event.key === "ArrowRight") { event.preventDefault(); nudgeSelection(step, 0); }
      else if (event.key === "ArrowUp") { event.preventDefault(); nudgeSelection(0, -step); }
      else if (event.key === "ArrowDown") { event.preventDefault(); nudgeSelection(0, step); }
    };

    window.addEventListener("keydown", handleKeyboard);
    onCleanup(() => window.removeEventListener("keydown", handleKeyboard));
  });

  return (
    <div class="manual-studio-shell">
      <header class="manual-topbar">
        <div class="brand"><strong>Afrodite</strong><span>Manual Interaction Kernel</span></div>
        <div class="manual-history-actions">
          <button disabled={!canUndo(session().history)} onClick={undo}>Undo</button>
          <button disabled={!canRedo(session().history)} onClick={redo}>Redo</button>
          <button onClick={props.onOpenSourceSync}>Source Sync & bindings</button>
        </div>
        <span class="status-line">{status()}</span>
      </header>

      <div class="manual-shortcut-strip">
        <span>Del delete</span><span>Tab navigate</span><span>Arrows move</span><span>Shift+Arrows 10px</span>
        <span>Ctrl+C/V</span><span>Ctrl+Z/Y</span><span>Enter/F2/Ctrl+L text</span><span>Hold + wheel radius</span>
      </div>

      <div class="manual-studio-grid">
        <aside class="manual-panel manual-library">
          <section>
            <div class="section-heading"><h2>Components</h2><span>{sampleCatalog.components.length}</span></div>
            <p class="panel-hint">Place into <strong>{selectedNode()?.name ?? "Workspace"}</strong></p>
            <For each={sampleCatalog.components}>{(component) => (
              <article class="manual-component-card">
                <strong>{component.name}</strong><code>{component.frameworkId}</code>
                <button onClick={() => placeComponent(component)}>Place</button>
              </article>
            )}</For>
          </section>
          <section class="manual-layers">
            <div class="section-heading"><h2>Layers</h2><span>{nodes().length}</span></div>
            <For each={nodes()}>{({ node, depth }) => (
              <button
                classList={{ "manual-layer-row": true, selected: node.id === selectedId() }}
                style={{ "padding-left": `${10 + depth * 14}px` }}
                onClick={() => selectNode(node.id)}
              >
                <span>{node.kind === "component" ? "C" : node.kind === "source-region" ? "R" : "E"}</span>
                {displayText(node)}
              </button>
            )}</For>
          </section>
        </aside>

        <main class="manual-canvas-column">
          <div class="manual-canvas-heading">
            <div><strong>Semantic canvas</strong><span>Pointer, keyboard, clipboard and inline text editing</span></div>
            <code>revision {session().revision}</code>
          </div>
          <div class="manual-canvas" onPointerDown={(event) => {
            if (event.target === event.currentTarget) selectNode(document().root.id);
          }}>
            <ManualNode
              node={document().root}
              selectedId={selectedId()}
              textEditor={textEditor()}
              positionFor={previewPosition}
              radiusFor={previewRadius}
              onSelect={selectNode}
              onPointerDown={beginGesture}
              onPointerMove={updateGesture}
              onPointerUp={finishGesture}
              onWheel={updateGestureRadius}
              onTextDraft={updateTextDraft}
              onTextCommit={commitTextEditing}
              onTextCancel={cancelTextEditing}
            />
          </div>
        </main>

        <aside class="manual-panel manual-inspector">
          <h2>Inspector</h2>
          <Show when={selectedNode()}>{(nodeAccessor) => {
            const node = nodeAccessor();
            const position = () => node.position ?? { x: 0, y: 0 };
            return (
              <>
                <div class="manual-node-heading"><strong>{displayText(node)}</strong><code>{node.id}</code></div>
                <Show when={isNodeReadOnly(node)}><p class="manual-read-only">Read-only source-backed region</p></Show>

                <section class="manual-inspector-section">
                  <h3>Position & appearance</h3>
                  <div class="manual-field-grid">
                    <NumberField label="X" value={position().x} onChange={(value) => commitPosition({ ...position(), x: value }, `Set X to ${value}`)} />
                    <NumberField label="Y" value={position().y} onChange={(value) => commitPosition({ ...position(), y: value }, `Set Y to ${value}`)} />
                    <NumberField label="Radius" min={0} value={node.appearance?.borderRadius ?? 0} onChange={(value) => commitRadius(value, `Set radius to ${value}`)} />
                  </div>
                  <button onClick={startTextEditing}>Edit static text</button>
                </section>

                <section class="manual-inspector-section">
                  <h3>Layout</h3>
                  <label>Display<select value={node.layout.display} onChange={(event) => commitLayout({ display: event.currentTarget.value as Layout["display"] }, `Set display to ${event.currentTarget.value}`)}>
                    <option value="block">Block</option><option value="flex">Flex</option><option value="grid">Grid</option>
                  </select></label>
                  <label>Direction<select value={node.layout.direction} disabled={node.layout.display !== "flex"} onChange={(event) => commitLayout({ direction: event.currentTarget.value as LayoutDirection }, `Set direction to ${event.currentTarget.value}`)}>
                    <option value="row">Row</option><option value="column">Column</option>
                  </select></label>
                  <div class="manual-field-grid">
                    <NumberField label="Gap" min={0} value={node.layout.gap ?? 0} onChange={(value) => commitLayout({ gap: value }, `Set gap to ${value}`)} />
                    <NumberField label="Padding" min={0} value={node.layout.padding ?? 0} onChange={(value) => commitLayout({ padding: value }, `Set padding to ${value}`)} />
                  </div>
                  <SizingField axis="width" value={node.layout.sizing.width} onModeChange={changeSizingMode} onFixedChange={(axis, value) => commitLayout({ sizing: axis === "width" ? { width: value } : { height: value } }, `Set ${axis} to ${value}`)} />
                  <SizingField axis="height" value={node.layout.sizing.height} onModeChange={changeSizingMode} onFixedChange={(axis, value) => commitLayout({ sizing: axis === "width" ? { width: value } : { height: value } }, `Set ${axis} to ${value}`)} />
                </section>

                <section class="manual-inspector-section manual-json-section">
                  <div class="section-heading"><h3>Document JSON</h3><span>same UI IR</span></div>
                  <textarea value={jsonDraft()} spellcheck={false} onInput={(event) => setJsonDraft(event.currentTarget.value)} />
                  <Show when={diagnostics().length > 0}><div class="diagnostics"><For each={diagnostics()}>{(item) => <p><code>{item.path}</code>{item.message}</p>}</For></div></Show>
                  <div class="manual-document-actions">
                    <button class="primary" onClick={applyJson}>Apply JSON</button>
                    <button onClick={saveDocument}>Save</button>
                    <button onClick={resetDocument}>Reset</button>
                  </div>
                </section>
              </>
            );
          }}</Show>
        </aside>
      </div>
    </div>
  );
}

function ManualNode(props: {
  readonly node: UiNode;
  readonly selectedId: string;
  readonly textEditor?: TextEditorState;
  readonly positionFor: (node: UiNode) => Position;
  readonly radiusFor: (node: UiNode) => number;
  readonly onSelect: (nodeId: string) => void;
  readonly onPointerDown: (event: PointerEvent, node: UiNode) => void;
  readonly onPointerMove: (event: PointerEvent) => void;
  readonly onPointerUp: (event: PointerEvent) => void;
  readonly onWheel: (event: WheelEvent, nodeId: string) => void;
  readonly onTextDraft: (draft: string) => void;
  readonly onTextCommit: () => void;
  readonly onTextCancel: () => void;
}) {
  const style = () => {
    const width = props.node.layout.sizing.width;
    const height = props.node.layout.sizing.height;
    const position = props.positionFor(props.node);
    return {
      display: props.node.layout.display,
      "flex-direction": props.node.layout.direction,
      gap: `${props.node.layout.gap ?? 0}px`,
      padding: `${props.node.layout.padding ?? 0}px`,
      "flex-grow": width === "fill" ? 1 : 0,
      width: typeof width === "number" ? `${width}px` : width === "hug" ? "fit-content" : undefined,
      height: typeof height === "number" ? `${height}px` : height === "hug" ? "fit-content" : height === "fill" ? "100%" : undefined,
      transform: `translate(${position.x}px, ${position.y}px)`,
      "border-radius": `${props.radiusFor(props.node)}px`,
    };
  };
  const editing = () => props.textEditor?.nodeId === props.node.id;

  return (
    <div
      data-afrodite-node-id={props.node.id}
      classList={{
        "manual-node": true,
        selected: props.node.id === props.selectedId,
        component: props.node.kind === "component",
        readonly: isNodeReadOnly(props.node),
      }}
      style={style()}
      onPointerDown={(event) => props.onPointerDown(event, props.node)}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
      onPointerCancel={props.onPointerUp}
      onWheel={(event) => props.onWheel(event, props.node.id)}
      onClick={(event) => { event.stopPropagation(); props.onSelect(props.node.id); }}
    >
      <Show when={editing()} fallback={<span class="manual-node-label">{displayText(props.node)}</span>}>
        <InlineTextEditor
          value={props.textEditor?.draft ?? ""}
          onInput={props.onTextDraft}
          onCommit={props.onTextCommit}
          onCancel={props.onTextCancel}
        />
      </Show>
      <For each={props.node.children}>{(child) => (
        <ManualNode {...props} node={child} />
      )}</For>
    </div>
  );
}

function InlineTextEditor(props: {
  readonly value: string;
  readonly onInput: (value: string) => void;
  readonly onCommit: () => void;
  readonly onCancel: () => void;
}) {
  let input: HTMLInputElement | undefined;
  onMount(() => {
    input?.focus();
    input?.select();
  });
  return (
    <input
      ref={input}
      class="manual-inline-editor"
      value={props.value}
      onInput={(event) => props.onInput(event.currentTarget.value)}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Enter") { event.preventDefault(); props.onCommit(); }
        else if (event.key === "Escape") { event.preventDefault(); props.onCancel(); }
      }}
      onBlur={props.onCommit}
    />
  );
}

function NumberField(props: {
  readonly label: string;
  readonly value: number;
  readonly min?: number;
  readonly onChange: (value: number) => void;
}) {
  return (
    <label>{props.label}<div class="manual-number-input"><input type="number" min={props.min} step="1" value={props.value} onChange={(event) => {
      const parsed = Number(event.currentTarget.value);
      props.onChange(Number.isFinite(parsed) ? (props.min === undefined ? parsed : Math.max(props.min, parsed)) : 0);
    }} /><span>px</span></div></label>
  );
}

function SizingField(props: {
  readonly axis: SizingAxis;
  readonly value: Layout["sizing"][SizingAxis];
  readonly onModeChange: (axis: SizingAxis, mode: SizingMode) => void;
  readonly onFixedChange: (axis: SizingAxis, value: number) => void;
}) {
  const mode = () => typeof props.value === "number" ? "fixed" : props.value;
  return (
    <div class="manual-sizing-field">
      <label>{capitalize(props.axis)}<select value={mode()} onChange={(event) => props.onModeChange(props.axis, event.currentTarget.value as SizingMode)}>
        <option value="fill">Fill</option><option value="hug">Hug</option><option value="fixed">Fixed</option>
      </select></label>
      <Show when={typeof props.value === "number"}><NumberField label="Fixed" min={0} value={typeof props.value === "number" ? props.value : 0} onChange={(value) => props.onFixedChange(props.axis, value)} /></Show>
    </div>
  );
}

function displayText(node: UiNode): string {
  return resolveEditableTextSlot(node)?.value ?? node.name;
}

function createComponentNode(component: IndexedComponent): UiNode {
  insertedNodeSequence += 1;
  return {
    id: `node.component.${slugify(component.name)}.${insertedNodeSequence}`,
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
    position: { x: CLIPBOARD_OFFSET, y: CLIPBOARD_OFFSET },
    appearance: { borderRadius: 8 },
    props: createDefaultProps(component),
    sourceBinding: {
      frameworkId: component.frameworkId,
      adapterId: component.adapterId,
      componentId: component.id,
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
    if (prop.defaultValue !== undefined) props[prop.name] = cloneJson(prop.defaultValue);
    else if (prop.required) props[prop.name] = fallbackPropValue(component, prop);
  }
  return props;
}

function fallbackPropValue(component: IndexedComponent, prop: IndexedProp): unknown {
  switch (prop.valueKind) {
    case "string": return component.name;
    case "number": return 0;
    case "boolean": return false;
    case "array": return [];
    case "object": return {};
    case "enum":
    case "literal": return prop.typeText.match(/["']([^"']+)["']/)?.[1] ?? "default";
    case "null": return null;
    default: return null;
  }
}

function flatten(node: UiNode, depth = 0): FlatNode[] {
  return [{ node, depth }, ...node.children.flatMap((child) => flatten(child, depth + 1))];
}

function restoreDocument(): { readonly document: UiDocument; readonly status: string; readonly diagnostics: readonly UiDiagnostic[] } {
  const active = currentLiveProjectSessionState();
  if (active) return { document: active.history.present, status: "Restored live project session", diagnostics: [] };
  const source = localStorage.getItem(STORAGE_KEY);
  if (!source) return { document: initialDocument, status: "Manual canvas ready", diagnostics: [] };
  const decoded = decodeUiDocument(source);
  return decoded.ok
    ? { document: decoded.document, status: "Restored saved document", diagnostics: [] }
    : { document: initialDocument, status: "Saved document was invalid; loaded sample", diagnostics: decoded.diagnostics };
}

function cloneLayout(layout: Layout): Layout {
  return { ...layout, sizing: { ...layout.sizing } };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Manual interaction failed";
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
