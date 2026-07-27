import { createMemo, createSignal, For, Show } from "solid-js";
import {
  semanticPlanRequestSchema,
  type BridgeApplyResult,
  type BridgePatchPlanView,
  type SemanticOperationCommand,
  type SemanticPlanView,
} from "@afrodite/protocol";
import { createSemanticDocumentVersion } from "@afrodite/semantic-ops";
import { parseUiDocument, type UiDocument } from "@afrodite/ui-ir";
import { ProjectBridgeClient, ProjectBridgeClientError } from "./projectBridgeClient";

const BRIDGE_TOKEN_KEY = "afrodite.project-bridge.token";
const DEFAULT_BRIDGE_URL = import.meta.env.VITE_PROJECT_BRIDGE_URL ?? "http://127.0.0.1:4175";

const DEFAULT_DOCUMENT = JSON.stringify({
  schemaVersion: 1,
  id: "doc.semantic-demo",
  name: "Semantic operation demo",
  root: {
    id: "node.card",
    kind: "element",
    element: "section",
    name: "Card",
    layout: {
      display: "flex",
      direction: "column",
      gap: 8,
      padding: 12,
      sizing: { width: "fill", height: "hug" },
    },
    variants: { responsive: [], states: [] },
    props: {},
    sourceBinding: {
      frameworkId: "react",
      adapterId: "afrodite.adapter.react",
      repositoryPath: "src/Card.tsx",
      stableMarker: "card.primary",
      styleOwnership: {
        strategy: "utility",
        dialect: "tailwind",
        attribute: "className",
        managedProperties: ["display", "direction", "gap", "padding"],
      },
    },
    children: [],
  },
}, null, 2);

const COMMAND_PRESETS: ReadonlyArray<{ label: string; command: SemanticOperationCommand }> = [
  {
    label: "Convert to grid",
    command: { type: "convert_to_grid", nodeId: "node.card", gap: 16 },
  },
  {
    label: "Create tablet variant",
    command: {
      type: "create_responsive_variant",
      nodeId: "node.card",
      variantId: "tablet",
      name: "Tablet",
      minWidth: 768,
      layout: { direction: "row", gap: 20 },
    },
  },
  {
    label: "Replace gap token",
    command: {
      type: "replace_spacing_with_token",
      nodeId: "node.card",
      property: "gap",
      tokenName: "--space-card",
      tokenFilePath: "src/tokens.css",
    },
  },
  {
    label: "Explain target",
    command: { type: "explain_unpatchable_region", nodeId: "node.card" },
  },
];

