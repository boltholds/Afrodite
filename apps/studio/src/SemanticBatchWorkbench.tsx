import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { createReplaceDocumentCommand } from "@afrodite/canvas-engine";
import {
  createSemanticDocumentVersion,
} from "@afrodite/semantic-ops";
import {
  currentLiveProjectSessionState,
  executeLiveCommand,
  replaceCurrentLiveProjectSessionState,
} from "@afrodite/project-session";
import {
  semanticOperationCommandSchema,
  type SemanticOperationCommand,
} from "@afrodite/protocol";
import type { SemanticBatchPlanView } from "@afrodite/protocol/semantic-batch";
import { parseUiDocument, type UiDocument } from "@afrodite/ui-ir";
import { ProjectBridgeClient, ProjectBridgeClientError } from "./projectBridgeClient";
import { planSemanticBatchThroughBridge } from "./semanticBatchClient";

const BRIDGE_TOKEN_KEY = "afrodite.project-bridge.token";
const DEFAULT_BRIDGE_URL = import.meta.env.VITE_PROJECT_BRIDGE_URL ?? "http://127.0.0.1:4175";

const fallbackDocument = parseUiDocument({
  schemaVersion: 1,
  id: "document.semantic-batch-empty",
  name: "Open Project session first",
  root: {
    id: "node.root",
    kind: "element",
    element: "main",
    name: "Root",
    layout: {
      display: "block",
      direction: "column",
      sizing: { width: "fill", height: "fill" },
    },
    props: {},
    children: [],
  },
});

const defaultCommands: readonly SemanticOperationCommand[] = [
  { type: "convert_to_grid", nodeId: "node.sidebar", gap: 12 },
  {
    type: "create_responsive_variant",
    nodeId: "node.canvas",
    variantId: "tablet",
    minWidth: 768,
    layout: { direction: "row", gap: 20 },
  },
];

