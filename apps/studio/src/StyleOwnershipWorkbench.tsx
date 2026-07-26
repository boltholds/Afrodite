import { createMemo, createSignal, For, Show } from "solid-js";
import {
  layoutSchema,
  sourceBindingSchema,
  styleOwnershipSchema,
  type StyleOwnership,
  type StyleProperty,
} from "@afrodite/ui-ir";
import type {
  BridgeApplyResult,
  BridgePatchPlanView,
  BridgeStyleOperation,
} from "@afrodite/protocol";
import { ProjectBridgeClient, ProjectBridgeClientError } from "./projectBridgeClient";

const PROPERTY_OPTIONS: readonly StyleProperty[] = [
  "display",
  "direction",
  "gap",
  "padding",
  "width",
  "height",
];

const BEFORE_LAYOUT = JSON.stringify({
  display: "block",
  direction: "column",
  gap: 4,
  padding: 8,
  sizing: { width: "hug", height: "hug" },
}, null, 2);

const AFTER_LAYOUT = JSON.stringify({
  display: "flex",
  direction: "row",
  gap: 16,
  padding: 12,
  sizing: { width: "fill", height: 240 },
}, null, 2);

export function StyleOwnershipWorkbench() {
  const [bridgeUrl, setBridgeUrl] = createSignal("http://127.0.0.1:4175");
  const [token, setToken] = createSignal(sessionStorage.getItem("afrodite.project-bridge.token") ?? "");
  const [frameworkId, setFrameworkId] = createSignal("react");
  const [adapterId, setAdapterId] = createSignal("afrodite.adapter.react");
  const [repositoryPath, setRepositoryPath] = createSignal("src/ActionCard.tsx");
  const [stableMarker, setStableMarker] = createSignal("react:src/ActionCard.tsx#ActionCard");
  const [strategy, setStrategy] = createSignal<StyleOwnership["strategy"]>("inline");
  const [managedProperties, setManagedProperties] = createSignal<readonly StyleProperty[]>(PROPERTY_OPTIONS);
  const [stylesheetPath, setStylesheetPath] = createSignal("src/ActionCard.module.css");
  const [className, setClassName] = createSignal("card");
  const [utilityAttribute, setUtilityAttribute] = createSignal<"class" | "className">("className");
  const [tokenFilePath, setTokenFilePath] = createSignal("src/tokens.css");
  const [tokenMapDraft, setTokenMapDraft] = createSignal(JSON.stringify({
    display: "--card-display",
    direction: "--card-direction",
    gap: "--card-gap",
    padding: "--card-padding",
    width: "--card-width",
    height: "--card-height",
  }, null, 2));
  const [beforeDraft, setBeforeDraft] = createSignal(BEFORE_LAYOUT);
  const [afterDraft, setAfterDraft] = createSignal(AFTER_LAYOUT);
  const [plan, setPlan] = createSignal<BridgePatchPlanView>();
  const [result, setResult] = createSignal<BridgeApplyResult>();
  const [approved, setApproved] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [status, setStatus] = createSignal("Configure ownership and request a verified style patch.");

  const ownershipPreview = createMemo(() => {
    try {
      return { ok: true as const, value: createOwnership() };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : "Invalid ownership" };
    }
  });

  const bindingPreview = createMemo(() => {
    const ownership = ownershipPreview();
    if (!ownership.ok) return ownership;
    const parsed = sourceBindingSchema.safeParse({
      frameworkId: frameworkId(),
      adapterId: adapterId(),
      repositoryPath: repositoryPath(),
      stableMarker: stableMarker(),
      styleOwnership: ownership.value,
    });
    return parsed.success
      ? { ok: true as const, value: parsed.data }
      : { ok: false as const, message: parsed.error.issues.map((issue) => issue.message).join("; ") };
  });

  const targetPath = createMemo(() => {
    const ownership = ownershipPreview();
    if (!ownership.ok) return "invalid ownership";
    switch (ownership.value.strategy) {
      case "inline":
      case "utility": return repositoryPath();
      case "css-module": return ownership.value.stylesheetPath;
      case "design-token": return ownership.value.tokenFilePath;
    }
  });

  const toggleProperty = (property: StyleProperty) => {
    setManagedProperties((current) => current.includes(property)
      ? current.filter((item) => item !== property)
      : [...current, property]);
    clearReview();
  };

  const connect = async () => {
    await run(async () => {
      const health = await client().health();
      sessionStorage.setItem("afrodite.project-bridge.token", token());
      setStatus(`Connected to ${health.projectName}. ${health.adapters.length} framework adapters available.`);
    });
  };

  const planStyle = async () => {
    const binding = bindingPreview();
    const ownership = ownershipPreview();
    if (!binding.ok || !ownership.ok) {
      setStatus(binding.ok ? ownership.message : binding.message);
      return;
    }

    await run(async () => {
      const before = layoutSchema.parse(JSON.parse(beforeDraft()));
      const after = layoutSchema.parse(JSON.parse(afterDraft()));
      const operation: BridgeStyleOperation = {
        kind: "update-style",
        nodeId: "style-workbench.node",
        binding: binding.value,
        ownership: ownership.value,
        before,
        after,
      };
      const next = await client().planStylePatch(operation);
      setPlan(next);
      setResult(undefined);
      setApproved(false);
      setStatus(next.changed
        ? `Planned ${next.planId} against ${next.repositoryPath}.`
        : "The strategy produced no source change or returned a blocking diagnostic.");
    });
  };

  const apply = async () => {
    const current = plan();
    if (!current || !approved()) return;
    await run(async () => {
      const next = await client().applyPatch(current.planId, current.sourceVersion, "style-ownership-workbench");
      setResult(next);
      setApproved(false);
      setStatus(next.status === "applied"
        ? "Style patch applied and required verification passed."
        : `Write finished with status ${next.status}.`);
    });
  };

  function createOwnership(): StyleOwnership {
    const properties = [...managedProperties()];
    const raw = (() => {
      switch (strategy()) {
        case "inline": return { strategy: "inline", managedProperties: properties };
        case "utility": return {
          strategy: "utility",
          dialect: "tailwind",
          attribute: utilityAttribute(),
          managedProperties: properties,
        };
        case "css-module": return {
          strategy: "css-module",
          stylesheetPath: stylesheetPath(),
          className: className(),
          managedProperties: properties,
        };
        case "design-token": return {
          strategy: "design-token",
          tokenFilePath: tokenFilePath(),
          tokens: JSON.parse(tokenMapDraft()),
          managedProperties: properties,
        };
      }
    })();
    return styleOwnershipSchema.parse(raw);
  }

  function client() {
    return new ProjectBridgeClient(bridgeUrl(), token());
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setStatus(error instanceof ProjectBridgeClientError
        ? `${error.code}: ${error.message}`
        : error instanceof Error ? error.message : "Style ownership operation failed");
    } finally {
      setBusy(false);
    }
  }

  function clearReview() {
    setPlan(undefined);
    setResult(undefined);
    setApproved(false);
  }

  return (
    <div class="style-workbench-shell">
      <header class="style-workbench-header">
        <div class="brand"><strong>Afrodite</strong><span>Style Ownership Workbench</span></div>
        <span class="status-line">{status()}</span>
      </header>

      <main class="style-workbench-grid">
        <section class="style-workbench-card">
          <div class="section-heading"><h2>Project bridge</h2><span>{targetPath()}</span></div>
          <label>Bridge URL<input value={bridgeUrl()} onInput={(event) => setBridgeUrl(event.currentTarget.value)} /></label>
          <label>Session token<input type="password" value={token()} onInput={(event) => setToken(event.currentTarget.value)} /></label>
          <button class="primary" disabled={busy() || token().length < 16} onClick={connect}>Connect</button>
        </section>

        <section class="style-workbench-card ownership-card">
          <div class="section-heading"><h2>Ownership contract</h2><span>{strategy()}</span></div>
          <div class="style-field-grid">
            <label>Framework<select value={frameworkId()} onChange={(event) => {
              const value = event.currentTarget.value;
              setFrameworkId(value);
              setAdapterId(value === "react" ? "afrodite.adapter.react" : "afrodite.adapter.solid");
              setUtilityAttribute(value === "react" ? "className" : "class");
              clearReview();
            }}><option value="react">React</option><option value="solid">SolidJS</option></select></label>
            <label>Strategy<select value={strategy()} onChange={(event) => { setStrategy(event.currentTarget.value as StyleOwnership["strategy"]); clearReview(); }}>
              <option value="inline">Inline style</option>
              <option value="css-module">CSS Module</option>
              <option value="utility">Tailwind utilities</option>
              <option value="design-token">Design tokens</option>
            </select></label>
          </div>
          <label>Adapter ID<input value={adapterId()} onInput={(event) => { setAdapterId(event.currentTarget.value); clearReview(); }} /></label>
          <label>Component source<input value={repositoryPath()} onInput={(event) => { setRepositoryPath(event.currentTarget.value); clearReview(); }} /></label>
          <label>Stable marker<input value={stableMarker()} onInput={(event) => { setStableMarker(event.currentTarget.value); clearReview(); }} /></label>

          <div class="managed-property-grid">
            <For each={PROPERTY_OPTIONS}>{(property) => (
              <label class="property-chip">
                <input type="checkbox" checked={managedProperties().includes(property)} onChange={() => toggleProperty(property)} />
                {property}
              </label>
            )}</For>
          </div>

          <Show when={strategy() === "css-module"}>
            <label>Stylesheet path<input value={stylesheetPath()} onInput={(event) => { setStylesheetPath(event.currentTarget.value); clearReview(); }} /></label>
            <label>Class name<input value={className()} onInput={(event) => { setClassName(event.currentTarget.value); clearReview(); }} /></label>
          </Show>
          <Show when={strategy() === "utility"}>
            <label>JSX attribute<select value={utilityAttribute()} onChange={(event) => { setUtilityAttribute(event.currentTarget.value as "class" | "className"); clearReview(); }}><option value="className">className</option><option value="class">class</option></select></label>
          </Show>
          <Show when={strategy() === "design-token"}>
            <label>Token file<input value={tokenFilePath()} onInput={(event) => { setTokenFilePath(event.currentTarget.value); clearReview(); }} /></label>
            <label>Token map<textarea value={tokenMapDraft()} onInput={(event) => { setTokenMapDraft(event.currentTarget.value); clearReview(); }} /></label>
          </Show>

          <Show when={bindingPreview().ok} fallback={<div class="diagnostics"><p>{bindingPreview().ok ? "" : bindingPreview().message}</p></div>}>
            <details><summary>Validated SourceBinding</summary><pre>{JSON.stringify(bindingPreview().ok ? bindingPreview().value : {}, null, 2)}</pre></details>
          </Show>
        </section>

        <section class="style-workbench-card layout-card">
          <div class="section-heading"><h2>Semantic layout transition</h2><span>before → after</span></div>
          <div class="layout-pair">
            <label>Before<textarea value={beforeDraft()} onInput={(event) => { setBeforeDraft(event.currentTarget.value); clearReview(); }} /></label>
            <label>After<textarea value={afterDraft()} onInput={(event) => { setAfterDraft(event.currentTarget.value); clearReview(); }} /></label>
          </div>
          <button class="primary" disabled={busy() || !bindingPreview().ok} onClick={planStyle}>Plan exact style patch</button>
        </section>

        <Show when={plan()} keyed>{(current) => (
          <section class="style-workbench-card diff-card">
            <div class="section-heading"><h2>Exact unified diff</h2><span>{current.planId}</span></div>
            <div class="plan-metadata"><code>{current.repositoryPath}</code><code>{current.sourceVersion}</code></div>
            <pre class="diff-view">{current.diff}</pre>
            <Show when={current.diagnostics.length > 0}><div class="diagnostics"><For each={current.diagnostics}>{(item) => <p><code>{item.code}</code>{item.message}</p>}</For></div></Show>
            <div class="verification-plan"><For each={current.verification}>{(step) => <span classList={{ required: step.required }}>{step.kind} · {step.required ? "required" : "optional"}</span>}</For></div>
            <label class="approval-check"><input type="checkbox" checked={approved()} disabled={!current.changed || current.diagnostics.some((item) => item.severity === "error")} onChange={(event) => setApproved(event.currentTarget.checked)} />I reviewed this exact ownership diff and source version.</label>
            <button class="primary destructive-approval" disabled={busy() || !approved()} onClick={apply}>Approve exact diff & apply</button>
          </section>
        )}</Show>

        <Show when={result()} keyed>{(current) => (
          <section class={`style-workbench-card result-card status-${current.status}`}>
            <div class="section-heading"><h2>Write result</h2><span>{current.status}</span></div>
            <For each={current.verification}>{(execution) => <details><summary>{execution.step.kind} · {execution.ok ? "passed" : "failed"}</summary><pre>{execution.stdout || execution.stderr || "No output."}</pre></details>}</For>
          </section>
        )}</Show>
      </main>
    </div>
  );
}