export function SemanticOperationsWorkbench() {
  const [bridgeUrl, setBridgeUrl] = createSignal(DEFAULT_BRIDGE_URL);
  const [bridgeToken, setBridgeToken] = createSignal(sessionStorage.getItem(BRIDGE_TOKEN_KEY) ?? "");
  const [connected, setConnected] = createSignal(false);
  const [documentDraft, setDocumentDraft] = createSignal(DEFAULT_DOCUMENT);
  const [commandDraft, setCommandDraft] = createSignal(JSON.stringify(COMMAND_PRESETS[0]!.command, null, 2));
  const [plan, setPlan] = createSignal<SemanticPlanView>();
  const [approvedSemanticPlan, setApprovedSemanticPlan] = createSignal("");
  const [approvedSourcePlans, setApprovedSourcePlans] = createSignal<Record<string, boolean>>({});
  const [sourceResults, setSourceResults] = createSignal<Record<string, BridgeApplyResult>>({});
  const [busy, setBusy] = createSignal(false);
  const [status, setStatus] = createSignal("Connect the local bridge and submit one validated semantic command.");

  const client = () => new ProjectBridgeClient(bridgeUrl(), bridgeToken());
  const currentDocument = createMemo<UiDocument | undefined>(() => {
    try {
      return parseUiDocument(JSON.parse(documentDraft()));
    } catch {
      return undefined;
    }
  });
  const documentPlanIsCurrent = createMemo(() => {
    const current = currentDocument();
    const currentPlan = plan();
    return Boolean(current && currentPlan && createSemanticDocumentVersion(current) === currentPlan.documentVersion);
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
          : "Semantic operation request failed");
    } finally {
      setBusy(false);
    }
  };

  const connect = () => run(async () => {
    const health = await client().health();
    sessionStorage.setItem(BRIDGE_TOKEN_KEY, bridgeToken());
    setConnected(true);
    setStatus(`Connected to ${health.projectName}. Semantic plans and source plans remain server-owned.`);
  });

  const choosePreset = (command: SemanticOperationCommand) => {
    setCommandDraft(JSON.stringify(command, null, 2));
    setPlan(undefined);
    setApprovedSemanticPlan("");
    setApprovedSourcePlans({});
    setSourceResults({});
  };

  const planOperation = () => run(async () => {
    let documentInput: unknown;
    let commandInput: unknown;
    try {
      documentInput = JSON.parse(documentDraft());
      commandInput = JSON.parse(commandDraft());
    } catch {
      throw new Error("Document or command JSON is invalid.");
    }
    const parsed = semanticPlanRequestSchema.safeParse({ document: documentInput, command: commandInput });
    if (!parsed.success) {
      throw new Error(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
    }
    const next = await client().planSemanticOperation(parsed.data.document, parsed.data.command);
    setPlan(next);
    setApprovedSemanticPlan("");
    setApprovedSourcePlans({});
    setSourceResults({});
    setStatus(next.status === "blocked"
      ? "The semantic command was blocked before any document or source change."
      : next.status === "informational"
        ? "The semantic command produced an explanation only."
        : `Semantic plan ready in ${next.applicationMode} mode.`);
  });

  const applyDocument = () => {
    const current = plan();
    if (
      !current
      || current.status !== "ready"
      || !current.documentAfter
      || approvedSemanticPlan() !== current.planId
      || !documentPlanIsCurrent()
    ) return;
    setDocumentDraft(JSON.stringify(current.documentAfter, null, 2));
    setApprovedSemanticPlan("");
    setStatus("Applied the exact reviewed semantic mutation to the workbench UI document. Source remains unchanged until separately approved.");
  };

  const applySource = (sourcePlan: BridgePatchPlanView) => run(async () => {
    if (!approvedSourcePlans()[sourcePlan.planId] || !sourcePlan.changed) return;
    const result = await client().applyPatch(sourcePlan.planId, sourcePlan.sourceVersion, "afrodite-semantic-workbench");
    setSourceResults((current) => ({ ...current, [sourcePlan.planId]: result }));
    setApprovedSourcePlans((current) => ({ ...current, [sourcePlan.planId]: false }));
    setStatus(result.status === "applied"
      ? `Applied verified source plan ${sourcePlan.planId}.`
      : `Source plan ${sourcePlan.planId} finished with ${result.status}.`);
  });

  return (
    <div class="semantic-shell">
      <header class="semantic-header">
        <div class="brand"><strong>Afrodite</strong><span>Constrained semantic operation API</span></div>
        <span class="status-line">{status()}</span>
      </header>

      <main class="semantic-grid">
        <aside class="semantic-sidebar">
          <section class="semantic-card">
            <div class="section-heading"><h2>Local project bridge</h2><span>{connected() ? "connected" : "offline"}</span></div>
            <label>Bridge URL<input value={bridgeUrl()} onInput={(event) => setBridgeUrl(event.currentTarget.value)} /></label>
            <label>Session token<input type="password" autocomplete="off" value={bridgeToken()} onInput={(event) => setBridgeToken(event.currentTarget.value)} /></label>
            <button class="primary" disabled={busy() || bridgeToken().length < 16} onClick={() => void connect()}>Connect</button>
          </section>

          <section class="semantic-card preset-list">
            <div class="section-heading"><h2>Command presets</h2><span>typed API</span></div>
            <For each={COMMAND_PRESETS}>{(preset) => (
              <button onClick={() => choosePreset(preset.command)}>{preset.label}</button>
            )}</For>
          </section>
        </aside>

        <section class="semantic-workspace">
          <section class="semantic-card semantic-editors">
            <label>
              <span>Current UI document</span>
              <textarea spellcheck={false} value={documentDraft()} onInput={(event) => {
                setDocumentDraft(event.currentTarget.value);
                setApprovedSemanticPlan("");
              }} />
            </label>
            <label>
              <span>Semantic command</span>
              <textarea spellcheck={false} value={commandDraft()} onInput={(event) => setCommandDraft(event.currentTarget.value)} />
            </label>
            <button class="primary" disabled={busy() || !connected()} onClick={() => void planOperation()}>Plan semantic operation</button>
            <p class="panel-hint">Commands contain intent and target IDs only. They cannot submit text edits, source offsets, shell commands, or approval decisions.</p>
          </section>

          <Show when={plan()} keyed fallback={
            <section class="semantic-card semantic-empty"><strong>No semantic plan yet</strong><p>Choose one bounded command and inspect capability, document, and source outcomes separately.</p></section>
          }>
            {(current) => (
              <>
                <section class={`semantic-card semantic-summary status-${current.status}`}>
                  <div class="section-heading"><h2>Semantic plan</h2><span>{current.status} · {current.applicationMode}</span></div>
                  <code>{current.planId}</code>
                  <code>{current.documentVersion}</code>
                  <div class="capability-grid">
                    <span>Document mutation <strong>{current.capabilities.documentMutation ? "yes" : "no"}</strong></span>
                    <span>Source planning <strong>{current.capabilities.sourcePlanning ? "yes" : "no"}</strong></span>
                    <span>Representation <strong>{current.capabilities.sourceRepresentation ?? "none"}</strong></span>
                  </div>
                  <Show when={current.diagnostics.length > 0}>
                    <div class="diagnostics"><For each={current.diagnostics}>{(diagnostic) => <p><code>{diagnostic.code}</code>{diagnostic.message}</p>}</For></div>
                  </Show>
                </section>

                <Show when={current.explanation} keyed>
                  {(explanation) => (
                    <section class="semantic-card semantic-explanation">
                      <h2>Why this region is not patchable</h2>
                      <p>{explanation.summary}</p>
                      <h3>Facts</h3>
                      <For each={explanation.facts}>{(fact) => <p>{fact}</p>}</For>
                      <h3>Safe next actions</h3>
                      <For each={explanation.nextActions}>{(action) => <p>{action}</p>}</For>
                    </section>
                  )}
                </Show>

                <Show when={current.documentAfter} keyed>
                  {(documentAfter) => (
                    <section class="semantic-card semantic-document-plan">
                      <div class="section-heading"><h2>UI IR mutation</h2><span>{documentPlanIsCurrent() ? "current" : "stale"}</span></div>
                      <pre>{JSON.stringify(documentAfter, null, 2)}</pre>
                      <label class="approval-row">
                        <input
                          type="checkbox"
                          checked={approvedSemanticPlan() === current.planId}
                          disabled={!documentPlanIsCurrent() || current.status !== "ready"}
                          onChange={(event) => setApprovedSemanticPlan(event.currentTarget.checked ? current.planId : "")}
                        />
                        I reviewed this semantic plan ID against this exact document version.
                      </label>
                      <button class="primary" disabled={busy() || approvedSemanticPlan() !== current.planId || !documentPlanIsCurrent()} onClick={applyDocument}>Apply to UI document</button>
                    </section>
                  )}
                </Show>

                <For each={current.sourcePlans}>
                  {(sourcePlan) => (
                    <section class="semantic-card semantic-source-plan">
                      <div class="section-heading"><h2>{sourcePlan.repositoryPath}</h2><span>{sourcePlan.changed ? "changed" : "blocked/unchanged"}</span></div>
                      <div class="source-identities"><code>{sourcePlan.planId}</code><code>{sourcePlan.sourceVersion}</code></div>
                      <pre>{sourcePlan.diff}</pre>
                      <Show when={sourcePlan.diagnostics.length > 0}>
                        <div class="diagnostics"><For each={sourcePlan.diagnostics}>{(diagnostic) => <p><code>{diagnostic.code}</code>{diagnostic.message}</p>}</For></div>
                      </Show>
                      <label class="approval-row">
                        <input
                          type="checkbox"
                          checked={approvedSourcePlans()[sourcePlan.planId] ?? false}
                          disabled={!sourcePlan.changed || sourcePlan.diagnostics.some((diagnostic) => diagnostic.severity === "error")}
                          onChange={(event) => setApprovedSourcePlans((currentApprovals) => ({ ...currentApprovals, [sourcePlan.planId]: event.currentTarget.checked }))}
                        />
                        I reviewed this exact source plan and source version.
                      </label>
                      <button class="primary" disabled={busy() || !(approvedSourcePlans()[sourcePlan.planId] ?? false)} onClick={() => void applySource(sourcePlan)}>Apply verified source patch</button>
                      <Show when={sourceResults()[sourcePlan.planId]} keyed>
                        {(result) => <div class={`semantic-source-result status-${result.status}`}><strong>{result.status}</strong><code>{result.beforeVersion}</code><Show when={result.afterVersion}><code>after {result.afterVersion}</code></Show><Show when={result.restoredVersion}><code>restored {result.restoredVersion}</code></Show></div>}
                      </Show>
                    </section>
                  )}
                </For>
              </>
            )}
          </Show>
        </section>
      </main>
    </div>
  );
}
