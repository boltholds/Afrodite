import { createMemo, createSignal, For, Show } from "solid-js";
import {
  bridgeTransactionPlanRequestSchema,
  type BridgeHealthResponse,
  type BridgeTransactionApplyResult,
  type BridgeTransactionPlanView,
} from "@afrodite/protocol";
import { ProjectBridgeClient, ProjectBridgeClientError } from "./projectBridgeClient";

const BRIDGE_TOKEN_KEY = "afrodite.project-bridge.token";
const DEFAULT_BRIDGE_URL = import.meta.env.VITE_PROJECT_BRIDGE_URL ?? "http://127.0.0.1:4175";

const DEFAULT_OPERATIONS = JSON.stringify([
  {
    type: "layout",
    operation: {
      kind: "update-layout",
      nodeId: "node.card",
      binding: {
        frameworkId: "react",
        adapterId: "afrodite.adapter.react",
        repositoryPath: "src/Card.tsx",
        stableMarker: "card.primary",
      },
      before: {
        display: "block",
        direction: "column",
        gap: 4,
        padding: 8,
        sizing: { width: "hug", height: "hug" },
      },
      after: {
        display: "flex",
        direction: "row",
        gap: 16,
        padding: 12,
        sizing: { width: "fill", height: "hug" },
      },
    },
  },
  {
    type: "style",
    operation: {
      kind: "update-style",
      nodeId: "node.card",
      binding: {
        frameworkId: "react",
        adapterId: "afrodite.adapter.react",
        repositoryPath: "src/Card.tsx",
        stableMarker: "card.primary",
        styleOwnership: {
          strategy: "css-module",
          stylesheetPath: "src/Card.module.css",
          className: "card",
          managedProperties: ["gap", "padding"],
        },
      },
      ownership: {
        strategy: "css-module",
        stylesheetPath: "src/Card.module.css",
        className: "card",
        managedProperties: ["gap", "padding"],
      },
      before: {
        display: "block",
        direction: "column",
        gap: 4,
        padding: 8,
        sizing: { width: "hug", height: "hug" },
      },
      after: {
        display: "flex",
        direction: "row",
        gap: 16,
        padding: 12,
        sizing: { width: "fill", height: "hug" },
      },
    },
  },
], null, 2);

