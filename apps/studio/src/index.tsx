import { createSignal, Show } from "solid-js";
import { render } from "solid-js/web";
import { LiveStudioAppV9 } from "./LiveStudioAppV9";
import { ReviewInboxWorkbench } from "./ReviewInboxWorkbench";
import { ScreenImportWorkbench } from "./ScreenImportWorkbench";
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
import "./review-inbox.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Afrodite Studio root element was not found");
}

type StudioMode = "project" | "style-ownership" | "screen-import" | "transaction" | "variants" | "semantic" | "reviews";

function StudioRoot() {
  const [mode, setMode] = createSignal<StudioMode>("project");
  return (
    <>
      <StudioCollaborationBridge />
      <nav class="studio-mode-switcher" aria-label="Afrodite Studio mode">
        <button classList={{ active: mode() === "project" }} onClick={() => setMode("project")}>Project session</button>
        <button classList={{ active: mode() === "reviews" }} onClick={() => setMode("reviews")}>Review inbox</button>
        <button classList={{ active: mode() === "style-ownership" }} onClick={() => setMode("style-ownership")}>Style ownership</button>
        <button classList={{ active: mode() === "variants" }} onClick={() => setMode("variants")}>Variants</button>
        <button classList={{ active: mode() === "semantic" }} onClick={() => setMode("semantic")}>Semantic API</button>
        <button classList={{ active: mode() === "screen-import" }} onClick={() => setMode("screen-import")}>Screen import</button>
        <button classList={{ active: mode() === "transaction" }} onClick={() => setMode("transaction")}>Transactions</button>
      </nav>
      <Show when={mode() === "reviews"} fallback={
        <Show when={mode() === "semantic"} fallback={
          <Show when={mode() === "transaction"} fallback={
            <Show when={mode() === "screen-import"} fallback={
              <Show when={mode() === "variants"} fallback={
                <Show when={mode() === "style-ownership"} fallback={<LiveStudioAppV9 />}>
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
        <ReviewInboxWorkbench />
      </Show>
    </>
  );
}

render(() => <StudioRoot />, root);
