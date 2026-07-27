import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import {
  executeLiveProjectDocumentReplacement,
  LiveProjectDocumentExecutionError,
} from "@afrodite/project-session/execution";
import type {
  BridgeApplyResult,
  HumanReviewRequest,
  ReviewedExecutionSourceResult,
} from "@afrodite/protocol";
import { createSemanticDocumentVersion } from "@afrodite/semantic-ops";
import { ProjectBridgeClient, ProjectBridgeClientError } from "./projectBridgeClient";

const BRIDGE_TOKEN_KEY = "afrodite.project-bridge.token";
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
  const [confirmedPreparationId, setConfirmedPreparationId] = createSignal("");
  const [sourceResults, setSourceResults] = createSignal<Record<string, BridgeApplyResult>>({});

  const selected = createMemo(() => requests().find((request) => request.requestId === selectedId()));
  const preparation = createMemo(() => selected()?.preparation);
  const changedFreshPlans = createMemo(() => preparation()?.plan.sourcePlans.filter((plan) => plan.changed) ?? []);
  const preparationBlocked = createMemo(() => {
    const current = preparation();
    if (!current || current.plan.status !== "ready") return true;
    if (current.plan.diagnostics.some((diagnostic) => diagnostic.severity === "error")) return true;
    if (current.plan.sourcePlans.some((plan) => plan.diagnostics.some((diagnostic) => diagnostic.severity === "error"))) return true;
    if (changedFreshPlans().length > 1) return true;
    return !current.plan.documentAfter && changedFreshPlans().length === 0;
  });
  const client = () => new ProjectBridgeClient(bridgeUrl(), bridgeToken());

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setStatus(error instanceof ProjectBridgeClientError
        ? `${error.code}: ${error.message}`
        : error instanceof LiveProjectDocumentExecutionError
          ? `${error.code}: ${error.message}`
          : error instanceof Error
            ? error.message
            : "Review inbox request failed.");
    } finally {
      setBusy(false);
    }
  };

  const replaceRequest = (updated: HumanReviewRequest) => {
    setRequests((current) => current.map((entry) => entry.requestId === updated.requestId ? updated : entry));
  };

  const refresh = async (silent = false) => {
    const next = await client().listReviewRequests();
    setRequests(next);
    if (!selectedId() && next[0]) setSelectedId(next[0].requestId);
    if (selectedId() && !next.some((entry) => entry.requestId === selectedId())) {
      setSelectedId(next[0]?.requestId ?? "");
    }
    const activePreparation = next.find((entry) => entry.requestId === selectedId())?.preparation;
    if (!activePreparation || activePreparation.preparationId !== confirmedPreparationId()) {
      setConfirmedPreparationId("");
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
    replaceRequest(updated);
    setNote("");
    setConfirmedPreparationId("");
    setStatus(`Review request ${updated.requestId} was ${updated.status}. No source write was performed.`);
  });

  const prepareExecution = () => run(async () => {
    const request = selected();
    if (!request || request.status !== "approved" || !reviewer().trim()) return;
    const updated = await client().prepareReviewExecution(request.requestId, reviewer().trim());
    replaceRequest(updated);
    setConfirmedPreparationId("");
    setSourceResults({});
    const current = updated.preparation!;
    setStatus(current.comparison.exactMatch
      ? `Prepared ${current.preparationId}; fresh effects exactly match the approved snapshot.`
      : `Prepared ${current.preparationId}; fresh effects differ and require a new execution review.`);
  });

  const executePreparation = () => run(async () => {
    const request = selected();
    const current = request?.preparation;
    if (
      !request
      || request.status !== "approved"
      || request.execution
      || !current
      || preparationBlocked()
      || confirmedPreparationId() !== current.preparationId
      || !reviewer().trim()
    ) return;

    const live = await client().readLiveSession();
    if (
      live.sessionId !== current.liveSessionId
      || live.revision !== current.liveRevision
      || live.documentVersion !== current.liveDocumentVersion
    ) {
      throw new ProjectBridgeClientError(
        "REVIEW_PREPARATION_STALE",
        "The Studio session changed after preparation. Prepare a fresh execution before applying anything.",
      );
    }

    const freshChangedPlans = current.plan.sourcePlans.filter((plan) => plan.changed);
    if (freshChangedPlans.length > 1) {
      throw new ProjectBridgeClientError(
        "REVIEW_MULTI_SOURCE_EXECUTION_UNSUPPORTED",
        "Reviewed execution v1 supports at most one changed source plan. Use the transaction workbench for multi-file effects.",
      );
    }

    const recordedSourceResults: ReviewedExecutionSourceResult[] = [];
    for (const plan of freshChangedPlans) {
      let result: BridgeApplyResult;
      try {
        result = await client().applyPatch(plan.planId, plan.sourceVersion, reviewer().trim());
      } catch (error) {
        if (error instanceof ProjectBridgeClientError && error.code === "PLAN_NOT_FOUND") {
          throw new ProjectBridgeClientError(
            "REVIEW_PREPARATION_EXPIRED",
            "The prepared source plan expired or was consumed. Prepare the execution again and review the fresh diff.",
          );
        }
        throw error;
      }
      recordedSourceResults.push({
        planId: plan.planId,
        repositoryPath: plan.repositoryPath,
        sourceVersion: plan.sourceVersion,
        result,
      });
      setSourceResults((previous) => ({ ...previous, [plan.planId]: result }));
      if (result.status !== "applied") {
        const updated = await client().recordReviewExecution({
          requestId: request.requestId,
          preparationId: current.preparationId,
          executedBy: reviewer().trim(),
          documentApplied: false,
          sourceResults: recordedSourceResults,
        });
        replaceRequest(updated);
        setConfirmedPreparationId("");
        setStatus(`Fresh source plan completed with ${result.status}; the document effect was not applied.`);
        return;
      }
    }

    let documentApplied = false;
    let documentCommandId: string | undefined;
    let documentRevision: number | undefined;
    let documentVersionAfter: string | undefined;

    if (current.plan.documentAfter) {
      try {
        const receipt = await executeLiveProjectDocumentReplacement({
          document: current.plan.documentAfter,
          label: `Execute reviewed agent request ${request.requestId}`,
          expectedRevision: current.liveRevision,
          reviewRequestId: request.requestId,
          preparationId: current.preparationId,
        });
        documentApplied = true;
        documentCommandId = receipt.commandId;
        documentRevision = receipt.revision;
        documentVersionAfter = createSemanticDocumentVersion(receipt.document);
      } catch (error) {
        const updated = await client().recordReviewExecution({
          requestId: request.requestId,
          preparationId: current.preparationId,
          executedBy: reviewer().trim(),
          documentApplied: false,
          sourceResults: recordedSourceResults,
        });
        replaceRequest(updated);
        setConfirmedPreparationId("");
        if (error instanceof LiveProjectDocumentExecutionError) {
          throw new LiveProjectDocumentExecutionError(
            error.code,
            `${error.message} Source effects, if any, are recorded as a partial execution. Prepare again against the current session.`,
          );
        }
        throw error;
      }
    }

    const updated = await client().recordReviewExecution({
      requestId: request.requestId,
      preparationId: current.preparationId,
      executedBy: reviewer().trim(),
      documentApplied,
      ...(documentCommandId ? { documentCommandId } : {}),
      ...(documentRevision === undefined ? {} : { documentRevision }),
      ...(documentVersionAfter ? { documentVersionAfter } : {}),
      sourceResults: recordedSourceResults,
    });
    replaceRequest(updated);
    setConfirmedPreparationId("");
    setStatus(`Recorded reviewed execution ${updated.execution?.executionId} with status ${updated.execution?.status}.`);
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
        <div class="brand"><strong>Afrodite</strong><span>Reviewed Execution Inbox</span></div>
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
                  onClick={() => { setSelectedId(request.requestId); setConfirmedPreparationId(""); }}
                >
                  <strong>{request.command.type}</strong>
                  <span>{request.actor} · {request.execution?.status ?? request.status}</span>
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
                      <div><dt>Reviewed document</dt><dd><code>{request.documentVersion}</code></dd></div>
                      <div><dt>Expires</dt><dd>{new Date(request.expiresAt).toLocaleString()}</dd></div>
                    </dl>
                    <pre>{JSON.stringify(request.command, null, 2)}</pre>
                  </section>

                  <Show when={request.status === "pending"}>
                    <section class="review-card human-decision">
                      <div class="section-heading"><h2>First human decision</h2><span>review only</span></div>
                      <label>Reviewer<input value={reviewer()} onInput={(event) => setReviewer(event.currentTarget.value)} /></label>
                      <label>Note<textarea value={note()} onInput={(event) => setNote(event.currentTarget.value)} /></label>
                      <div class="review-actions">
                        <button class="primary" disabled={busy() || !reviewer().trim()} onClick={() => void decide("approved")}>Approve for fresh preparation</button>
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

                  <Show when={request.status === "approved" && !request.execution}>
                    <section class="review-card execution-preparation">
                      <div class="section-heading"><h2>Fresh execution preparation</h2><span>no write</span></div>
                      <p>Re-run the approved semantic command against the current Studio document and current source versions.</p>
                      <button class="primary" disabled={busy() || !reviewer().trim()} onClick={() => void prepareExecution()}>
                        {request.preparation ? "Prepare again from current state" : "Prepare fresh execution"}
                      </button>
                    </section>
                  </Show>

                  <Show when={request.preparation}>
                    {(preparedAccessor) => {
                      const prepared = preparedAccessor();
                      const freshChanged = prepared.plan.sourcePlans.filter((plan) => plan.changed);
                      return (
                        <section class={`review-card execution-review ${prepared.comparison.exactMatch ? "exact-match" : "drifted"}`}>
                          <div class="section-heading"><h2>Prepared execution</h2><span>{prepared.comparison.exactMatch ? "exact match" : "fresh drift"}</span></div>
                          <code>{prepared.preparationId}</code>
                          <p>{prepared.comparison.summary}</p>
                          <dl>
                            <div><dt>Live revision</dt><dd>{prepared.liveRevision}</dd></div>
                            <div><dt>Live document</dt><dd><code>{prepared.liveDocumentVersion}</code></dd></div>
                            <div><dt>Fresh plan</dt><dd><code>{prepared.plan.planId}</code></dd></div>
                            <div><dt>Application mode</dt><dd>{prepared.plan.applicationMode}</dd></div>
                          </dl>

                          <div class="comparison-grid">
                            <div><strong>Document comparison</strong><span>{prepared.comparison.document.status}</span></div>
                            <For each={prepared.comparison.sources}>{(comparison) => (
                              <div><strong>{comparison.repositoryPath}</strong><span>{comparison.status}</span></div>
                            )}</For>
                          </div>

                          <Show when={prepared.plan.documentAfter}>
                            {(documentAfter) => (
                              <details open class="fresh-document-effect">
                                <summary>Fresh reversible UI IR command</summary>
                                <pre>{JSON.stringify(documentAfter(), null, 2)}</pre>
                              </details>
                            )}
                          </Show>

                          <For each={prepared.plan.sourcePlans}>{(plan) => (
                            <section class="fresh-source-plan">
                              <div class="section-heading"><h3>{plan.repositoryPath}</h3><span>{plan.changed ? "changed" : "unchanged"}</span></div>
                              <code>{plan.planId} · {plan.sourceVersion}</code>
                              <pre>{plan.diff || "No source change."}</pre>
                              <Show when={plan.diagnostics.length > 0}>
                                <div class="diagnostics"><For each={plan.diagnostics}>{(diagnostic) => <p><code>{diagnostic.code}</code>{diagnostic.message}</p>}</For></div>
                              </Show>
                              <Show when={sourceResults()[plan.planId]}>{(result) => (
                                <p class={`source-result status-${result().status}`}>Result: {result().status}</p>
                              )}</Show>
                            </section>
                          )}</For>

                          <Show when={freshChanged.length > 1}>
                            <p class="diagnostics">Multi-source reviewed execution is blocked in v1. Use a reviewed transaction in a later slice.</p>
                          </Show>

                          <label class="approval-check">
                            <input
                              type="checkbox"
                              checked={confirmedPreparationId() === prepared.preparationId}
                              disabled={preparationBlocked() || Boolean(request.execution)}
                              onChange={(event) => setConfirmedPreparationId(event.currentTarget.checked ? prepared.preparationId : "")}
                            />
                            I reviewed this fresh preparation, its current document revision, and every exact source version.
                          </label>
                          <button
                            class="primary"
                            disabled={busy() || Boolean(request.execution) || preparationBlocked() || confirmedPreparationId() !== prepared.preparationId}
                            onClick={() => void executePreparation()}
                          >Second confirmation: execute prepared effects</button>
                        </section>
                      );
                    }}
                  </Show>

                  <Show when={request.execution}>
                    {(execution) => (
                      <section class={`review-card execution-record status-${execution().status}`}>
                        <div class="section-heading"><h2>Execution record</h2><span>{execution().status}</span></div>
                        <code>{execution().executionId} · {execution().preparationId}</code>
                        <p>{execution().executedBy} · {new Date(execution().executedAt).toLocaleString()}</p>
                        <Show when={execution().documentApplied}>
                          <p>Reversible Studio command <code>{execution().documentCommandId}</code> created revision {execution().documentRevision}.</p>
                        </Show>
                        <For each={execution().sourceResults}>{(entry) => (
                          <div class="execution-source-result">
                            <strong>{entry.repositoryPath}</strong><span>{entry.result.status}</span>
                            <For each={entry.result.verification}>{(verification) => (
                              <small>{verification.step.kind}: {verification.ok ? "passed" : "failed"}</small>
                            )}</For>
                          </div>
                        )}</For>
                      </section>
                    )}
                  </Show>

                  <Show when={(request.executionHistory?.length ?? 0) > 0}>
                    <section class="review-card execution-history">
                      <div class="section-heading"><h2>Previous attempts</h2><span>{request.executionHistory?.length}</span></div>
                      <For each={request.executionHistory}>{(entry) => (
                        <p><code>{entry.executionId}</code> {entry.status} · {new Date(entry.executedAt).toLocaleString()}</p>
                      )}</For>
                    </section>
                  </Show>

                  <section class="review-card approved-snapshot">
                    <div class="section-heading"><h2>Originally approved snapshot</h2><span>comparison baseline</span></div>
                    <Show when={request.documentAfter}><pre>{JSON.stringify(request.documentAfter, null, 2)}</pre></Show>
                    <For each={request.sourcePlans}>{(plan) => (
                      <details><summary>{plan.repositoryPath} · {plan.sourceVersion}</summary><pre>{plan.diff || "No source change."}</pre></details>
                    )}</For>
                  </section>
                </>
              );
            }}
          </Show>
        </section>
      </main>
    </div>
  );
}