export function SemanticBatchWorkbench() {
  const [document, setDocument] = createSignal<UiDocument>(
    currentLiveProjectSessionState()?.history.present ?? fallbackDocument,
  );
  const [bridgeUrl, setBridgeUrl] = createSignal(DEFAULT_BRIDGE_URL);
  const [bridgeToken, setBridgeToken] = createSignal(sessionStorage.getItem(BRIDGE_TOKEN_KEY) ?? "");
  const [commandsDraft, setCommandsDraft] = createSignal(JSON.stringify(defaultCommands, null, 2));
  const [plan, setPlan] = createSignal<SemanticBatchPlanView>();
  const [approvedBatchId, setApprovedBatchId] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [status, setStatus] = createSignal("Typed semantic batch planner ready.");
  const [errors, setErrors] = createSignal<readonly string[]>([]);

  const currentVersion = createMemo(() => createSemanticDocumentVersion(document()));
  const canApply = createMemo(() => {
    const current = plan();
    return current?.status === "ready"
      && current.documentAfter !== undefined
      && approvedBatchId() === current.batchId
      && current.documentVersion === currentVersion();
  });

  onMount(() => {
    const synchronize = window.setInterval(() => {
      const current = currentLiveProjectSessionState();
      if (current && createSemanticDocumentVersion(current.history.present) !== currentVersion()) {
        setDocument(current.history.present);
        setPlan(undefined);
        setApprovedBatchId("");
        setStatus("Live project session changed; create a fresh batch plan.");
      }
    }, 400);
    onCleanup(() => window.clearInterval(synchronize));
  });

  const parseCommands = (): readonly SemanticOperationCommand[] | undefined => {
    try {
      const input = JSON.parse(commandsDraft()) as unknown;
      const parsed = semanticOperationCommandSchema.array().min(1).max(16).safeParse(input);
      if (!parsed.success) {
        setErrors(parsed.error.issues.map((issue) => `${formatPath(issue.path)}: ${issue.message}`));
        setStatus("Batch command JSON contains validation errors.");
        return undefined;
      }
      setErrors([]);
      return parsed.data;
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "Invalid JSON."]);
      setStatus("Batch command JSON is not valid JSON.");
      return undefined;
    }
  };

  const planBatch = async () => {
    const commands = parseCommands();
    if (!commands) return;
    if (bridgeToken().length < 16) {
      setStatus("Enter the local project bridge token first.");
      return;
    }
    setBusy(true);
    try {
      sessionStorage.setItem(BRIDGE_TOKEN_KEY, bridgeToken());
      const next = await planSemanticBatchThroughBridge(
        bridgeUrl(),
        bridgeToken(),
        document(),
        commands,
      );
      setPlan(next);
      setApprovedBatchId("");
      setStatus(next.status === "ready"
        ? `Planned ${next.batchId} with ${next.commands.length} ordered commands.`
        : "The batch was blocked before any document or source effect was approved.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const applyBatch = async () => {
    const currentPlan = plan();
    const live = currentLiveProjectSessionState();
    if (!currentPlan || !canApply() || !live || !currentPlan.documentAfter) return;
    if (createSemanticDocumentVersion(live.history.present) !== currentPlan.documentVersion) {
      setStatus("The live document changed after planning. Create a fresh batch plan.");
      setDocument(live.history.present);
      setApprovedBatchId("");
      return;
    }

    setBusy(true);
    try {
      const client = new ProjectBridgeClient(bridgeUrl(), bridgeToken());
      const changedPlans = currentPlan.sourcePlans.filter((source) => source.changed);

      if (currentPlan.sourceTransaction) {
        const result = await client.applyTransaction(
          currentPlan.sourceTransaction.transactionId,
          currentPlan.sourceTransaction.files.map((file) => ({
            planId: file.planId,
            sourceVersion: file.sourceVersion,
          })),
          "afrodite-studio-semantic-batch",
        );
        if (result.status !== "applied") {
          setStatus(`Source transaction ended with ${result.status}; the UI document was not changed.`);
          return;
        }
      } else if (changedPlans.length === 1) {
        const source = changedPlans[0]!;
        const result = await client.applyPatch(
          source.planId,
          source.sourceVersion,
          "afrodite-studio-semantic-batch",
        );
        if (result.status !== "applied") {
          setStatus(`Source patch ended with ${result.status}; the UI document was not changed.`);
          return;
        }
      } else if (changedPlans.length > 1) {
        throw new Error("A multi-file batch requires one bridge-owned source transaction.");
      }

      const command = createReplaceDocumentCommand(
        live.history.present,
        currentPlan.documentAfter,
        `Apply semantic batch ${currentPlan.batchId}`,
      );
      const next = executeLiveCommand(live, command, { invalidateAllPatchState: true });
      replaceCurrentLiveProjectSessionState(next);
      setDocument(next.history.present);
      setApprovedBatchId("");
      setPlan(undefined);
      setStatus(`Applied batch ${currentPlan.batchId} as one reversible Studio command.`);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="semantic-batch-shell">
      <header class="semantic-batch-header">
        <div class="brand"><strong>Afrodite</strong><span>Typed Semantic Batches</span></div>
        <span class="status-line">{status()}</span>
      </header>

      <div class="semantic-batch-grid">
        <aside class="semantic-batch-panel semantic-batch-inputs">
          <h2>Ordered command batch</h2>
          <label>Bridge URL<input value={bridgeUrl()} onInput={(event) => setBridgeUrl(event.currentTarget.value)} /></label>
          <label>Session token<input type="password" autocomplete="off" value={bridgeToken()} onInput={(event) => setBridgeToken(event.currentTarget.value)} /></label>
          <label>Commands JSON<textarea spellcheck={false} value={commandsDraft()} onInput={(event) => setCommandsDraft(event.currentTarget.value)} /></label>
          <Show when={errors().length > 0}>
            <div class="semantic-batch-errors"><For each={errors()}>{(item) => <p>{item}</p>}</For></div>
          </Show>
          <button class="primary" disabled={busy()} onClick={() => void planBatch()}>Plan bounded batch</button>
          <div class="semantic-batch-version"><span>Input document</span><code>{currentVersion()}</code></div>
        </aside>

        <main class="semantic-batch-results">
          <Show when={plan()} fallback={<section class="semantic-batch-empty">Plan a batch to inspect ordered semantic effects, conflicts, exact source diffs, and the combined document.</section>}>
            {(planAccessor) => {
              const current = planAccessor();
              return (
                <>
                  <section class={`semantic-batch-card status-${current.status}`}>
                    <div class="section-heading"><h2>Batch plan</h2><span>{current.status}</span></div>
                    <code>{current.batchId}</code>
                    <div class="semantic-batch-metadata">
                      <span>{current.applicationMode}</span>
                      <span>{current.commands.length} commands</span>
                      <span>{current.sourcePlans.length} source plans</span>
                      <span>{current.sourceTransaction ? "atomic transaction" : "no transaction"}</span>
                    </div>
                  </section>

                  <section class="semantic-batch-card">
                    <div class="section-heading"><h2>Ordered steps</h2><span>{current.steps.length}</span></div>
                    <For each={current.steps}>{(step) => (
                      <article class={`semantic-batch-step status-${step.status}`}>
                        <div><strong>{step.index + 1}. {step.command.type}</strong><code>{step.command.nodeId}</code></div>
                        <span>{step.applicationMode}</span>
                        <span>{step.sourceIntentCount} source intents</span>
                        <code>{step.documentVersionBefore}</code>
                        <Show when={step.documentVersionAfter}><code>{step.documentVersionAfter}</code></Show>
                      </article>
                    )}</For>
                  </section>

                  <Show when={current.diagnostics.length > 0}>
                    <section class="semantic-batch-card">
                      <div class="section-heading"><h2>Diagnostics</h2><span>{current.diagnostics.length}</span></div>
                      <For each={current.diagnostics}>{(diagnostic) => (
                        <p class={`semantic-batch-diagnostic severity-${diagnostic.severity}`}>
                          <code>{diagnostic.code}</code>
                          <span>{diagnostic.commandIndex === undefined ? "batch" : `command ${diagnostic.commandIndex + 1}`}</span>
                          {diagnostic.message}
                        </p>
                      )}</For>
                    </section>
                  </Show>

                  <For each={current.sourcePlans}>{(source) => (
                    <section class="semantic-batch-card">
                      <div class="section-heading"><h2>Exact source diff</h2><span>{source.changed ? "changed" : "unchanged"}</span></div>
                      <div class="semantic-batch-source-meta"><code>{source.repositoryPath}</code><code>{source.sourceVersion}</code><code>{source.planId}</code></div>
                      <pre class="semantic-batch-diff">{source.diff}</pre>
                    </section>
                  )}</For>

                  <Show when={current.sourceTransaction}>
                    {(transactionAccessor) => (
                      <section class="semantic-batch-card transaction-card">
                        <div class="section-heading"><h2>Atomic source transaction</h2><span>{transactionAccessor().files.length} files</span></div>
                        <code>{transactionAccessor().transactionId}</code>
                        <For each={transactionAccessor().verification}>{(step) => <p><code>{step.kind}</code>{step.command}</p>}</For>
                      </section>
                    )}
                  </Show>

                  <Show when={current.documentAfter}>
                    {(documentAccessor) => (
                      <section class="semantic-batch-card">
                        <div class="section-heading"><h2>Combined documentAfter</h2><span>one reversible command</span></div>
                        <pre class="semantic-batch-document">{JSON.stringify(documentAccessor(), null, 2)}</pre>
                      </section>
                    )}
                  </Show>

                  <Show when={current.status === "ready" && current.documentAfter}>
                    <section class="semantic-batch-card semantic-batch-approval">
                      <label>
                        <input
                          type="checkbox"
                          checked={approvedBatchId() === current.batchId}
                          onChange={(event) => setApprovedBatchId(event.currentTarget.checked ? current.batchId : "")}
                        />
                        I reviewed this exact batch ID, document version, every source diff, and the optional transaction.
                      </label>
                      <button class="primary" disabled={busy() || !canApply()} onClick={() => void applyBatch()}>
                        Apply exact reviewed batch
                      </button>
                    </section>
                  </Show>
                </>
              );
            }}
          </Show>
        </main>
      </div>
    </div>
  );
}

function formatPath(path: readonly PropertyKey[]): string {
  return path.length === 0 ? "$" : path.map(String).join(".");
}

function errorMessage(error: unknown): string {
  return error instanceof ProjectBridgeClientError
    ? `${error.code}: ${error.message}`
    : error instanceof Error
      ? error.message
      : "Semantic batch operation failed.";
}
