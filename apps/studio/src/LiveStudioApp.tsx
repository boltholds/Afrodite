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
  cachePatchPlan,
  cacheSourceSnapshot,
  cacheWriteResult,
  createLiveProjectSession,
  executeLiveCommand,
  getPendingLayoutOperation,
  markNodeSynchronized,
  redoLiveCommand,
  selectLiveNode,
  sessionDocument,
  setLiveWorkspace,
  undoLiveCommand,
  type LiveProjectSessionState,
  type StudioWorkspace,
} from "@afrodite/project-session";
import {
  createPreviewRenderRequest,
  decodePreviewMessage,
  type BridgeApplyResult,
  type BridgeHealthResponse,
  type BridgeOperation,
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
  type SourceBinding,
  type UiDiagnostic,
  type UiDocument,
  type UiNode,
} from "@afrodite/ui-ir";
import { ProjectBridgeClient, ProjectBridgeClientError } from "./projectBridgeClient";
import { sampleCatalog } from "./sampleCatalog";

const STORAGE_KEY = "afrodite.ui-document.v1";
const BRIDGE_TOKEN_KEY = "afrodite.project-bridge.token";
const PREVIEW_URL = import.meta.env.VITE_PREVIEW_HOST_URL ?? "http://localhost:4174";
const DEFAULT_BRIDGE_URL = import.meta.env.VITE_PROJECT_BRIDGE_URL ?? "http://127.0.0.1:4175";

const initialDocument = parseUiDocument({
  schemaVersion: 1,
  id: "document.demo",
  name: "Afrodite live project session",
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
  },
});

type SizingAxis = keyof Layout["sizing"];
type SizingMode = "fill" | "hug" | "fixed";
type BoundNode = UiNode & { sourceBinding: SourceBinding };

interface FlatNode {
  readonly node: UiNode;
  readonly depth: number;
}

let insertedNodeSequence = 0;
let previewRequestSequence = 0;

