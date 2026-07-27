import {
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import {
  createMotionVerificationRequest,
  decodeMotionVerificationMessage,
  motionVerificationManifestSchema,
  type MotionVerificationManifest,
  type MotionVerificationResult,
} from "@afrodite/protocol/motion-verification";
import {
  MOTION_RUNTIME_BRIDGE_URL_KEY,
  MOTION_RUNTIME_EVIDENCE_PREFIX,
  MOTION_RUNTIME_MANIFEST_KEY,
  MotionBridgeClientError,
  recordMotionRuntimeEvidence,
} from "./motionBridgeClient";

const BRIDGE_TOKEN_KEY = "afrodite.project-bridge.token";
const PREVIEW_URL = import.meta.env.VITE_PREVIEW_HOST_URL ?? "http://localhost:4174";
let verificationSequence = 0;

export function MotionRuntimeVerificationPanel() {
  const [manifest, setManifest] = createSignal<MotionVerificationManifest>();
  const [result, setResult] = createSignal<MotionVerificationResult>();
  const [status, setStatus] = createSignal("No motion runtime plan is waiting for verification.");
  const [busy, setBusy] = createSignal(false);
  const [frameReady, setFrameReady] = createSignal(false);
  const [requestId, setRequestId] = createSignal("");
  const [evidenceId, setEvidenceId] = createSignal("");
  let frame: HTMLIFrameElement | undefined;

  const sampleCount = createMemo(() => manifest()?.scenarios.reduce(
    (total, scenario) => total + scenario.sampleTimesMs.length,
    0,
  ) ?? 0);
  const mismatchCount = createMemo(() => result()?.samples.filter((sample) => !sample.matched).length ?? 0);

  const loadManifest = () => {
    const source = sessionStorage.getItem(MOTION_RUNTIME_MANIFEST_KEY);
    if (!source) {
      setManifest(undefined);
      setResult(undefined);
      setEvidenceId("");
      setStatus("No motion runtime plan is waiting for verification.");
      return;
    }
    try {
      const parsed = motionVerificationManifestSchema.parse(JSON.parse(source));
      const previous = manifest();
      setManifest(parsed);
      setResult((current) => previous?.planId === parsed.planId ? current : undefined);
      setEvidenceId(sessionStorage.getItem(`${MOTION_RUNTIME_EVIDENCE_PREFIX}${parsed.planId}`) ?? "");
      setStatus(sessionStorage.getItem(`${MOTION_RUNTIME_EVIDENCE_PREFIX}${parsed.planId}`)
        ? "Runtime evidence is recorded for this exact plan."
        : "Motion plan is ready for isolated runtime verification.");
    } catch (error) {
      setManifest(undefined);
      setResult(undefined);
      setEvidenceId("");
      setStatus(error instanceof Error ? error.message : "Stored runtime manifest is invalid.");
    }
  };

  onMount(() => {
    loadManifest();
    const handlePlan = () => loadManifest();
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== frame?.contentWindow) return;
      const message = decodeMotionVerificationMessage(event.data);
      if (!message || message.type !== "motion-verification-result") return;
      if (message.requestId !== requestId()) return;
      const current = manifest();
      if (!current || message.planId !== current.planId) return;
      setResult(message);
      void recordResult(message);
    };
    window.addEventListener("afrodite-motion-runtime-plan", handlePlan);
    window.addEventListener("afrodite-motion-runtime-evidence", handlePlan);
    window.addEventListener("message", handleMessage);
    onCleanup(() => {
      window.removeEventListener("afrodite-motion-runtime-plan", handlePlan);
      window.removeEventListener("afrodite-motion-runtime-evidence", handlePlan);
      window.removeEventListener("message", handleMessage);
    });
  });

  const run = () => {
    const current = manifest();
    if (!current || !frame?.contentWindow || !frameReady()) {
      setStatus("Sandbox preview host is not ready.");
      return;
    }
    verificationSequence += 1;
    const id = `motion.verify.${verificationSequence}`;
    setRequestId(id);
    setResult(undefined);
    setEvidenceId("");
    setBusy(true);
    setStatus(`Running ${current.scenarios.length} isolated scenarios and ${sampleCount()} samples…`);
    frame.contentWindow.postMessage(createMotionVerificationRequest(id, current), "*");
  };

  const recordResult = async (runtimeResult: MotionVerificationResult) => {
    const current = manifest();
    if (!current) return;
    setBusy(true);
    if (!runtimeResult.ok) {
      setStatus(`Runtime verification failed with ${runtimeResult.samples.filter((sample) => !sample.matched).length} mismatched samples.`);
      setBusy(false);
      return;
    }
    const token = sessionStorage.getItem(BRIDGE_TOKEN_KEY) ?? "";
    const bridgeUrl = sessionStorage.getItem(MOTION_RUNTIME_BRIDGE_URL_KEY) ?? "http://127.0.0.1:4175";
    if (token.length < 16) {
      setStatus("Runtime samples passed, but the project bridge token is missing, so evidence was not recorded.");
      setBusy(false);
      return;
    }
    try {
      const evidence = await recordMotionRuntimeEvidence(bridgeUrl, token, runtimeResult);
      setEvidenceId(evidence.evidenceId);
      setStatus(`Runtime evidence ${evidence.evidenceId} recorded for ${evidence.sampleCount} samples.`);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Show when={manifest()}>{(manifestAccessor) => {
      const current = manifestAccessor();
      return (
        <section class="motion-runtime-verification-panel">
          <div class="motion-runtime-verification-heading">
            <div>
              <strong>Isolated motion runtime verification</strong>
              <span>{status()}</span>
            </div>
            <div class="motion-runtime-verification-actions">
              <code>{current.cssFingerprint}</code>
              <button class="primary" disabled={busy() || !frameReady()} onClick={run}>
                {busy() ? "Verifying…" : "Run sandbox verification"}
              </button>
            </div>
          </div>

          <div class="motion-runtime-verification-meta">
            <code>{current.planId}</code>
            <code>{current.sourceVersion}</code>
            <span>{current.scenarios.length} scenarios</span>
            <span>{sampleCount()} samples</span>
            <Show when={evidenceId()}><strong>Evidence: {evidenceId()}</strong></Show>
          </div>

          <iframe
            ref={(element) => { frame = element; }}
            class="motion-runtime-verification-frame"
            src={PREVIEW_URL}
            title="Afrodite isolated motion runtime verifier"
            sandbox="allow-scripts"
            onLoad={() => {
              setFrameReady(true);
              setStatus(evidenceId()
                ? "Runtime evidence is recorded for this exact plan."
                : "Sandbox preview host is ready for motion verification.");
            }}
          />

          <Show when={result()}>{(resultAccessor) => {
            const currentResult = resultAccessor();
            return (
              <div classList={{
                "motion-runtime-verification-result": true,
                passed: currentResult.ok,
                failed: !currentResult.ok,
              }}>
                <strong>{currentResult.ok ? "Semantic compositor matches runtime" : "Runtime mismatch detected"}</strong>
                <span>{currentResult.samples.length} samples · {mismatchCount()} mismatches</span>
                <For each={currentResult.diagnostics}>{(diagnostic) => (
                  <p class={`severity-${diagnostic.severity}`}>
                    <code>{diagnostic.code}</code> {diagnostic.message}
                  </p>
                )}</For>
                <details>
                  <summary>Sample evidence</summary>
                  <For each={currentResult.samples}>{(sample) => (
                    <article classList={{ matched: sample.matched, mismatched: !sample.matched }}>
                      <div><code>{sample.scenarioId}@{sample.sampleTimeMs}ms</code><span>{sample.matched ? "match" : "mismatch"}</span></div>
                      <For each={sample.differences}>{(difference) => (
                        <p><strong>{difference.property}</strong> expected {difference.expected}, actual {difference.actual}</p>
                      )}</For>
                    </article>
                  )}</For>
                </details>
              </div>
            );
          }}</Show>
        </section>
      );
    }}</Show>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof MotionBridgeClientError) return `${error.code}: ${error.message}`;
  return error instanceof Error ? error.message : "Motion runtime verification failed.";
}
