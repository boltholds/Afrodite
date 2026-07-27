import { createMemo, createSignal, For, Show } from "solid-js";
import {
  bridgeVariantOperationSchema,
  type BridgeApplyResult,
  type BridgeHealthResponse,
  type BridgePatchPlanView,
  type BridgeVariantOperation,
} from "@afrodite/protocol";
import type { InteractionState, Layout } from "@afrodite/ui-ir";
import { resolveEffectiveLayout } from "@afrodite/variants-core";
import { ProjectBridgeClient, ProjectBridgeClientError } from "./projectBridgeClient";

const BRIDGE_TOKEN_KEY = "afrodite.project-bridge.token";
const DEFAULT_BRIDGE_URL = import.meta.env.VITE_PROJECT_BRIDGE_URL ?? "http://127.0.0.1:4175";

const BASE_LAYOUT: Layout = {
  display: "flex",
  direction: "column",
  gap: 8,
  padding: 8,
  sizing: { width: "fill", height: "hug" },
};

const DEFAULT_OPERATION = JSON.stringify({
  kind: "update-variants",
  nodeId: "node.card",
  binding: {
    frameworkId: "react",
    adapterId: "afrodite.adapter.react",
    repositoryPath: "src/Card.tsx",
    stableMarker: "card.primary",
    styleOwnership: {
      strategy: "utility",
      dialect: "tailwind",
      attribute: "className",
      managedProperties: ["display", "direction", "gap", "padding", "width"],
    },
  },
  ownership: {
    strategy: "utility",
    dialect: "tailwind",
    attribute: "className",
    managedProperties: ["display", "direction", "gap", "padding", "width"],
  },
  before: {
    responsive: [],
    states: [],
  },
  after: {
    responsive: [
      {
        id: "tablet",
        name: "Tablet and wider",
        minWidth: 768,
        layout: { direction: "row", gap: 16 },
      },
      {
        id: "desktop",
        name: "Desktop",
        minWidth: 1280,
        layout: { gap: 24, padding: 16 },
      },
    ],
    states: [
      { id: "hovered", state: "hover", layout: { gap: 20 } },
      { id: "focused", state: "focus", layout: { padding: 12 } },
      { id: "disabled", state: "disabled", layout: { display: "block" } },
      { id: "loading", state: "loading", layout: { display: "grid" } },
      { id: "error", state: "error", layout: { gap: 32 } },
    ],
  },
}, null, 2);

