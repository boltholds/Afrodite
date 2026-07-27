import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type {
  BridgeApplyResult,
  BridgePatchPlanView,
  HumanReviewRequest,
} from "@afrodite/protocol";
import { serializeUiDocument } from "@afrodite/ui-ir";
import { ProjectBridgeClient, ProjectBridgeClientError } from "./projectBridgeClient";

const BRIDGE_TOKEN_KEY = "afrodite.project-bridge.token";
const DOCUMENT_STORAGE_KEY = "afrodite.ui-document.v1";
const DEFAULT_BRIDGE_URL = import.meta.env.VITE_PROJECT_BRIDGE_URL ?? "http://127.0.0.1:4175";

export function ReviewInboxWorkbench() {
  const [bridgeUrl, setBridgeUrl] = createSignal(DEFAULT_BRIDGE_URL);
  const [bridgeToken, setBridgeToken] = createSignal(sessionStorage.getItem(BRIDGE_TOKEN_KEY) ?? "");
  const [connected, setConnected] = createSignal(false);
  const [requests, setRequests] = createSignal<readonly HumanReviewRequest[]>([]);
  const [selectedId, setSelectedId] = createSignal("");
  const [reviewer, setReviewer] = createSignal("afrodite-studio-user");
  const [note, setNote] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [status, setStatus] = createSignal("Connect to the project bridge to review agent requests.");
  const [sourceResults, setSourceResults] = createSignal<Record<string, BridgeApplyResult>>({});

  const selected = createMemo(() => requests().find((request) => request.requestId === selectedId()));
  const client = () => new ProjectBridgeClient(bridgeUrl(), bridgeToken());

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setStatus(error instanceof ProjectBridgeClientError
        ? `${error.code}: ${error.message}`
        : error instanceof Error
          ? error.message
          : "Review inbox request failed.");
    } finally {
      setBusy(false);
    }
  };

  const refresh = async (silent = false) => {
    const next = await client().listReviewRequests();
    setRequests(next);
    if (!selectedId() && next[0]) setSelectedId(next[0].requestId);
    if (selectedId() && !next.some((entry) => entry.requestId === selectedId())) {
      setSelectedId(next[0]?.requestId ?? "");
    }
    if (!silent) setStatus(`Loaded ${next.length} durable review request${next.length === 1 ? "" : "s"}.`);
  };

  const connect = () => run(async () => {
    await client().health();
    sessionStorage.setItem(BRIDGE_TOKEN_KEY, bridgeToken());
    setConnected(true);
    await refresh();
  });

  const decide = (decision: "approved" | "rejected") => run(async () => {
    const request = selected();
    if (!request) return;
    const updated = await client().decideReviewRequest(
      request.requestId,
      decision,
      reviewer(),
      note(),
    );
    setRequests((current) => current.map((entry) => entry.requestId === updated.requestId ? updated : entry));
    setNote("");
    setStatus(`Review request ${updated.requestId} was ${updated.status}. No source write was performed.`);
  });

  const applyDocument = () => {
    const request = selected();
    if (!request?.documentAfter || request.status !== "approved") return;
    localStorage.setItem(DOCUMENT_STORAGE_KEY, serializeUiDocument(request.documentAfter));
    window.location.reload();
  };

  const applySourcePlan = (plan: BridgePatchPlanView) => run(async () => {
    const request = selected();
    if (!request || request.status !== "approved") return;
    const result = await client().applyPatch(plan.planId, plan.sourceVersion, reviewer());
    setSourceResults((current) => ({ ...current, [plan.planId]: result }));
    setStatus(result.status === "applied"
      ? `Applied verified source plan ${plan.planId}.`
      : `Source plan ${plan.planId} completed with ${result.status}.`);
  });

  onMount(() => {
    const interval = window.setInterval(() => {
      if (connected() && !busy()) void refresh(true).catch(() => undefined);
    }, 2_000);
    onCleanup(() => window.clearInterval(interval));
  });

  return (
    <div class="review-inbox-shell">
      <header class="review-inbox-header">
        <div class="brand"><strong>Afrodite</strong><span>Human Review Inbox</span></div>
        <span class="status-line">{status()}</span>
      </header>

      <main class="review-inbox-grid">
        <aside class="review-inbox-sidebar">
          <section class="review-card">
            <div class="section-heading"><h2>Local project bridge</h2><span>{connected() ? "connected" : "offline"}</span></div>
            <label>Bridge URL<input value={bridgeUrl()} onInput={(event) => setBridgeUrl(event.currentTarget.value)} /></label>
            <label>Session token<input type="password" autocomplete="off" value={bridgeToken()} onInput={(event) => setBridgeToken(event.currentTarget.value)} /></label>
            <button class="primary" disabled={busy() || bridgeToken().length < 16} onClick={() => void connect()}>Connect</button>
          </section>

          <section class="review-card request-list">
            <div class="section-heading"><h2>Requests</h2><span>{requests().length}</span></div>
            <Show when={requests().length > 0} fallback={<p class="panel-hint">No agent requests have been submitted.</p>}>
              <For each={requests()}>{(request) => (
                <button
                  classList={{ active: selectedId() === request.requestId }}
                  onClick={() => setSelectedId(request.requestId)}
                >
                  <strong>{request.command.type}</strong>
                  <span>{request.actor} · {request.status}</span>
                  <small>{request.requestId}</small>
                </button>
              )}</For>
            </Show>
          </section>
        </aside>

        <section class="review-inbox-content">
          <Show when={selected()} fallback={<section class="review-card"><p>Select a review request.</p></section>}>
            {(requestAccessor) => {
              const request = requestAccessor();
              return (
                <>
                  <section class={`review-card review-summary status-${request.status}`}>
                    <div class="section-heading"><h2>{request.command.type}</h2><span>{request.status}</span></div>
                    <p>{request.rationale ?? "No agent rationale was supplied."}</p>
                    <dl>
                      <div><dt>Actor</dt><dd>{request.actor}</dd></div>
                      <div><dt>Semantic plan</dt><dd><code>{request.semanticPlanId}</code></dd></div>
                      <div><dt>Document version</dt><dd><code>{request.documentVersion}</code></dd></div>
                      <div><dt>Expires</dt><dd>{new Date(request.expiresAt).toLocaleString()}</dd></div>
                    </dl>
                    <pre>{JSON.stringify(request.command, null, 2)}</pre>
                  </section>

                  <Show when={request.status === "pending"}>
                    <section class="review-card human-decision">
                      <div class="section-heading"><h2>Human decision</h2><span>decision only</span></div>
                      <label>Reviewer<input value={reviewer()} onInput={(event) => setReviewer(event.currentTarget.value)} /></label>
                      <label>Note<textarea value={note()} onInput={(event) => setNote(event.currentTarget.value)} /></label>
                      <div class="review-actions">
                        <button class="primary" disabled={busy() || !reviewer().trim()} onClick={() => void decide("approved")}>Approve for manual application</button>
                        <button class="danger" disabled={busy() || !reviewer().trim()} onClick={() => void decide("rejected")}>Reject</button>
                      </div>
                    </section>
                  </Show>

                  <Show when={request.decision}>
                    {(decision) => (
                      <section class="review-card decision-record">
                        <div class="section-heading"><h2>Decision record</h2><span>{decision().decision}</span></div>
                        <p>{decision().decidedBy} · {new Date(decision().decidedAt).toLocaleString()}</p>
                        <Show when={decision().note}><p>{decision().note}</p></Show>
                      </section>
                    )}
                  </Show>

                  <Show when={request.documentAfter}>
                    {(documentAfter) => (
                      <section class="review-card reviewed-document">
                        <div class="section-heading"><h2>Semantic UI IR mutation</h2><span>{request.applicationMode}</span></div>
                        <pre>{JSON.stringify(documentAfter(), null, 2)}</pre>
                        <button
                          class="primary"
                          disabled={request.status !== "approved"}
                          onClick={applyDocument}
                        >Load approved document into Studio and reload</button>
                        <p class="panel-hint">This starts a new Studio command history from the reviewed document. It does not write source files.</p>
                      </section>
                    )}
                  </Show>

                  <For each={request.sourcePlans}>{(plan) => (
                    <section class="review-card reviewed-source-plan">
                      <div class="section-heading"><h2>{plan.repositoryPath}</h2><span>{plan.changed ? "changed" : "unchanged"}</span></div>
                      <code>{plan.planId} · {plan.sourceVersion}</code>
                      <pre>{plan.diff || "No source change."}</pre>
                      <Show when={plan.diagnostics.length > 0}>
                        <div class="diagnostics"><For each={plan.diagnostics}>{(diagnostic) => <p><code>{diagnostic.code}</code>{diagnostic.message}</p>}</For></div>
                      </Show>
                      <button
                        class="primary"
                        disabled={busy() || request.status !== "approved" || !plan.changed || plan.diagnostics.some((item) => item.severity === "error")}
                        onClick={() => void applySourcePlan(plan)}
                      >Apply this exact verified source plan</button>
                      <Show when={sourceResults()[plan.planId]}>{(result) => (
                        <p class={`source-result status-${result().status}`}>Result: {result().status}</p>
                      )}</Show>
                    </section>
                  )}</For>
                </>
              );
            }}
          </Show>
        </section>
      </main>
    </div>
  );
}
