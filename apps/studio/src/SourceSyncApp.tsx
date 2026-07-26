import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import {
  layoutSchema,
  decodeUiDocument,
  type Layout,
  type UiDocument,
  type UiNode,
} from "@afrodite/ui-ir";
import type {
  BridgeApplyResult,
  BridgeHealthResponse,
  BridgeOperation,
  BridgePatchPlanView,
  BridgeSourceSnapshot,
} from "@afrodite/protocol";
import { ProjectBridgeClient, ProjectBridgeClientError } from "./projectBridgeClient";

const STORAGE_KEY = "afrodite.ui-document.v1";
const BRIDGE_TOKEN_KEY = "afrodite.project-bridge.token";
const DEFAULT_BRIDGE_URL = import.meta.env.VITE_PROJECT_BRIDGE_URL ?? "http://127.0.0.1:4175";

type BoundNode = UiNode & { sourceBinding: NonNullable<UiNode["sourceBinding"]> };

export function SourceSyncApp() {
  const initial = loadSavedDocument();
  const [document, setDocument] = createSignal<UiDocument | undefined>(initial.document);
  const [documentStatus, setDocumentStatus] = createSignal(initial.status);
  const boundNodes = createMemo(() => document() ? collectBoundNodes(document()!.root) : []);
  const [selectedId, setSelectedId] = createSignal(boundNodes()[0]?.id ?? "");
  const selectedNode = createMemo(() => boundNodes().find((node) => node.id === selectedId()));

  const [bridgeUrl, setBridgeUrl] = createSignal(DEFAULT_BRIDGE_URL);
  const [bridgeToken, setBridgeToken] = createSignal(sessionStorage.getItem(BRIDGE_TOKEN_KEY) ?? "");
  const [connection, setConnection] = createSignal<BridgeHealthResponse>();
  const [source, setSource] = createSignal<BridgeSourceSnapshot>();
  const [baselineLayout, setBaselineLayout] = createSignal<Layout>();
  const [layoutDraft, setLayoutDraft] = createSignal("");
  const [plan, setPlan] = createSignal<BridgePatchPlanView>();
  const [result, setResult] = createSignal<BridgeApplyResult>();
  const [approved, setApproved] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [status, setStatus] = createSignal("Connect a local project bridge to begin.");

  createEffect(() => {
    const node = selectedNode();
    if (!node) return;
    setLayoutDraft(JSON.stringify(node.layout, null, 2));
    setBaselineLayout(cloneLayout(node.layout));
    setSource(undefined);
    setPlan(undefined);
    setResult(undefined);
    setApproved(false);
  });

  const parsedLayout = createMemo(() => {
    try {
      const parsed = layoutSchema.safeParse(JSON.parse(layoutDraft()));
      return parsed.success
        ? { ok: true as const, layout: parsed.data }
        : {
            ok: false as const,
            message: parsed.error.issues
              .map((issue) => `${issue.path.join(".") || "$"}: ${issue.message}`)
              .join("; "),
          };
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : "Layout JSON is invalid.",
      };
    }
  });

  const planBlocked = createMemo(() =>
    !plan()?.changed || plan()?.diagnostics.some((diagnostic) => diagnostic.severity === "error") === true,
  );

  const client = () => new ProjectBridgeClient(bridgeUrl(), bridgeToken());

  const connect = async () => {
    await runBusy(async () => {
      const health = await client().health();
      sessionStorage.setItem(BRIDGE_TOKEN_KEY, bridgeToken());
      setConnection(health);
      setStatus(`Connected to ${health.projectName} with ${health.adapters.length} adapters.`);
    });
  };

  const reloadDocument = () => {
    const loaded = loadSavedDocument();
    setDocument(loaded.document);
    setDocumentStatus(loaded.status);
    const nextNodes = loaded.document ? collectBoundNodes(loaded.document.root) : [];
    setSelectedId(nextNodes[0]?.id ?? "");
    setStatus(loaded.status);
  };

  const readSource = async () => {
    const node = requireSelectedNode();
    if (!node) return;
    await runBusy(async () => {
      const snapshot = await client().readSource(node.sourceBinding.repositoryPath);
      setSource(snapshot);
      setBaselineLayout(cloneLayout(node.layout));
      setPlan(undefined);
      setResult(undefined);
      setApproved(false);
      setStatus(`Read ${snapshot.repositoryPath} at ${snapshot.version}.`);
    });
  };

  const planPatch = async () => {
    const node = requireSelectedNode();
    if (!node) return;
    const layout = parsedLayout();
    if (!layout.ok) {
      setStatus(`Layout is invalid: ${layout.message}`);
      return;
    }

    await runBusy(async () => {
      const operation: BridgeOperation = {
        kind: "update-layout",
        nodeId: node.id,
        binding: { ...node.sourceBinding },
        before: cloneLayout(baselineLayout() ?? node.layout),
        after: cloneLayout(layout.layout),
      };
      const nextPlan = await client().planPatch(operation);
      setPlan(nextPlan);
      setResult(undefined);
      setApproved(false);
      setStatus(nextPlan.changed
        ? `Planned ${nextPlan.planId}. Review the exact diff before approval.`
        : "The adapter produced no source change.");
    });
  };

  const applyPatch = async () => {
    const currentPlan = plan();
    if (!currentPlan || !approved() || planBlocked()) return;

    await runBusy(async () => {
      const nextResult = await client().applyPatch(
        currentPlan.planId,
        currentPlan.sourceVersion,
      );
      setResult(nextResult);
      setApproved(false);
      setStatus(resultMessage(nextResult));

      if (nextResult.status === "applied") {
        const node = selectedNode();
        if (node) {
          setSource(await client().readSource(node.sourceBinding.repositoryPath));
          const layout = parsedLayout();
          if (layout.ok) setBaselineLayout(cloneLayout(layout.layout));
        }
        setPlan(undefined);
      }
    });
  };

  async function runBusy(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      const message = error instanceof ProjectBridgeClientError
        ? `${error.code}: ${error.message}`
        : error instanceof Error
          ? error.message
          : "Project bridge request failed.";
      setStatus(message);
    } finally {
      setBusy(false);
    }
  }

  function requireSelectedNode(): BoundNode | undefined {
    const node = selectedNode();
    if (!node) setStatus("Select a source-bound node first.");
    return node;
  }

  return (
    <div class="source-sync-shell">
      <header class="source-sync-header">
        <div class="brand">
          <strong>Afrodite</strong>
          <span>Verified source synchronization</span>
        </div>
        <span class="status-line">{status()}</span>
      </header>

      <main class="source-sync-grid">
        <aside class="sync-panel sync-nodes">
          <div class="section-heading">
            <h2>Source-bound nodes</h2>
            <span>{boundNodes().length}</span>
          </div>
          <p class="panel-hint">{documentStatus()}</p>
          <button onClick={reloadDocument}>Reload saved UI document</button>
          <div class="sync-node-list">
            <For each={boundNodes()}>
              {(node) => (
                <button
                  classList={{ "sync-node": true, selected: node.id === selectedId() }}
                  onClick={() => setSelectedId(node.id)}
                >
                  <strong>{node.name}</strong>
                  <code>{node.sourceBinding.repositoryPath}</code>
                  <span>{node.sourceBinding.frameworkId ?? "framework unknown"}</span>
                </button>
              )}
            </For>
          </div>
          <Show when={boundNodes().length === 0}>
            <div class="sync-empty">
              Save a UI document from the Canvas workspace after placing or importing a source-bound component.
            </div>
          </Show>
        </aside>

        <section class="sync-workspace">
          <section class="sync-card bridge-card">
            <div class="section-heading">
              <h2>Local project bridge</h2>
              <span>{connection() ? `connected · v${connection()!.bridgeVersion}` : "offline"}</span>
            </div>
            <div class="bridge-fields">
              <label>
                Bridge URL
                <input value={bridgeUrl()} onInput={(event) => setBridgeUrl(event.currentTarget.value)} />
              </label>
              <label>
                Session token
                <input
                  type="password"
                  autocomplete="off"
                  value={bridgeToken()}
                  onInput={(event) => setBridgeToken(event.currentTarget.value)}
                />
              </label>
              <button class="primary" disabled={busy() || bridgeToken().length < 16} onClick={connect}>
                Connect
              </button>
            </div>
            <Show when={connection()}>
              {(health) => (
                <div class="adapter-strip">
                  <For each={health().adapters}>
                    {(adapter) => (
                      <span classList={{ active: adapter.capabilities.sourcePatching }}>
                        {adapter.displayName} · {adapter.capabilities.sourcePatching ? "patching" : "read-only"}
                      </span>
                    )}
                  </For>
                </div>
              )}
            </Show>
          </section>

          <section class="sync-card operation-card">
            <div class="section-heading">
              <h2>Layout operation</h2>
              <span>{selectedNode()?.sourceBinding.stableMarker ?? "no stable marker"}</span>
            </div>
            <Show when={selectedNode()} keyed fallback={<div class="sync-empty">Select a source-bound node.</div>}>
              {(node) => (
                <>
                  <div class="binding-grid">
                    <code>{node.sourceBinding.repositoryPath}</code>
                    <code>{node.sourceBinding.adapterId ?? node.sourceBinding.frameworkId ?? "adapter missing"}</code>
                  </div>
                  <textarea
                    class="layout-editor"
                    spellcheck={false}
                    value={layoutDraft()}
                    onInput={(event) => {
                      setLayoutDraft(event.currentTarget.value);
                      setPlan(undefined);
                      setResult(undefined);
                      setApproved(false);
                    }}
                  />
                  <Show when={!parsedLayout().ok}>
                    <div class="diagnostics"><p>{parsedLayout().ok ? "" : parsedLayout().message}</p></div>
                  </Show>
                  <div class="sync-actions">
                    <button disabled={busy()} onClick={readSource}>Read current source</button>
                    <button class="primary" disabled={busy() || !parsedLayout().ok} onClick={planPatch}>
                      Plan verified patch
                    </button>
                  </div>
                </>
              )}
            </Show>
          </section>

          <Show when={source()} keyed>
            {(snapshot) => (
              <details class="sync-card source-card">
                <summary>Current source · {snapshot.repositoryPath} · {snapshot.version}</summary>
                <pre class="source-view">{snapshot.content}</pre>
              </details>
            )}
          </Show>

          <Show when={plan()} keyed>
            {(currentPlan) => (
              <section class="sync-card diff-card">
                <div class="section-heading">
                  <h2>Exact unified diff</h2>
                  <span>{currentPlan.planId}</span>
                </div>
                <div class="plan-metadata">
                  <code>{currentPlan.repositoryPath}</code>
                  <code>{currentPlan.sourceVersion}</code>
                </div>
                <pre class="diff-view">{currentPlan.diff}</pre>

                <Show when={currentPlan.diagnostics.length > 0}>
                  <div class="diagnostics">
                    <For each={currentPlan.diagnostics}>
                      {(diagnostic) => <p><code>{diagnostic.code}</code>{diagnostic.message}</p>}
                    </For>
                  </div>
                </Show>

                <div class="verification-plan">
                  <For each={currentPlan.verification}>
                    {(step) => (
                      <span classList={{ required: step.required }}>
                        {step.kind} · {step.required ? "required" : "optional"}
                      </span>
                    )}
                  </For>
                </div>

                <label class="approval-check">
                  <input
                    type="checkbox"
                    checked={approved()}
                    disabled={planBlocked()}
                    onChange={(event) => setApproved(event.currentTarget.checked)}
                  />
                  I reviewed this exact plan ID and source version.
                </label>
                <button
                  class="primary destructive-approval"
                  disabled={busy() || planBlocked() || !approved()}
                  onClick={applyPatch}
                >
                  Approve exact diff & apply
                </button>
              </section>
            )}
          </Show>

          <Show when={result()} keyed>
            {(currentResult) => (
              <section class={`sync-card result-card status-${currentResult.status}`}>
                <div class="section-heading">
                  <h2>Write result</h2>
                  <span>{currentResult.status}</span>
                </div>
                <div class="result-versions">
                  <code>before {currentResult.beforeVersion}</code>
                  <Show when={currentResult.afterVersion}><code>after {currentResult.afterVersion}</code></Show>
                  <Show when={currentResult.restoredVersion}><code>restored {currentResult.restoredVersion}</code></Show>
                </div>
                <For each={currentResult.verification}>
                  {(execution) => (
                    <details classList={{ "verification-result": true, failed: !execution.ok }}>
                      <summary>{execution.step.kind} · {execution.ok ? "passed" : "failed"}</summary>
                      <pre>{execution.stdout || execution.stderr || "No output."}</pre>
                    </details>
                  )}
                </For>
                <Show when={currentResult.diagnostics.length > 0}>
                  <div class="diagnostics">
                    <For each={currentResult.diagnostics}>
                      {(diagnostic) => <p><code>{diagnostic.code}</code>{diagnostic.message}</p>}
                    </For>
                  </div>
                </Show>
              </section>
            )}
          </Show>
        </section>
      </main>
    </div>
  );
}

