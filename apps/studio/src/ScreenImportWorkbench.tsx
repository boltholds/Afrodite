import { createMemo, createSignal, For, Show } from "solid-js";
import type {
  BridgeHealthResponse,
  ScreenImportGraphEdge,
  ScreenImportResult,
} from "@afrodite/protocol";
import {
  serializeUiDocument,
  type UiNode,
} from "@afrodite/ui-ir";
import { ProjectBridgeClient, ProjectBridgeClientError } from "./projectBridgeClient";

const STORAGE_KEY = "afrodite.ui-document.v1";
const BRIDGE_TOKEN_KEY = "afrodite.project-bridge.token";
const DEFAULT_BRIDGE_URL = import.meta.env.VITE_PROJECT_BRIDGE_URL ?? "http://127.0.0.1:4175";

export function ScreenImportWorkbench(props: { onOpenProjectSession: () => void }) {
  const [bridgeUrl, setBridgeUrl] = createSignal(DEFAULT_BRIDGE_URL);
  const [bridgeToken, setBridgeToken] = createSignal(sessionStorage.getItem(BRIDGE_TOKEN_KEY) ?? "");
  const [health, setHealth] = createSignal<BridgeHealthResponse>();
  const [adapterId, setAdapterId] = createSignal("afrodite.adapter.react");
  const [repositoryPath, setRepositoryPath] = createSignal("src/Screen.tsx");
  const [exportName, setExportName] = createSignal("Screen");
  const [documentName, setDocumentName] = createSignal("");
  const [maxDepth, setMaxDepth] = createSignal(32);
  const [maxFiles, setMaxFiles] = createSignal(24);
  const [maxNodes, setMaxNodes] = createSignal(1200);
  const [maxGraphDepth, setMaxGraphDepth] = createSignal(8);
  const [expansionMode, setExpansionMode] = createSignal<"all-local" | "explicit">("all-local");
  const [expandComponents, setExpandComponents] = createSignal("");
  const [stopComponents, setStopComponents] = createSignal("");
  const [result, setResult] = createSignal<ScreenImportResult>();
  const [busy, setBusy] = createSignal(false);
  const [status, setStatus] = createSignal("Connect a local project bridge to import a bounded component graph.");

  const client = () => new ProjectBridgeClient(bridgeUrl(), bridgeToken());
  const hasBlockingDiagnostics = createMemo(() =>
    result()?.diagnostics.some((diagnostic) => diagnostic.severity === "error") ?? false,
  );

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setStatus(error instanceof ProjectBridgeClientError
        ? `${error.code}: ${error.message}`
        : error instanceof Error
          ? error.message
          : "Screen import failed");
    } finally {
      setBusy(false);
    }
  };

  const connect = () => run(async () => {
    const response = await client().health();
    sessionStorage.setItem(BRIDGE_TOKEN_KEY, bridgeToken());
    setHealth(response);
    if (!response.adapters.some((adapter) => adapter.adapterId === adapterId())) {
      setAdapterId(response.adapters[0]?.adapterId ?? "");
    }
    setStatus(`Connected to ${response.projectName}. Graph import reads versioned source snapshots without executing project modules.`);
  });

  const importScreen = () => run(async () => {
    const response = await client().importScreen({
      adapterId: adapterId(),
      repositoryPath: repositoryPath(),
      ...(exportName().trim() ? { exportName: exportName().trim() } : {}),
      ...(documentName().trim() ? { documentName: documentName().trim() } : {}),
      maxDepth: maxDepth(),
      maxFiles: maxFiles(),
      maxNodes: maxNodes(),
      maxGraphDepth: maxGraphDepth(),
      expansionMode: expansionMode(),
      ...(splitBoundaries(expandComponents()).length > 0
        ? { expandComponents: splitBoundaries(expandComponents()) }
        : {}),
      ...(splitBoundaries(stopComponents()).length > 0
        ? { stopComponents: splitBoundaries(stopComponents()) }
        : {}),
    });
    setResult(response);
    setStatus(response.document
      ? `Imported ${response.stats.totalNodes} nodes across ${response.graph?.filesRead ?? 1} source file(s).`
      : "The importer did not create a document. Review diagnostics and choose a bounded export.");
  });

  const openProjectSession = () => {
    const document = result()?.document;
    if (!document || hasBlockingDiagnostics()) return;
    localStorage.setItem(STORAGE_KEY, serializeUiDocument(document));
    props.onOpenProjectSession();
  };

  const downloadDocument = () => {
    const document = result()?.document;
    if (!document) return;
    const blob = new Blob([serializeUiDocument(document)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${slugify(document.name)}.afrodite.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div class="screen-import-shell">
      <header class="screen-import-header">
        <div class="brand"><strong>Afrodite</strong><span>Bounded multi-file screen import</span></div>
        <span class="status-line">{status()}</span>
      </header>

      <main class="screen-import-grid">
        <aside class="import-panel import-controls">
          <section class="import-card">
            <div class="section-heading"><h2>Local project bridge</h2><span>{health() ? `connected · ${health()!.projectName}` : "offline"}</span></div>
            <label>Bridge URL<input value={bridgeUrl()} onInput={(event) => setBridgeUrl(event.currentTarget.value)} /></label>
            <label>Session token<input type="password" autocomplete="off" value={bridgeToken()} onInput={(event) => setBridgeToken(event.currentTarget.value)} /></label>
            <button class="primary" disabled={busy() || bridgeToken().length < 16} onClick={() => void connect()}>Connect</button>
          </section>

          <section class="import-card">
            <div class="section-heading"><h2>Root component</h2><span>explicit entry</span></div>
            <label>Framework adapter
              <select value={adapterId()} onChange={(event) => setAdapterId(event.currentTarget.value)}>
                <Show when={health()} fallback={
                  <>
                    <option value="afrodite.adapter.react">React</option>
                    <option value="afrodite.adapter.solid">SolidJS</option>
                  </>
                }>
                  <For each={health()?.adapters ?? []}>
                    {(adapter) => <option value={adapter.adapterId}>{adapter.displayName} · {adapter.adapterId}</option>}
                  </For>
                </Show>
              </select>
            </label>
            <label>Repository path<input value={repositoryPath()} onInput={(event) => setRepositoryPath(event.currentTarget.value)} /></label>
            <label>Export name<input placeholder="required when ambiguous" value={exportName()} onInput={(event) => setExportName(event.currentTarget.value)} /></label>
            <label>Document name<input placeholder="derived from export" value={documentName()} onInput={(event) => setDocumentName(event.currentTarget.value)} /></label>
            <label>Per-file syntax depth<input type="number" min="1" max="128" value={maxDepth()} onInput={(event) => setMaxDepth(clampNumber(event.currentTarget.value, 32, 1, 128))} /></label>
          </section>

          <section class="import-card">
            <div class="section-heading"><h2>Graph budgets</h2><span>hard limits</span></div>
            <div class="import-budget-grid">
              <label>Maximum files<input type="number" min="1" max="128" value={maxFiles()} onInput={(event) => setMaxFiles(clampNumber(event.currentTarget.value, 24, 1, 128))} /></label>
              <label>Maximum nodes<input type="number" min="1" max="20000" value={maxNodes()} onInput={(event) => setMaxNodes(clampNumber(event.currentTarget.value, 1200, 1, 20_000))} /></label>
              <label>Graph depth<input type="number" min="0" max="32" value={maxGraphDepth()} onInput={(event) => setMaxGraphDepth(clampNumber(event.currentTarget.value, 8, 0, 32))} /></label>
            </div>
            <label>Expansion policy
              <select value={expansionMode()} onChange={(event) => setExpansionMode(event.currentTarget.value as "all-local" | "explicit")}>
                <option value="all-local">Expand all direct local imports</option>
                <option value="explicit">Expand only listed components</option>
              </select>
            </label>
            <Show when={expansionMode() === "explicit"}>
              <label>Expand components<textarea spellcheck={false} placeholder="Card, src/Screen.tsx#Toolbar" value={expandComponents()} onInput={(event) => setExpandComponents(event.currentTarget.value)} /></label>
            </Show>
            <label>Stop boundaries<textarea spellcheck={false} placeholder="HeavyChart, src/Screen.tsx#AdminPanel" value={stopComponents()} onInput={(event) => setStopComponents(event.currentTarget.value)} /></label>
            <button class="primary" disabled={busy() || !health() || !adapterId() || !repositoryPath().trim()} onClick={() => void importScreen()}>Import local component graph</button>
            <p class="panel-hint">Only direct relative TSX/JSX imports are expanded. Package imports, barrels, aliases, dynamic imports and runtime factories remain explicit boundaries.</p>
          </section>
        </aside>

        <section class="import-workspace">
          <Show when={result()} keyed fallback={
            <section class="import-card import-empty">
              <strong>No import result yet</strong>
              <p>Choose a root export and budgets. Static local component references can be expanded; cycles and unsupported behavior remain visible boundaries.</p>
            </section>
          }>
            {(current) => (
              <>
                <section class="import-card import-summary">
                  <div class="section-heading"><h2>Import summary</h2><span>{current.frameworkId} · {current.exportName ?? "export unresolved"}</span></div>
                  <div class="import-stats">
                    <Stat label="Total" value={current.stats.totalNodes} />
                    <Stat label="Editable" value={current.stats.editableNodes} />
                    <Stat label="Needs binding" value={current.stats.requiresBindingNodes} />
                    <Stat label="Read-only" value={current.stats.readOnlyRegions} />
                    <Stat label="Files" value={current.graph?.filesRead ?? 1} />
                    <Stat label="Expanded" value={current.graph?.expandedComponents ?? 0} />
                    <Stat label="Boundaries" value={current.graph?.boundaries ?? 0} />
                    <Stat label="Cycles" value={current.graph?.cycles ?? 0} />
                  </div>
                  <div class="import-metadata">
                    <code>{current.repositoryPath}</code>
                    <code>{current.sourceVersion}</code>
                    <code>{current.adapterId}</code>
                    <Show when={current.graph}><code>{current.graph?.nodesMaterialized}/{current.graph?.maxNodes} nodes · {current.graph?.filesRead}/{current.graph?.maxFiles} files</code></Show>
                  </div>
                  <Show when={current.graph?.truncated}><p class="import-graph-warning">A graph budget stopped at least one expansion. The corresponding component instance remains an explicit boundary.</p></Show>
                  <Show when={current.diagnostics.length > 0}>
                    <div class="diagnostics import-diagnostics">
                      <For each={current.diagnostics}>
                        {(diagnostic) => <p class={`severity-${diagnostic.severity}`}><code>{diagnostic.code}</code>{diagnostic.message}</p>}
                      </For>
                    </div>
                  </Show>
                  <div class="import-actions">
                    <button class="primary" disabled={!current.document || hasBlockingDiagnostics()} onClick={openProjectSession}>Open in project session</button>
                    <button disabled={!current.document} onClick={downloadDocument}>Download UI IR</button>
                  </div>
                </section>

                <Show when={(current.files?.length ?? 0) > 0}>
                  <section class="import-card import-graph-card">
                    <div class="section-heading"><h2>File provenance</h2><span>{current.files?.length ?? 0} expansion records</span></div>
                    <div class="import-file-list">
                      <For each={current.files ?? []}>
                        {(file) => (
                          <div class="import-file-row">
                            <strong>{file.root ? "ROOT" : `D${file.depth}`}</strong>
                            <code>{file.repositoryPath}#{file.exportName}</code>
                            <span>{file.nodeCount} nodes</span>
                            <code>{file.sourceVersion}</code>
                          </div>
                        )}
                      </For>
                    </div>
                  </section>
                </Show>

                <Show when={(current.edges?.length ?? 0) > 0}>
                  <section class="import-card import-graph-card">
                    <div class="section-heading"><h2>Component graph</h2><span>{current.edges?.length ?? 0} edges</span></div>
                    <div class="import-edge-list">
                      <For each={current.edges ?? []}>{(edge) => <ImportEdge edge={edge} />}</For>
                    </div>
                  </section>
                </Show>

                <Show when={current.document} keyed>
                  {(document) => (
                    <section class="import-card import-tree-card">
                      <div class="section-heading"><h2>Recovered semantic tree</h2><span>{document.id}</span></div>
                      <div class="import-tree"><ImportedTreeNode node={document.root} depth={0} /></div>
                    </section>
                  )}
                </Show>
              </>
            )}
          </Show>
        </section>
      </main>
    </div>
  );
}

function Stat(props: { label: string; value: number }) {
  return <div class="import-stat"><strong>{props.value}</strong><span>{props.label}</span></div>;
}

function ImportEdge(props: { edge: ScreenImportGraphEdge }) {
  return (
    <div class={`import-edge-row status-${props.edge.status}`}>
      <span class="import-edge-status">{props.edge.status}</span>
      <code>{props.edge.fromRepositoryPath}#{props.edge.localName}</code>
      <span>→</span>
      <code>{props.edge.targetRepositoryPath ?? props.edge.moduleSpecifier}#{props.edge.importedName}</code>
      <Show when={props.edge.reason}><p>{props.edge.reason}</p></Show>
    </div>
  );
}

function ImportedTreeNode(props: { node: UiNode; depth: number }) {
  const mode = () => props.node.sourceRegion?.mode ?? "local";
  const kind = () => props.node.kind === "source-region" ? props.node.regionKind : props.node.kind;
  return (
    <div class="import-tree-branch">
      <div class={`import-tree-node mode-${mode()}`} style={{ "margin-left": `${props.depth * 18}px` }}>
        <span class="import-kind">{kind()}</span>
        <strong>{props.node.name}</strong>
        <span class="import-mode">{mode()}</span>
        <Show when={props.node.sourceRegion} keyed>
          {(region) => <code>{region.repositoryPath}:{region.line}:{region.column}</code>}
        </Show>
      </div>
      <Show when={props.node.sourceRegion?.reason}>
        <p class="import-reason" style={{ "margin-left": `${props.depth * 18 + 16}px` }}>{props.node.sourceRegion?.reason}</p>
      </Show>
      <Show when={props.node.kind === "source-region" && props.node.sourceRegion.excerpt}>
        <pre class="import-excerpt" style={{ "margin-left": `${props.depth * 18 + 16}px` }}>{props.node.sourceRegion.excerpt}</pre>
      </Show>
      <For each={props.node.children}>
        {(child) => <ImportedTreeNode node={child} depth={props.depth + 1} />}
      </For>
    </div>
  );
}

function splitBoundaries(value: string): string[] {
  return [...new Set(value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean))];
}

function clampNumber(value: string, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(parsed)));
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "screen";
}
