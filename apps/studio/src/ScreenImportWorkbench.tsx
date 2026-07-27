import { createMemo, createSignal, For, Show } from "solid-js";
import type {
  BridgeHealthResponse,
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
  const [result, setResult] = createSignal<ScreenImportResult>();
  const [busy, setBusy] = createSignal(false);
  const [status, setStatus] = createSignal("Connect a local project bridge to import a bounded screen.");

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
    setStatus(`Connected to ${response.projectName}. Import reads source snapshots without executing project modules.`);
  });

  const importScreen = () => run(async () => {
    const response = await client().importScreen({
      adapterId: adapterId(),
      repositoryPath: repositoryPath(),
      ...(exportName().trim() ? { exportName: exportName().trim() } : {}),
      ...(documentName().trim() ? { documentName: documentName().trim() } : {}),
      maxDepth: maxDepth(),
    });
    setResult(response);
    setStatus(response.document
      ? `Imported ${response.stats.totalNodes} nodes from ${response.exportName ?? repositoryPath()}.`
      : "The importer did not create a document. Review the diagnostics and choose a bounded export.");
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
        <div class="brand"><strong>Afrodite</strong><span>Bounded existing screen import</span></div>
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
            <div class="section-heading"><h2>Import boundary</h2><span>one source file</span></div>
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
            <label>Maximum import depth<input type="number" min="1" max="128" value={maxDepth()} onInput={(event) => setMaxDepth(clampDepth(event.currentTarget.value))} /></label>
            <button class="primary" disabled={busy() || !health() || !adapterId() || !repositoryPath().trim()} onClick={() => void importScreen()}>Import static screen</button>
            <p class="panel-hint">The importer parses one TSX/JSX module statically. It does not start Vite, import the module, call hooks, fetch data, or render application code.</p>
          </section>
        </aside>

        <section class="import-workspace">
          <Show when={result()} keyed fallback={
            <section class="import-card import-empty">
              <strong>No import result yet</strong>
              <p>Choose an exported screen component. Supported JSX becomes Semantic UI IR; control flow and unresolved expressions remain source-backed read-only regions.</p>
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
                  </div>
                  <div class="import-metadata">
                    <code>{current.repositoryPath}</code>
                    <code>{current.sourceVersion}</code>
                    <code>{current.adapterId}</code>
                  </div>
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

function clampDepth(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 32;
  return Math.min(128, Math.max(1, Math.round(parsed)));
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "screen";
}
