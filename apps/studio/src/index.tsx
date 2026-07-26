import { createSignal, Show } from "solid-js";
import { render } from "solid-js/web";
import { LiveStudioAppV9 } from "./LiveStudioAppV9";
import { StyleOwnershipWorkbench } from "./StyleOwnershipWorkbench";
import "./styles.css";
import "./vs003.css";
import "./source-sync.css";
import "./live-session.css";
import "./binding-manager.css";
import "./style-ownership.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Afrodite Studio root element was not found");
}

function StudioRoot() {
  const [mode, setMode] = createSignal<"project" | "style-ownership">("project");
  return (
    <>
      <nav class="studio-mode-switcher" aria-label="Afrodite Studio mode">
        <button classList={{ active: mode() === "project" }} onClick={() => setMode("project")}>Project session</button>
        <button classList={{ active: mode() === "style-ownership" }} onClick={() => setMode("style-ownership")}>Style ownership</button>
      </nav>
      <Show when={mode() === "style-ownership"} fallback={<LiveStudioAppV9 />}>
        <StyleOwnershipWorkbench />
      </Show>
    </>
  );
}

render(() => <StudioRoot />, root);
