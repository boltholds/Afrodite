import { createSignal, Show } from "solid-js";
import { render } from "solid-js/web";
import { ensureGefestProjectSeed } from "./gefestProjectSeed";
import { GefestLiveProjectBridge } from "./GefestLiveProjectBridge";
import { ManualProjectStudio } from "./ManualProjectStudio";
import { MotionCompositionWorkbench } from "./MotionCompositionWorkbench";
import { MotionRuntimeVerificationPanel } from "./MotionRuntimeVerificationPanel";
import { ReviewInboxWorkbench } from "./ReviewInboxWorkbench";
import { ScreenImportWorkbench } from "./ScreenImportWorkbench";
import { SemanticBatchWorkbench } from "./SemanticBatchWorkbench";
import { SemanticOperationsWorkbench } from "./SemanticOperationsWorkbench";
import { StudioCollaborationBridge } from "./StudioCollaborationBridge";
import { StyleOwnershipWorkbench } from "./StyleOwnershipWorkbench";
import { TransactionWorkbench } from "./TransactionWorkbench";
import { VariantWorkbench } from "./VariantWorkbench";
import "./styles.css";
import "./vs003.css";
import "./source-sync.css";
import "./live-session.css";
import "./binding-manager.css";
import "./style-ownership.css";
import "./screen-import.css";
import "./transaction.css";
import "./variant.css";
import "./semantic-operations.css";
import "./semantic-batch.css";
import "./review-inbox.css";
import "./manual-interaction.css";
import "./gefest-live-preview.css";
import "./motion.css";
import "./motion-v23.css";
import "./motion-verification.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Afrodite Studio root element was not found");
}

try {
  ensureGefestProjectSeed(window.localStorage);
} catch {
  // Storage can be unavailable in restricted browser contexts; Studio must still start.
}

type StudioMode =
  | "project"
  | "motion"
  | "style-ownership"
  | "screen-import"
  | "transaction"
  | "variants"
  | "semantic"
  | "semantic-batch"
  | "reviews";

function StudioRoot() {
  const [mode, setMode] = createSignal<StudioMode>("project");
  return (
    <>
      <StudioCollaborationBridge />
      <nav class="studio-mode-switcher" aria-label="Afrodite Studio mode">
        <button classList={{ active: mode() === "project" }} onClick={() => setMode("project")}>Project session</button>
        <button classList={{ active: mode() === "motion" }} onClick={() => setMode("motion")}>Motion</button>
        <button classList={{ active: mode() === "semantic-batch" }} onClick={() => setMode("semantic-batch")}>Batches</button>
        <button classList={{ active: mode() === "reviews" }} onClick={() => setMode("reviews")}>Review inbox</button>
        <button classList={{ active: mode() === "style-ownership" }} onClick={() => setMode("style-ownership")}>Style ownership</button>
        <button classList={{ active: mode() === "variants" }} onClick={() => setMode("variants")}>Variants</button>
        <button classList={{ active: mode() === "semantic" }} onClick={() => setMode("semantic")}>Semantic API</button>
        <button classList={{ active: mode() === "screen-import" }} onClick={() => setMode("screen-import")}>Screen import</button>
        <button classList={{ active: mode() === "transaction" }} onClick={() => setMode("transaction")}>Transactions</button>
      </nav>
      <MotionRuntimeVerificationPanel />
      <Show when={mode() === "reviews"} fallback={
        <Show when={mode() === "semantic-batch"} fallback={
          <Show when={mode() === "semantic"} fallback={
            <Show when={mode() === "transaction"} fallback={
              <Show when={mode() === "screen-import"} fallback={
                <Show when={mode() === "variants"} fallback={
                  <Show when={mode() === "style-ownership"} fallback={
                    <Show when={mode() === "motion"} fallback={
                      <>
                        <ManualProjectStudio />
                        <GefestLiveProjectBridge />
                      </>
                    }>
                      <MotionCompositionWorkbench />
                    </Show>
                  }>
                    <StyleOwnershipWorkbench />
                  </Show>
                }>
                  <VariantWorkbench />
                </Show>
              }>
                <ScreenImportWorkbench onOpenProjectSession={() => setMode("project")} />
              </Show>
            }>
              <TransactionWorkbench />
            </Show>
          }>
            <SemanticOperationsWorkbench />
          </Show>
        }>
          <SemanticBatchWorkbench />
        </Show>
      }>
        <ReviewInboxWorkbench />
      </Show>
    </>
  );
}

render(() => <StudioRoot />, root);