export function VariantWorkbench() {
  const [bridgeUrl, setBridgeUrl] = createSignal(DEFAULT_BRIDGE_URL);
  const [bridgeToken, setBridgeToken] = createSignal(sessionStorage.getItem(BRIDGE_TOKEN_KEY) ?? "");
  const [health, setHealth] = createSignal<BridgeHealthResponse>();
  const [draft, setDraft] = createSignal(DEFAULT_OPERATION);
  const [operation, setOperation] = createSignal<BridgeVariantOperation>();
  const [plan, setPlan] = createSignal<BridgePatchPlanView>();
  const [result, setResult] = createSignal<BridgeApplyResult>();
  const [approvedPlanId, setApprovedPlanId] = createSignal("");
  const [viewport, setViewport] = createSignal(390);
  const [activeStates, setActiveStates] = createSignal<InteractionState[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [status, setStatus] = createSignal("Connect a local project bridge and plan semantic responsive or state overrides.");

  const client = () => new ProjectBridgeClient(bridgeUrl(), bridgeToken());
  const effectiveLayout = createMemo(() => resolveEffectiveLayout(
    BASE_LAYOUT,
    operation()?.after,
    { viewportWidth: viewport(), activeStates: activeStates() },
  ));
  const blocked = createMemo(() => {
    const current = plan();
    return !current || !current.changed || current.diagnostics.some((diagnostic) => diagnostic.severity === "error");
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
          : "Variant request failed");
    } finally {
      setBusy(false);
    }
  };

  const connect = () => run(async () => {
    const response = await client().health();
    sessionStorage.setItem(BRIDGE_TOKEN_KEY, bridgeToken());
    setHealth(response);
    setStatus(`Connected to ${response.projectName}. Variant edits remain semantic until an exact diff is approved.`);
  });

  const planVariants = () => run(async () => {
    let input: unknown;
    try {
      input = JSON.parse(draft());
    } catch {
      throw new Error("Variant operation JSON is invalid.");
    }
    const parsed = bridgeVariantOperationSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
    }
    const next = await client().planVariantPatch(parsed.data);
    setOperation(parsed.data);
    setPlan(next);
    setResult(undefined);
    setApprovedPlanId("");
    setStatus(next.changed
      ? `Planned ${parsed.data.after.responsive.length} responsive and ${parsed.data.after.states.length} state variants.`
      : "No source change was produced. Review ownership and diagnostics.");
  });

  const applyVariants = () => run(async () => {
    const current = plan();
    if (!current || approvedPlanId() !== current.planId || blocked()) return;
    const next = await client().applyPatch(current.planId, current.sourceVersion);
    setResult(next);
    setApprovedPlanId("");
    setStatus(next.status === "applied"
      ? "Variant source changes were applied and required verification passed."
      : `Variant write finished with ${next.status}.`);
  });

  const toggleState = (state: InteractionState) => {
    setActiveStates((current) => current.includes(state)
      ? current.filter((item) => item !== state)
      : [...current, state]);
  };

  return (
    <div class="variant-shell">
      <header class="variant-header">
        <div class="brand"><strong>Afrodite</strong><span>Responsive and component-state variants</span></div>
        <span class="status-line">{status()}</span>
      </header>

      <main class="variant-grid">
        <aside class="variant-panel">
          <section class="variant-card">
            <div class="section-heading"><h2>Local project bridge</h2><span>{health() ? `connected · ${health()!.projectName}` : "offline"}</span></div>
            <label>Bridge URL<input value={bridgeUrl()} onInput={(event) => setBridgeUrl(event.currentTarget.value)} /></label>
            <label>Session token<input type="password" autocomplete="off" value={bridgeToken()} onInput={(event) => setBridgeToken(event.currentTarget.value)} /></label>
            <button class="primary" disabled={busy() || bridgeToken().length < 16} onClick={() => void connect()}>Connect</button>
          </section>

          <section class="variant-card variant-editor">
            <div class="section-heading"><h2>Semantic variants</h2><span>UI IR operation</span></div>
            <textarea spellcheck={false} value={draft()} onInput={(event) => setDraft(event.currentTarget.value)} />
            <button class="primary" disabled={busy() || !health()} onClick={() => void planVariants()}>Plan variant patch</button>
            <p class="panel-hint">Tailwind utility and CSS Module ownership can materialize variants. Static inline styles and unscoped token bindings remain read-only.</p>
          </section>
        </aside>

        <section class="variant-workspace">
          <Show when={operation()} keyed fallback={
            <section class="variant-card variant-empty">
              <strong>No semantic variant operation yet</strong>
              <p>Responsive breakpoints and hover, focus, disabled, loading, or error states are stored in UI IR before source materialization.</p>
            </section>
          }>
            {(current) => (
              <section class="variant-card variant-preview">
                <div class="section-heading"><h2>Semantic preview</h2><span>{current.ownership.strategy}</span></div>
                <div class="variant-preview-controls">
                  <label>Viewport width<input type="number" min="0" value={viewport()} onInput={(event) => setViewport(Math.max(0, Number(event.currentTarget.value) || 0))} /></label>
                  <div class="variant-state-buttons">
                    <For each={["hover", "focus", "disabled", "loading", "error"] as const}>
                      {(state) => <button classList={{ active: activeStates().includes(state) }} onClick={() => toggleState(state)}>{state}</button>}
                    </For>
                  </div>
                </div>
                <pre>{JSON.stringify(effectiveLayout(), null, 2)}</pre>
                <div class="variant-lists">
                  <div><strong>Responsive</strong><For each={current.after.responsive}>{(variant) => <code>{variant.id} · {variant.minWidth}px{variant.maxWidth === undefined ? "+" : `–${variant.maxWidth}px`}</code>}</For></div>
                  <div><strong>States</strong><For each={current.after.states}>{(variant) => <code>{variant.state} · {variant.id}</code>}</For></div>
                </div>
              </section>
            )}
          </Show>

          <Show when={plan()} keyed>
            {(current) => (
              <>
                <section class="variant-card variant-diff-card">
                  <div class="section-heading"><h2>Exact source diff</h2><span>{current.repositoryPath}</span></div>
                  <div class="variant-meta"><code>{current.planId}</code><code>{current.sourceVersion}</code></div>
                  <pre class="variant-diff">{current.diff}</pre>
                  <Show when={current.diagnostics.length > 0}>
                    <div class="diagnostics"><For each={current.diagnostics}>{(diagnostic) => <p><code>{diagnostic.code}</code>{diagnostic.message}</p>}</For></div>
                  </Show>
                  <div class="variant-verification"><For each={current.verification}>{(step) => <code>{step.required ? "required" : "optional"} · {step.kind} · {step.command}</code>}</For></div>
                </section>
                <section class="variant-card variant-approval">
                  <label><input type="checkbox" checked={approvedPlanId() === current.planId} disabled={blocked()} onChange={(event) => setApprovedPlanId(event.currentTarget.checked ? current.planId : "")} />I reviewed this exact plan and source version.</label>
                  <button class="primary" disabled={busy() || blocked() || approvedPlanId() !== current.planId} onClick={() => void applyVariants()}>Apply, verify & rollback on failure</button>
                </section>
              </>
            )}
          </Show>

          <Show when={result()} keyed>
            {(current) => <section class={`variant-card variant-result status-${current.status}`}><div class="section-heading"><h2>Write result</h2><span>{current.status}</span></div><code>{current.beforeVersion}</code><Show when={current.afterVersion}><code>after {current.afterVersion}</code></Show><Show when={current.restoredVersion}><code>restored {current.restoredVersion}</code></Show></section>}
          </Show>
        </section>
      </main>
    </div>
  );
}