export function TransactionWorkbench() {
  const [bridgeUrl, setBridgeUrl] = createSignal(DEFAULT_BRIDGE_URL);
  const [bridgeToken, setBridgeToken] = createSignal(sessionStorage.getItem(BRIDGE_TOKEN_KEY) ?? "");
  const [health, setHealth] = createSignal<BridgeHealthResponse>();
  const [operationsDraft, setOperationsDraft] = createSignal(DEFAULT_OPERATIONS);
  const [transaction, setTransaction] = createSignal<BridgeTransactionPlanView>();
  const [result, setResult] = createSignal<BridgeTransactionApplyResult>();
  const [approvedTransactionId, setApprovedTransactionId] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [status, setStatus] = createSignal("Connect the local project bridge and review a multi-file semantic transaction.");

  const client = () => new ProjectBridgeClient(bridgeUrl(), bridgeToken());
  const blocked = createMemo(() => {
    const current = transaction();
    if (!current || current.changedFiles !== current.files.length || current.files.length < 2) return true;
    return current.diagnostics.some((diagnostic) => diagnostic.severity === "error")
      || current.files.some((file) => file.diagnostics.some((diagnostic) => diagnostic.severity === "error"));
  });

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setStatus(error instanceof ProjectBridgeClientError
        ? `${error.code}: ${error.message}`
        : error instanceof Error
          ? error.message
          : "Transaction request failed");
    } finally {
      setBusy(false);
    }
  };

  const connect = () => run(async () => {
    const response = await client().health();
    sessionStorage.setItem(BRIDGE_TOKEN_KEY, bridgeToken());
    setHealth(response);
    setStatus(`Connected to ${response.projectName}. Transaction edits and verification remain server-owned.`);
  });

  const planTransaction = () => run(async () => {
    let input: unknown;
    try {
      input = JSON.parse(operationsDraft());
    } catch {
      throw new Error("Operations JSON is invalid.");
    }
    const parsed = bridgeTransactionPlanRequestSchema.safeParse({ operations: input });
    if (!parsed.success) {
      throw new Error(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
    }
    const next = await client().planTransaction(parsed.data.operations);
    setTransaction(next);
    setResult(undefined);
    setApprovedTransactionId("");
    setStatus(next.changedFiles === next.files.length
      ? `Planned ${next.changedFiles} staged source writes.`
      : "The transaction contains blocked or unchanged targets. Review every file diagnostic.");
  });

  const applyTransaction = () => run(async () => {
    const current = transaction();
    if (!current || approvedTransactionId() !== current.transactionId || blocked()) return;
    const next = await client().applyTransaction(
      current.transactionId,
      current.files.map((file) => ({
        repositoryPath: file.repositoryPath,
        sourceVersion: file.sourceVersion,
      })),
    );
    setResult(next);
    setApprovedTransactionId("");
    setStatus(transactionResultMessage(next));
  });

  return (
    <div class="transaction-shell">
      <header class="transaction-header">
        <div class="brand"><strong>Afrodite</strong><span>Atomic multi-file verified transactions</span></div>
        <span class="status-line">{status()}</span>
      </header>

      <main class="transaction-grid">
        <aside class="transaction-panel">
          <section class="transaction-card">
            <div class="section-heading"><h2>Local project bridge</h2><span>{health() ? `connected · ${health()!.projectName}` : "offline"}</span></div>
            <label>Bridge URL<input value={bridgeUrl()} onInput={(event) => setBridgeUrl(event.currentTarget.value)} /></label>
            <label>Session token<input type="password" autocomplete="off" value={bridgeToken()} onInput={(event) => setBridgeToken(event.currentTarget.value)} /></label>
            <button class="primary" disabled={busy() || bridgeToken().length < 16} onClick={() => void connect()}>Connect</button>
          </section>

          <section class="transaction-card operation-editor">
            <div class="section-heading"><h2>Semantic operations</h2><span>2–32 operations</span></div>
            <textarea spellcheck={false} value={operationsDraft()} onInput={(event) => setOperationsDraft(event.currentTarget.value)} />
            <button class="primary" disabled={busy() || !health()} onClick={() => void planTransaction()}>Plan atomic transaction</button>
            <p class="panel-hint">The browser submits validated layout/style intent. It cannot submit offsets, replacements, staging paths, or verification commands.</p>
          </section>
        </aside>

        <section class="transaction-workspace">
          <Show when={transaction()} keyed fallback={
            <section class="transaction-card transaction-empty">
              <strong>No transaction plan yet</strong>
              <p>Each target will receive its own exact diff. Afrodite writes nothing until every source version is approved together.</p>
            </section>
          }>
            {(current) => (
              <>
                <section class="transaction-card transaction-summary">
                  <div class="section-heading"><h2>Transaction review</h2><span>{current.changedFiles}/{current.files.length} files changed</span></div>
                  <div class="transaction-identity"><code>{current.transactionId}</code></div>
                  <Show when={current.diagnostics.length > 0}>
                    <div class="diagnostics"><For each={current.diagnostics}>{(diagnostic) => <p><code>{diagnostic.code}</code>{diagnostic.message}</p>}</For></div>
                  </Show>
                  <div class="transaction-verification">
                    <strong>Shared verification</strong>
                    <For each={current.verification}>{(step) => <code>{step.required ? "required" : "optional"} · {step.kind} · {step.command}</code>}</For>
                  </div>
                </section>

                <For each={current.files}>
                  {(file) => (
                    <section class="transaction-card transaction-file">
                      <div class="section-heading"><h2>{file.repositoryPath}</h2><span>{file.changed ? "changed" : "unchanged"}</span></div>
                      <div class="transaction-file-meta"><code>{file.planId}</code><code>{file.sourceVersion}</code></div>
                      <pre class="transaction-diff">{file.diff}</pre>
                      <Show when={file.diagnostics.length > 0}>
                        <div class="diagnostics"><For each={file.diagnostics}>{(diagnostic) => <p><code>{diagnostic.code}</code>{diagnostic.message}</p>}</For></div>
                      </Show>
                    </section>
                  )}
                </For>

                <section class="transaction-card transaction-approval">
                  <label>
                    <input
                      type="checkbox"
                      checked={approvedTransactionId() === current.transactionId}
                      disabled={blocked()}
                      onChange={(event) => setApprovedTransactionId(event.currentTarget.checked ? current.transactionId : "")}
                    />
                    I reviewed this exact transaction ID and every listed source version.
                  </label>
                  <button class="primary" disabled={busy() || blocked() || approvedTransactionId() !== current.transactionId} onClick={() => void applyTransaction()}>Stage, commit, verify & apply</button>
                </section>
              </>
            )}
          </Show>

          <Show when={result()} keyed>
            {(current) => (
              <section class={`transaction-card transaction-result status-${current.status}`}>
                <div class="section-heading"><h2>Transaction result</h2><span>{current.status}</span></div>
                <For each={current.files}>
                  {(file) => (
                    <div class="transaction-result-file">
                      <strong>{file.repositoryPath}</strong>
                      <code>{file.beforeVersion}</code>
                      <Show when={file.afterVersion}><code>after {file.afterVersion}</code></Show>
                      <Show when={file.restoredVersion}><code>restored {file.restoredVersion}</code></Show>
                    </div>
                  )}
                </For>
                <For each={current.verification}>
                  {(execution) => <div class="verification-result"><strong>{execution.step.kind}</strong><span>{execution.ok ? "passed" : "failed"}</span></div>}
                </For>
                <Show when={current.diagnostics.length > 0}>
                  <div class="diagnostics"><For each={current.diagnostics}>{(diagnostic) => <p><code>{diagnostic.code}</code>{diagnostic.message}</p>}</For></div>
                </Show>
              </section>
            )}
          </Show>
        </section>
      </main>
    </div>
  );
}

function transactionResultMessage(result: BridgeTransactionApplyResult): string {
  switch (result.status) {
    case "applied": return `Applied ${result.files.length} files and passed required verification.`;
    case "rejected": return "The transaction was rejected before a complete commit.";
    case "rolled-back": return "The transaction failed and every committed file was restored.";
    case "rollback-failed": return "Rollback could not restore every file. Inspect the listed sources immediately.";
  }
}