export function LiveStudioApp() {
  const restored = restoreSavedDocument();
  const initialSelection = findNode(restored.document.root, "node.canvas")?.id
    ?? restored.document.root.id;
  const [session, setSession] = createSignal(
    createLiveProjectSession(restored.document, initialSelection),
  );
  const [status, setStatus] = createSignal(restored.status);
  const [diagnostics, setDiagnostics] = createSignal<readonly UiDiagnostic[]>(restored.diagnostics);
  const [jsonDraft, setJsonDraft] = createSignal(serializeUiDocument(restored.document));
  const [catalog] = createSignal<ComponentCatalog>(sampleCatalog);

  const [previewReady, setPreviewReady] = createSignal(false);
  const [previewDiagnostics, setPreviewDiagnostics] = createSignal<readonly PreviewDiagnostic[]>([]);
  const [previewRequestId, setPreviewRequestId] = createSignal("waiting");
  let previewFrame: HTMLIFrameElement | undefined;

  const [bridgeUrl, setBridgeUrl] = createSignal(DEFAULT_BRIDGE_URL);
  const [bridgeToken, setBridgeToken] = createSignal(sessionStorage.getItem(BRIDGE_TOKEN_KEY) ?? "");
  const [bridgeHealth, setBridgeHealth] = createSignal<BridgeHealthResponse>();
  const [bridgeBusy, setBridgeBusy] = createSignal(false);
  const [approvedPlanId, setApprovedPlanId] = createSignal("");

  const document = createMemo(() => sessionDocument(session()));
  const selectedId = createMemo(() => session().selectedNodeId);
  const selectedNode = createMemo(() => findNode(document().root, selectedId()));
  const nodes = createMemo(() => flatten(document().root));
  const boundNodes = createMemo(() => collectBoundNodes(document().root));
  const selectedBoundNode = createMemo<BoundNode | undefined>(() => {
    const selected = selectedNode();
    if (selected?.sourceBinding) return selected as BoundNode;
    return boundNodes()[0];
  });
  const pendingOperation = createMemo(() => {
    const node = selectedBoundNode();
    return node ? getPendingLayoutOperation(session(), node.id) : undefined;
  });
  const sourceSnapshot = createMemo(() => {
    const node = selectedBoundNode();
    return node ? session().sourceSnapshots[node.id] : undefined;
  });
  const patchPlan = createMemo(() => {
    const node = selectedBoundNode();
    return node ? session().patchPlans[node.id] : undefined;
  });
  const writeResult = createMemo(() => {
    const node = selectedBoundNode();
    return node ? session().writeResults[node.id] : undefined;
  });

  createEffect(() => {
    setJsonDraft(serializeUiDocument(document()));
  });

  createEffect(() => {
    if (session().workspace !== "canvas" || !previewReady()) return;
    const root = document().root;
    queueMicrotask(() => sendPreview(root));
  });

  createEffect(() => {
    const planId = patchPlan()?.planId;
    if (!planId || approvedPlanId() !== planId) setApprovedPlanId("");
  });

  const setWorkspace = (workspace: StudioWorkspace) => {
    setSession((current) => {
      let next = setLiveWorkspace(current, workspace);
      if (workspace === "source-sync") {
        const currentNode = findNode(next.history.present.root, next.selectedNodeId);
        if (!currentNode?.sourceBinding) {
          const firstBound = collectBoundNodes(next.history.present.root)[0];
          if (firstBound) next = selectLiveNode(next, firstBound.id);
        }
      }
      return next;
    });
  };

  const selectNode = (nodeId: string) => {
    setSession((current) => selectLiveNode(current, nodeId));
  };

  const commit = (
    command: DocumentCommand,
    message = command.label,
    options: Parameters<typeof executeLiveCommand>[2] = {},
  ) => {
    setSession((current) => executeLiveCommand(current, command, options));
    setDiagnostics([]);
    setStatus(message);
  };

  const updateLayout = (patch: LayoutPatch, label: string) => {
    const node = selectedNode();
    if (!node) return;

    const currentDocument = document();
    const command = createLayoutCommand(currentDocument, node.id, patch, label);
    const nextDocument = command.apply(currentDocument);
    const nextNode = findNode(nextDocument.root, node.id);
    if (!nextNode) return;

    commit(command, label, {
      layout: {
        nodeId: node.id,
        before: cloneLayout(node.layout),
        after: cloneLayout(nextNode.layout),
        ...(node.sourceBinding ? { binding: { ...node.sourceBinding } } : {}),
      },
    });
  };

  const replaceDocument = (nextDocument: UiDocument, label: string) => {
    const command = createReplaceDocumentCommand(document(), nextDocument, label);
    commit(command, label, { invalidateAllPatchState: true });
    setSession((current) => selectLiveNode(current, nextDocument.root.id));
  };

  const placeComponent = (component: IndexedComponent) => {
    const parent = selectedNode() ?? document().root;
    const node = createComponentNode(component);
    const command = createInsertNodeCommand(
      document(),
      parent.id,
      node,
      undefined,
      `Placed ${component.name} inside ${parent.name}`,
    );
    commit(command);
    selectNode(node.id);
  };

  const undo = () => {
    const command = session().history.past.at(-1);
    setSession((current) => undoLiveCommand(current));
    if (command) setStatus(`Undid: ${command.label}`);
    setDiagnostics([]);
  };

  const redo = () => {
    const command = session().history.future[0];
    setSession((current) => redoLiveCommand(current));
    if (command) setStatus(`Redid: ${command.label}`);
    setDiagnostics([]);
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
    updateLayout(
      { sizing: axis === "width" ? { width: next } : { height: next } },
      `Set ${axis} sizing to ${mode}`,
    );
  };

  const changeFixedSize = (axis: SizingAxis, value: number) => {
    updateLayout(
      { sizing: axis === "width" ? { width: value } : { height: value } },
      `Set ${axis} to ${value}px`,
    );
  };

  const saveDocument = () => {
    localStorage.setItem(STORAGE_KEY, serializeUiDocument(document()));
    setStatus("Saved the current live session document");
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

  const applyJson = () => {
    const decoded = decodeUiDocument(jsonDraft());
    if (!decoded.ok) {
      setDiagnostics(decoded.diagnostics);
      setStatus("Document JSON contains errors");
      return;
    }
    replaceDocument(decoded.document, "Imported UI document");
  };

  const downloadJson = () => {
    const blob = new Blob([serializeUiDocument(document())], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${slugify(document().name)}.afrodite.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus("Downloaded the current live session document");
  };

  const sendPreview = (node: UiNode) => {
    if (!previewFrame?.contentWindow || !previewReady()) return;
    previewRequestSequence += 1;
    const requestId = `render.${previewRequestSequence}`;
    setPreviewRequestId(requestId);
    previewFrame.contentWindow.postMessage(createPreviewRenderRequest(node, requestId), "*");
  };

  const bridgeClient = () => new ProjectBridgeClient(bridgeUrl(), bridgeToken());

  const connectBridge = async () => {
    await runBridgeAction(async () => {
      const health = await bridgeClient().health();
      sessionStorage.setItem(BRIDGE_TOKEN_KEY, bridgeToken());
      setBridgeHealth(health);
      setStatus(`Connected to ${health.projectName} with ${health.adapters.length} adapters`);
    });
  };

  const readCurrentSource = async () => {
    const node = requireBoundNode();
    if (!node) return;
    await runBridgeAction(async () => {
      const snapshot = await bridgeClient().readSource(node.sourceBinding.repositoryPath);
      setSession((current) => cacheSourceSnapshot(current, node.id, snapshot));
      setApprovedPlanId("");
      setStatus(`Read ${snapshot.repositoryPath} at ${snapshot.version}`);
    });
  };

  const planVisualChanges = async () => {
    const node = requireBoundNode();
    const pending = pendingOperation();
    if (!node || !pending) {
      setStatus("This node has no unsynchronized visual layout changes");
      return;
    }

    await runBridgeAction(async () => {
      const operation: BridgeOperation = {
        kind: "update-layout",
        nodeId: node.id,
        binding: { ...(pending.binding ?? node.sourceBinding) },
        before: cloneLayout(pending.before),
        after: cloneLayout(pending.after),
      };
      const plan = await bridgeClient().planPatch(operation);
      setSession((current) => cachePatchPlan(current, node.id, plan));
      setApprovedPlanId("");
      setStatus(plan.changed
        ? `Planned ${plan.planId} from revisions ${pending.fromRevision}–${pending.toRevision}`
        : "The adapter produced no source change");
    });
  };

  const applyVisualChanges = async () => {
    const node = requireBoundNode();
    const plan = patchPlan();
    if (!node || !plan || approvedPlanId() !== plan.planId) return;

    await runBridgeAction(async () => {
      const result = await bridgeClient().applyPatch(plan.planId, plan.sourceVersion);
      setSession((current) => {
        const withResult = cacheWriteResult(current, node.id, result);
        return result.status === "applied"
          ? markNodeSynchronized(withResult, node.id, result)
          : withResult;
      });
      setApprovedPlanId("");
      setStatus(resultMessage(result));

      if (result.status === "applied") {
        const snapshot = await bridgeClient().readSource(node.sourceBinding.repositoryPath);
        setSession((current) => cacheSourceSnapshot(current, node.id, snapshot));
      }
    });
  };

  async function runBridgeAction(action: () => Promise<void>): Promise<void> {
    setBridgeBusy(true);
    try {
      await action();
    } catch (error) {
      const message = error instanceof ProjectBridgeClientError
        ? `${error.code}: ${error.message}`
        : error instanceof Error
          ? error.message
          : "Project bridge request failed";
      setStatus(message);
    } finally {
      setBridgeBusy(false);
    }
  }

  function requireBoundNode(): BoundNode | undefined {
    const node = selectedBoundNode();
    if (!node) setStatus("Select a source-bound node first");
    return node;
  }

  onMount(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if (session().workspace !== "canvas") return;
      if (!(event.ctrlKey || event.metaKey) || isTextEditingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
      } else if (key === "z") {
        event.preventDefault();
        undo();
      } else if (key === "y") {
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
        sendPreview(document().root);
      } else if (message.type === "render-result") {
        setPreviewDiagnostics(message.diagnostics);
        setPreviewRequestId(message.requestId);
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
    <div class="live-studio-root">
      <nav class="workspace-switcher" aria-label="Afrodite workspace">
        <button
          classList={{ active: session().workspace === "canvas" }}
          onClick={() => setWorkspace("canvas")}
        >
          Canvas
        </button>
        <button
          classList={{ active: session().workspace === "source-sync" }}
          onClick={() => setWorkspace("source-sync")}
        >
          Source Sync
        </button>
      </nav>

      <div class="session-telemetry" aria-label="Live project session status">
        <span>revision {session().revision}</span>
        <span>{session().history.past.length} commands</span>
        <span>{session().layoutTransitions.length} layout transitions</span>
      </div>

      <Show when={session().workspace === "canvas"} fallback={
        <SourceSyncWorkspace
          session={session()}
          selectedNode={selectedBoundNode()}
          pending={pendingOperation()}
          source={sourceSnapshot()}
          plan={patchPlan()}
          result={writeResult()}
          bridgeUrl={bridgeUrl()}
          bridgeToken={bridgeToken()}
          bridgeHealth={bridgeHealth()}
          busy={bridgeBusy()}
          approvedPlanId={approvedPlanId()}
          status={status()}
          onSelectNode={selectNode}
          onBridgeUrlChange={setBridgeUrl}
          onBridgeTokenChange={setBridgeToken}
          onConnect={connectBridge}
          onReadSource={readCurrentSource}
          onPlan={planVisualChanges}
          onApprovalChange={setApprovedPlanId}
          onApply={applyVisualChanges}
        />
      }>
        <CanvasWorkspace
          session={session()}
          document={document()}
          selectedNode={selectedNode()}
          nodes={nodes()}
          catalog={catalog()}
          status={status()}
          diagnostics={diagnostics()}
          jsonDraft={jsonDraft()}
          previewReady={previewReady()}
          previewRequestId={previewRequestId()}
          previewDiagnostics={previewDiagnostics()}
          previewUrl={PREVIEW_URL}
          onPreviewFrame={(element) => { previewFrame = element; }}
          onSelectNode={selectNode}
          onPlaceComponent={placeComponent}
          onUndo={undo}
          onRedo={redo}
          onUpdateLayout={updateLayout}
          onSizingModeChange={changeSizingMode}
          onFixedSizeChange={changeFixedSize}
          onJsonDraftChange={setJsonDraft}
          onApplyJson={applyJson}
          onSave={saveDocument}
          onLoad={loadDocument}
          onDownload={downloadJson}
          onReset={() => replaceDocument(initialDocument, "Reset sample document")}
          onPreviewLoad={() => setPreviewReady(false)}
        />
      </Show>
    </div>
  );
}

function CanvasWorkspace(props: {
  session: LiveProjectSessionState;
  document: UiDocument;
  selectedNode?: UiNode;
  nodes: readonly FlatNode[];
  catalog: ComponentCatalog;
  status: string;
  diagnostics: readonly UiDiagnostic[];
  jsonDraft: string;
  previewReady: boolean;
  previewRequestId: string;
  previewDiagnostics: readonly PreviewDiagnostic[];
  previewUrl: string;
  onPreviewFrame: (element: HTMLIFrameElement) => void;
  onSelectNode: (nodeId: string) => void;
  onPlaceComponent: (component: IndexedComponent) => void;
  onUndo: () => void;
  onRedo: () => void;
  onUpdateLayout: (patch: LayoutPatch, label: string) => void;
  onSizingModeChange: (axis: SizingAxis, mode: SizingMode) => void;
  onFixedSizeChange: (axis: SizingAxis, value: number) => void;
  onJsonDraftChange: (value: string) => void;
  onApplyJson: () => void;
  onSave: () => void;
  onLoad: () => void;
  onDownload: () => void;
  onReset: () => void;
  onPreviewLoad: () => void;
}) {
  return (
    <div class="studio-shell">
      <header class="topbar">
        <div class="brand"><strong>Afrodite</strong><span>Live visual session</span></div>
        <div class="history-actions">
          <button disabled={!canUndo(props.session.history)} onClick={props.onUndo}>Undo</button>
          <button disabled={!canRedo(props.session.history)} onClick={props.onRedo}>Redo</button>
        </div>
        <span class="status-line">{props.status}</span>
      </header>

      <div class="studio-grid vs003-grid">
        <aside class="panel library-panel">
          <section class="library-section">
            <div class="section-heading"><h2>Components</h2><span>{props.catalog.components.length}</span></div>
            <p class="panel-hint">Place into: <strong>{props.selectedNode?.name ?? "Workspace"}</strong></p>
            <div class="component-list">
              <For each={props.catalog.components}>
                {(component) => (
                  <article class="component-card">
                    <div><strong>{component.name}</strong><code>{component.frameworkId} · {component.sourcePath}</code></div>
                    <p>{component.props.filter((prop) => prop.serializable).length} serializable props</p>
                    <button class="primary" onClick={() => props.onPlaceComponent(component)}>Place</button>
                  </article>
                )}
              </For>
            </div>
          </section>

          <section class="library-section layers-section">
            <div class="section-heading"><h2>Layers</h2><span>{props.nodes.length}</span></div>
            <For each={props.nodes}>
              {({ node, depth }) => (
                <button
                  classList={{ "layer-row": true, selected: node.id === props.session.selectedNodeId }}
                  style={{ "padding-left": `${10 + depth * 14}px` }}
                  onClick={() => props.onSelectNode(node.id)}
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
            <div class="pane-heading"><div><strong>Semantic canvas</strong><span>Shared live session</span></div><code>{props.document.id}</code></div>
            <div class="canvas-frame">
              <NodePreview
                node={props.document.root}
                selectedId={props.session.selectedNodeId}
                onSelect={props.onSelectNode}
              />
            </div>
          </section>

          <section class="workspace-pane runtime-pane">
            <div class="pane-heading">
              <div><strong>Runtime preview</strong><span>SolidJS + React trusted runtimes</span></div>
              <code>{props.previewReady ? props.previewRequestId : "connecting"}</code>
            </div>
            <iframe
              ref={props.onPreviewFrame}
              class="runtime-frame"
              src={props.previewUrl}
              title="Afrodite isolated runtime preview"
              sandbox="allow-scripts"
              onLoad={props.onPreviewLoad}
            />
            <Show when={props.previewDiagnostics.length > 0}>
              <div class="preview-result diagnostics">
                <For each={props.previewDiagnostics}>
                  {(diagnostic) => <p><code>{diagnostic.code}</code>{diagnostic.message}</p>}
                </For>
              </div>
            </Show>
          </section>
        </main>

        <aside class="panel inspector-panel">
          <h2>Inspector</h2>
          <Show when={props.selectedNode} keyed>
            {(node) => (
              <>
                <div class="node-heading">
                  <strong>{node.name}</strong>
                  <span class="node-id">{node.id}</span>
                  <Show when={node.sourceBinding}>
                    <code class="source-binding">{node.sourceBinding?.repositoryPath} · {node.sourceBinding?.frameworkId}</code>
                  </Show>
                </div>

                <section class="inspector-section">
                  <h3>Layout</h3>
                  <label>Display
                    <select
                      value={node.layout.display}
                      onChange={(event) => props.onUpdateLayout(
                        { display: event.currentTarget.value as Layout["display"] },
                        `Set display to ${event.currentTarget.value}`,
                      )}
                    >
                      <option value="block">Block</option><option value="flex">Flex</option><option value="grid">Grid</option>
                    </select>
                  </label>
                  <label>Direction
                    <select
                      value={node.layout.direction}
                      disabled={node.layout.display !== "flex"}
                      onChange={(event) => props.onUpdateLayout(
                        { direction: event.currentTarget.value as LayoutDirection },
                        `Set direction to ${event.currentTarget.value}`,
                      )}
                    >
                      <option value="row">Row</option><option value="column">Column</option>
                    </select>
                  </label>
                  <div class="field-grid">
                    <NumberField label="Gap" value={node.layout.gap ?? 0} onChange={(value) => props.onUpdateLayout({ gap: value }, `Set gap to ${value}px`)} />
                    <NumberField label="Padding" value={node.layout.padding ?? 0} onChange={(value) => props.onUpdateLayout({ padding: value }, `Set padding to ${value}px`)} />
                  </div>
                </section>

                <section class="inspector-section">
                  <h3>Sizing</h3>
                  <SizingField axis="width" value={node.layout.sizing.width} onModeChange={props.onSizingModeChange} onFixedChange={props.onFixedSizeChange} />
                  <SizingField axis="height" value={node.layout.sizing.height} onModeChange={props.onSizingModeChange} onFixedChange={props.onFixedSizeChange} />
                </section>

                <section class="inspector-section document-section">
                  <div class="section-heading"><h3>Document JSON</h3><span>revision {props.session.revision}</span></div>
                  <textarea value={props.jsonDraft} spellcheck={false} onInput={(event) => props.onJsonDraftChange(event.currentTarget.value)} />
                  <Show when={props.diagnostics.length > 0}>
                    <div class="diagnostics"><For each={props.diagnostics}>{(diagnostic) => <p><code>{diagnostic.path}</code>{diagnostic.message}</p>}</For></div>
                  </Show>
                  <div class="document-actions">
                    <button class="primary" onClick={props.onApplyJson}>Apply JSON</button>
                    <button onClick={props.onSave}>Save</button>
                    <button onClick={props.onLoad}>Load</button>
                    <button onClick={props.onDownload}>Download</button>
                    <button onClick={props.onReset}>Reset</button>
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

function SourceSyncWorkspace(props: {
  session: LiveProjectSessionState;
  selectedNode?: BoundNode;
  pending?: ReturnType<typeof getPendingLayoutOperation>;
  source?: ReturnType<typeof cacheSourceSnapshot> extends never ? never : { repositoryPath: string; content: string; version: string };
  plan?: LiveProjectSessionState["patchPlans"][string];
  result?: LiveProjectSessionState["writeResults"][string];
  bridgeUrl: string;
  bridgeToken: string;
  bridgeHealth?: BridgeHealthResponse;
  busy: boolean;
  approvedPlanId: string;
  status: string;
  onSelectNode: (nodeId: string) => void;
  onBridgeUrlChange: (value: string) => void;
  onBridgeTokenChange: (value: string) => void;
  onConnect: () => void;
  onReadSource: () => void;
  onPlan: () => void;
  onApprovalChange: (planId: string) => void;
  onApply: () => void;
}) {
  const boundNodes = () => collectBoundNodes(props.session.history.present.root);
  const planBlocked = () => !props.plan?.changed
    || props.plan.diagnostics.some((diagnostic) => diagnostic.severity === "error");

  return (
    <div class="source-sync-shell">
      <header class="source-sync-header">
        <div class="brand"><strong>Afrodite</strong><span>Live verified source synchronization</span></div>
        <span class="status-line">{props.status}</span>
      </header>

      <main class="source-sync-grid">
        <aside class="sync-panel sync-nodes">
          <div class="section-heading"><h2>Bound nodes</h2><span>{boundNodes().length}</span></div>
          <p class="panel-hint">Selection and command history are shared with Canvas.</p>
          <div class="sync-node-list">
            <For each={boundNodes()}>
              {(node) => (
                <button
                  classList={{ "sync-node": true, selected: node.id === props.selectedNode?.id }}
                  onClick={() => props.onSelectNode(node.id)}
                >
                  <strong>{node.name}</strong>
                  <code>{node.sourceBinding.repositoryPath}</code>
                  <span>{node.sourceBinding.frameworkId ?? "framework unknown"}</span>
                </button>
              )}
            </For>
          </div>
          <section class="sync-card transition-audit">
            <div class="section-heading"><h2>Session audit</h2><span>{props.session.layoutTransitions.length}</span></div>
            <For each={[...props.session.layoutTransitions].reverse().slice(0, 8)}>
              {(transition) => (
                <div class="transition-row">
                  <code>r{transition.revision}</code>
                  <span>{transition.phase}</span>
                  <strong>{transition.nodeId}</strong>
                </div>
              )}
            </For>
          </section>
        </aside>

        <section class="sync-workspace">
          <section class="sync-card bridge-card">
            <div class="section-heading"><h2>Local project bridge</h2><span>{props.bridgeHealth ? `connected · ${props.bridgeHealth.projectName}` : "offline"}</span></div>
            <div class="bridge-fields">
              <label>Bridge URL<input value={props.bridgeUrl} onInput={(event) => props.onBridgeUrlChange(event.currentTarget.value)} /></label>
              <label>Session token<input type="password" autocomplete="off" value={props.bridgeToken} onInput={(event) => props.onBridgeTokenChange(event.currentTarget.value)} /></label>
              <button class="primary" disabled={props.busy || props.bridgeToken.length < 16} onClick={props.onConnect}>Connect</button>
            </div>
          </section>

          <section class="sync-card operation-card">
            <div class="section-heading"><h2>Visual operation</h2><span>{props.selectedNode?.sourceBinding.stableMarker ?? "no bound node"}</span></div>
            <Show when={props.selectedNode} keyed fallback={<div class="sync-empty">Select a source-bound node in Canvas or here.</div>}>
              {(node) => (
                <>
                  <div class="binding-grid"><code>{node.sourceBinding.repositoryPath}</code><code>{node.sourceBinding.adapterId ?? node.sourceBinding.frameworkId}</code></div>
                  <Show when={props.pending} keyed fallback={<div class="sync-empty">No unsynchronized visual layout transitions.</div>}>
                    {(pending) => (
                      <div class="layout-comparison">
                        <div><span>Before · r{pending.fromRevision}</span><pre>{JSON.stringify(pending.before, null, 2)}</pre></div>
                        <div><span>After · r{pending.toRevision}</span><pre>{JSON.stringify(pending.after, null, 2)}</pre></div>
                      </div>
                    )}
                  </Show>
                  <div class="sync-actions">
                    <button disabled={props.busy} onClick={props.onReadSource}>Refresh source snapshot</button>
                    <button class="primary" disabled={props.busy || !props.pending} onClick={props.onPlan}>Plan exact visual changes</button>
                  </div>
                </>
              )}
            </Show>
          </section>

          <Show when={props.source} keyed>
            {(source) => <details class="sync-card source-card"><summary>Current source · {source.repositoryPath} · {source.version}</summary><pre class="source-view">{source.content}</pre></details>}
          </Show>

          <Show when={props.plan} keyed>
            {(plan) => (
              <section class="sync-card diff-card">
                <div class="section-heading"><h2>Exact unified diff</h2><span>{plan.planId}</span></div>
                <div class="plan-metadata"><code>{plan.repositoryPath}</code><code>{plan.sourceVersion}</code></div>
                <pre class="diff-view">{plan.diff}</pre>
                <Show when={plan.diagnostics.length > 0}>
                  <div class="diagnostics"><For each={plan.diagnostics}>{(diagnostic) => <p><code>{diagnostic.code}</code>{diagnostic.message}</p>}</For></div>
                </Show>
                <div class="verification-plan"><For each={plan.verification}>{(step) => <span classList={{ required: step.required }}>{step.kind} · {step.required ? "required" : "optional"}</span>}</For></div>
                <label class="approval-check">
                  <input
                    type="checkbox"
                    disabled={planBlocked()}
                    checked={props.approvedPlanId === plan.planId}
                    onChange={(event) => props.onApprovalChange(event.currentTarget.checked ? plan.planId : "")}
                  />
                  I reviewed this exact plan ID and source version.
                </label>
                <button class="primary destructive-approval" disabled={props.busy || planBlocked() || props.approvedPlanId !== plan.planId} onClick={props.onApply}>Approve exact diff & apply</button>
              </section>
            )}
          </Show>

          <Show when={props.result} keyed>
            {(result) => <WriteResultView result={result} />}
          </Show>
        </section>
      </main>
    </div>
  );
}

function WriteResultView(props: { result: BridgeApplyResult }) {
  return (
    <section class={`sync-card result-card status-${props.result.status}`}>
      <div class="section-heading"><h2>Write result</h2><span>{props.result.status}</span></div>
      <div class="result-versions"><code>before {props.result.beforeVersion}</code><Show when={props.result.afterVersion}><code>after {props.result.afterVersion}</code></Show><Show when={props.result.restoredVersion}><code>restored {props.result.restoredVersion}</code></Show></div>
      <For each={props.result.verification}>
        {(execution) => <details classList={{ "verification-result": true, failed: !execution.ok }}><summary>{execution.step.kind} · {execution.ok ? "passed" : "failed"}</summary><pre>{execution.stdout || execution.stderr || "No output."}</pre></details>}
      </For>
      <Show when={props.result.diagnostics.length > 0}><div class="diagnostics"><For each={props.result.diagnostics}>{(diagnostic) => <p><code>{diagnostic.code}</code>{diagnostic.message}</p>}</For></div></Show>
    </section>
  );
}

function NumberField(props: { label: string; value: number; onChange: (value: number) => void }) {
  return <label>{props.label}<div class="number-input"><input type="number" min="0" step="1" value={props.value} onChange={(event) => props.onChange(toNonNegativeNumber(event.currentTarget.value))} /><span>px</span></div></label>;
}

function SizingField(props: {
  axis: SizingAxis;
  value: Layout["sizing"][SizingAxis];
  onModeChange: (axis: SizingAxis, mode: SizingMode) => void;
  onFixedChange: (axis: SizingAxis, value: number) => void;
}) {
  const mode = () => typeof props.value === "number" ? "fixed" : props.value;
  return (
    <div class="sizing-field">
      <label>{capitalize(props.axis)}<select value={mode()} onChange={(event) => props.onModeChange(props.axis, event.currentTarget.value as SizingMode)}><option value="fill">Fill</option><option value="hug">Hug</option><option value="fixed">Fixed</option></select></label>
      <Show when={typeof props.value === "number"}><div class="number-input fixed-size-input"><input aria-label={`${props.axis} in pixels`} type="number" min="0" step="1" value={typeof props.value === "number" ? props.value : 0} onChange={(event) => props.onFixedChange(props.axis, toNonNegativeNumber(event.currentTarget.value))} /><span>px</span></div></Show>
    </div>
  );
}

function NodePreview(props: { node: UiNode; selectedId: string; onSelect: (id: string) => void }) {
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
    <div classList={{ "preview-node": true, selected: props.node.id === props.selectedId, component: props.node.kind === "component" }} style={style()} onClick={(event) => { event.stopPropagation(); props.onSelect(props.node.id); }}>
      <span class="preview-label">{props.node.name}</span>
      <For each={props.node.children}>{(child) => <NodePreview node={child} selectedId={props.selectedId} onSelect={props.onSelect} />}</For>
    </div>
  );
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
    if (prop.defaultValue !== undefined) props[prop.name] = cloneJsonValue(prop.defaultValue);
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

function collectBoundNodes(root: UiNode): BoundNode[] {
  const result: BoundNode[] = [];
  const visit = (node: UiNode) => {
    if (node.sourceBinding) result.push(node as BoundNode);
    for (const child of node.children) visit(child);
  };
  visit(root);
  return result;
}

function flatten(node: UiNode, depth = 0): FlatNode[] {
  return [{ node, depth }, ...node.children.flatMap((child) => flatten(child, depth + 1))];
}

function restoreSavedDocument(): { document: UiDocument; status: string; diagnostics: readonly UiDiagnostic[] } {
  const source = localStorage.getItem(STORAGE_KEY);
  if (!source) return { document: initialDocument, status: "Ready", diagnostics: [] };
  const decoded = decodeUiDocument(source);
  if (!decoded.ok) return { document: initialDocument, status: "Saved document was invalid; loaded the sample", diagnostics: decoded.diagnostics };
  return { document: decoded.document, status: "Restored saved document into the live session", diagnostics: [] };
}

function cloneLayout(layout: Layout): Layout {
  return { ...layout, sizing: { ...layout.sizing } };
}

function cloneJsonValue(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function resultMessage(result: BridgeApplyResult): string {
  switch (result.status) {
    case "applied": return "Source patch applied; the visual transition is now synchronized";
    case "rolled-back": return "Required verification failed; the original source was restored";
    case "rollback-failed": return "Verification failed and rollback could not complete";
    case "rejected": return "The verified write was rejected";
  }
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