function loadSavedDocument(): { document?: UiDocument; status: string } {
  const source = localStorage.getItem(STORAGE_KEY);
  if (!source) return { status: "No saved Canvas document was found." };
  const decoded = decodeUiDocument(source);
  if (!decoded.ok) {
    return { status: `Saved document is invalid: ${decoded.diagnostics[0]?.message ?? "unknown error"}` };
  }
  return {
    document: decoded.document,
    status: `Loaded ${decoded.document.name} from browser storage.`,
  };
}

function collectBoundNodes(root: UiNode): BoundNode[] {
  const nodes: BoundNode[] = [];
  const visit = (node: UiNode) => {
    if (node.sourceBinding) nodes.push(node as BoundNode);
    for (const child of node.children) visit(child);
  };
  visit(root);
  return nodes;
}

function cloneLayout(layout: Layout): Layout {
  return { ...layout, sizing: { ...layout.sizing } };
}

function resultMessage(result: BridgeApplyResult): string {
  switch (result.status) {
    case "applied":
      return "Source patch applied and all required verification passed.";
    case "rolled-back":
      return "A required verification failed; the original source was restored.";
    case "rollback-failed":
      return "Verification failed and automatic rollback could not complete. Inspect the file immediately.";
    case "rejected":
      return "The write was rejected before a verified change could be kept.";
  }
}
