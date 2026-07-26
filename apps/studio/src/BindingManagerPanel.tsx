import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import type {
  BindingDiscoveryResult,
  BindingPatchPlanView,
  BridgeApplyResult,
  BridgeHealthResponse,
  ComponentCatalog,
} from "@afrodite/protocol";
import type { SourceBinding, UiNode } from "@afrodite/ui-ir";
import { ProjectBridgeClient, ProjectBridgeClientError } from "./projectBridgeClient";

export function BindingManagerPanel(props: {
  node?: UiNode;
  catalog: ComponentCatalog;
  bridgeUrl: string;
  bridgeToken: string;
  bridgeHealth?: BridgeHealthResponse;
  onConnect: () => Promise<void> | void;
  onBindingConfirmed: (binding: SourceBinding) => void;
  onStatus: (message: string) => void;
}) {
  const [adapterId, setAdapterId] = createSignal("");
  const [repositoryPath, setRepositoryPath] = createSignal("");
  const [exportName, setExportName] = createSignal("");
  const [componentId, setComponentId] = createSignal("");
  const [stableMarker, setStableMarker] = createSignal("");
  const [discovery, setDiscovery] = createSignal<BindingDiscoveryResult>();
  const [selectedCandidateId, setSelectedCandidateId] = createSignal("");
  const [plan, setPlan] = createSignal<BindingPatchPlanView>();
  const [result, setResult] = createSignal<BridgeApplyResult>();
  const [approved, setApproved] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  let initializedNodeId = "";

  const selectedCandidate = createMemo(() =>
    discovery()?.candidates.find((candidate) => candidate.candidateId === selectedCandidateId()),
  );
  const blockingPlan = createMemo(() =>
    plan()?.diagnostics.some((diagnostic) => diagnostic.severity === "error") === true,
  );

  createEffect(() => {
    const node = props.node;
    if (!node || node.id === initializedNodeId) return;
    initializedNodeId = node.id;

    const suggestion = exactCatalogSuggestion(node, props.catalog);
    setAdapterId(
      node.sourceBinding?.adapterId
      ?? suggestion?.adapterId
      ?? props.bridgeHealth?.adapters[0]?.adapterId
      ?? "",
    );
    setRepositoryPath(node.sourceBinding?.repositoryPath ?? suggestion?.sourcePath ?? "");
    setExportName(node.sourceBinding?.exportName ?? suggestion?.exportName ?? "");
    setComponentId(node.sourceBinding?.componentId ?? suggestion?.id ?? "");
    setStableMarker(node.sourceBinding?.stableMarker ?? defaultStableMarker(node.id));
    resetReview();
  });

  const client = () => new ProjectBridgeClient(props.bridgeUrl, props.bridgeToken);

  const discover = async () => {
    if (!props.node) return;
    if (!adapterId() || !repositoryPath()) {
      props.onStatus("Choose a framework adapter and an explicit repository path first");
      return;
    }

    await run(async () => {
      const next = await client().discoverBindings({
        adapterId: adapterId(),
        repositoryPath: repositoryPath(),
        ...(exportName() ? { exportName: exportName() } : {}),
        ...(componentId() ? { componentId: componentId() } : {}),
      });
      setDiscovery(next);
      setSelectedCandidateId("");
      setPlan(undefined);
      setResult(undefined);
      setApproved(false);
      props.onStatus(`Found ${next.candidates.length} explicit JSX candidates in ${next.repositoryPath}`);
    });
  };

  const planMarker = async () => {
    const node = props.node;
    const currentDiscovery = discovery();
    const candidate = selectedCandidate();
    if (!node || !currentDiscovery || !candidate) {
      props.onStatus("Select one reviewed JSX candidate before planning a binding");
      return;
    }

    await run(async () => {
      const next = await client().planBinding({
        nodeId: node.id,
        adapterId: adapterId(),
        repositoryPath: repositoryPath(),
        candidateId: candidate.candidateId,
        stableMarker: stableMarker(),
        expectedSourceVersion: currentDiscovery.sourceVersion,
        ...(exportName() ? { exportName: exportName() } : {}),
        ...(componentId() ? { componentId: componentId() } : {}),
      });
      setPlan(next);
      setResult(undefined);
      setApproved(false);
      props.onStatus(next.sourceWriteRequired
        ? `Planned stable-marker patch ${next.planId}; review the exact diff`
        : "The selected JSX element already owns the reviewed stable marker");
    });
  };

  const confirmBinding = async () => {
    const currentPlan = plan();
    if (!currentPlan || !approved() || blockingPlan()) return;

    await run(async () => {
      if (!currentPlan.sourceWriteRequired) {
        props.onBindingConfirmed({ ...currentPlan.proposedBinding });
        setApproved(false);
        props.onStatus("Confirmed existing stable marker and attached the UI IR source binding");
        return;
      }

      const write = await client().applyPatch(currentPlan.planId, currentPlan.sourceVersion, "afrodite-binding-manager");
      setResult(write);
      setApproved(false);
      if (write.status === "applied") {
        props.onBindingConfirmed({ ...currentPlan.proposedBinding });
        props.onStatus("Stable marker was verified and the UI IR node is now source-bound");
      } else {
        props.onStatus(bindingResultMessage(write));
      }
    });
  };

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      props.onStatus(error instanceof ProjectBridgeClientError
        ? `${error.code}: ${error.message}`
        : error instanceof Error
          ? error.message
          : "Binding manager request failed");
    } finally {
      setBusy(false);
    }
  }

  function changeField(setter: (value: string) => void, value: string): void {
    setter(value);
    resetReview();
  }

  function resetReview(): void {
    setDiscovery(undefined);
    setSelectedCandidateId("");
    setPlan(undefined);
    setResult(undefined);
    setApproved(false);
  }

  return (
    <section class="inspector-section binding-manager">
      <div class="section-heading">
        <h3>Source binding</h3>
        <span>{props.node?.sourceBinding ? "bound" : "unbound"}</span>
      </div>

      <Show when={props.node} keyed fallback={<p class="panel-hint">Select a UI IR node.</p>}>
        {(node) => (
          <>
            <Show when={node.sourceBinding}>
              <div class="binding-current">
                <code>{node.sourceBinding?.frameworkId ?? "framework unknown"}</code>
                <code>{node.sourceBinding?.repositoryPath}</code>
                <code>{node.sourceBinding?.exportName ?? "export unspecified"}</code>
                <code>{node.sourceBinding?.stableMarker ?? "marker missing"}</code>
              </div>
            </Show>

            <Show when={props.bridgeHealth} fallback={
              <button
                disabled={busy() || props.bridgeToken.length < 16}
                onClick={() => void props.onConnect()}
              >
                Connect local bridge
              </button>
            }>
              <label>
                Framework adapter
                <select
                  value={adapterId()}
                  onChange={(event) => changeField(setAdapterId, event.currentTarget.value)}
                >
                  <option value="">Choose adapter</option>
                  <For each={props.bridgeHealth?.adapters ?? []}>
                    {(adapter) => <option value={adapter.adapterId}>{adapter.displayName}</option>}
                  </For>
                </select>
              </label>

              <label>
                Repository path
                <input
                  value={repositoryPath()}
                  placeholder="src/components/Card.tsx"
                  onInput={(event) => changeField(setRepositoryPath, event.currentTarget.value)}
                />
              </label>

              <div class="binding-field-grid">
                <label>
                  Export
                  <input
                    value={exportName()}
                    placeholder="Card"
                    onInput={(event) => changeField(setExportName, event.currentTarget.value)}
                  />
                </label>
                <label>
                  Component ID
                  <input
                    value={componentId()}
                    placeholder="src/Card.tsx#Card"
                    onInput={(event) => changeField(setComponentId, event.currentTarget.value)}
                  />
                </label>
              </div>

              <label>
                Stable marker
                <input
                  value={stableMarker()}
                  onInput={(event) => changeField(setStableMarker, event.currentTarget.value)}
                />
              </label>

              <button
                class="primary"
                disabled={busy() || !adapterId() || !repositoryPath()}
                onClick={() => void discover()}
              >
                Discover JSX candidates
              </button>
            </Show>

            <Show when={discovery()} keyed>
              {(currentDiscovery) => (
                <div class="binding-candidates">
                  <div class="section-heading">
                    <strong>Explicit candidates</strong>
                    <span>{currentDiscovery.candidates.length} · {currentDiscovery.sourceVersion}</span>
                  </div>
                  <For each={currentDiscovery.candidates}>
                    {(candidate) => (
                      <button
                        classList={{
                          "binding-candidate": true,
                          selected: candidate.candidateId === selectedCandidateId(),
                          blocked: !candidate.patchable,
                        }}
                        disabled={!candidate.patchable}
                        onClick={() => {
                          setSelectedCandidateId(candidate.candidateId);
                          setPlan(undefined);
                          setApproved(false);
                        }}
                      >
                        <span><strong>{candidate.elementName}</strong> L{candidate.line}:{candidate.column}</span>
                        <code>{candidate.snippet}</code>
                        <small>{candidate.existingMarker
                          ? `marker: ${candidate.existingMarker}`
                          : candidate.markerState}</small>
                      </button>
                    )}
                  </For>
                  <Show when={currentDiscovery.diagnostics.length > 0}>
                    <div class="diagnostics">
                      <For each={currentDiscovery.diagnostics}>
                        {(diagnostic) => <p><code>{diagnostic.code}</code>{diagnostic.message}</p>}
                      </For>
                    </div>
                  </Show>
                  <button
                    class="primary"
                    disabled={busy() || !selectedCandidateId() || !stableMarker()}
                    onClick={() => void planMarker()}
                  >
                    Plan reviewed marker
                  </button>
                </div>
              )}
            </Show>

            <Show when={plan()} keyed>
              {(currentPlan) => (
                <div class="binding-plan">
                  <div class="section-heading">
                    <strong>{currentPlan.sourceWriteRequired ? "Stable-marker diff" : "Existing marker confirmation"}</strong>
                    <span>{currentPlan.planId}</span>
                  </div>
                  <div class="binding-current">
                    <code>{currentPlan.proposedBinding.frameworkId}</code>
                    <code>{currentPlan.proposedBinding.repositoryPath}</code>
                    <code>{currentPlan.proposedBinding.exportName ?? "export unspecified"}</code>
                    <code>{currentPlan.proposedBinding.stableMarker}</code>
                  </div>
                  <pre class="diff-view binding-diff">{currentPlan.diff}</pre>
                  <Show when={currentPlan.diagnostics.length > 0}>
                    <div class="diagnostics">
                      <For each={currentPlan.diagnostics}>
                        {(diagnostic) => <p><code>{diagnostic.code}</code>{diagnostic.message}</p>}
                      </For>
                    </div>
                  </Show>
                  <label class="approval-check">
                    <input
                      type="checkbox"
                      checked={approved()}
                      disabled={blockingPlan()}
                      onChange={(event) => setApproved(event.currentTarget.checked)}
                    />
                    I reviewed this candidate, binding identity, source version, and exact diff.
                  </label>
                  <button
                    class="primary"
                    disabled={busy() || blockingPlan() || !approved()}
                    onClick={() => void confirmBinding()}
                  >
                    {currentPlan.sourceWriteRequired
                      ? "Approve marker write & bind"
                      : "Confirm existing marker & bind"}
                  </button>
                </div>
              )}
            </Show>

            <Show when={result()} keyed>
              {(write) => (
                <div class={`binding-result status-${write.status}`}>
                  <strong>{write.status}</strong>
                  <For each={write.verification}>
                    {(verification) => (
                      <span>{verification.step.kind} · {verification.ok ? "passed" : "failed"}</span>
                    )}
                  </For>
                </div>
              )}
            </Show>
          </>
        )}
      </Show>
    </section>
  );
}

function exactCatalogSuggestion(node: UiNode, catalog: ComponentCatalog) {
  if (node.kind !== "component") return undefined;
  const matches = catalog.components.filter((component) => component.name === node.component);
  return matches.length === 1 ? matches[0] : undefined;
}

function defaultStableMarker(nodeId: string): string {
  const normalized = nodeId.replace(/[^A-Za-z0-9._:/#-]+/g, "-");
  return normalized.match(/^[A-Za-z0-9]/) ? normalized.slice(0, 200) : `ui.${normalized}`.slice(0, 200);
}

function bindingResultMessage(result: BridgeApplyResult): string {
  switch (result.status) {
    case "applied":
      return "Stable marker applied";
    case "rejected":
      return "Stable marker write was rejected; rediscover the source candidate";
    case "rolled-back":
      return "Marker verification failed and the source was restored";
    case "rollback-failed":
      return "Marker verification failed and rollback also failed; inspect the source immediately";
  }
}
