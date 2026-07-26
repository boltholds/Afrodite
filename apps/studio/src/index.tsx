import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { render } from "solid-js/web";
import { App } from "./App";
import { SourceSyncApp } from "./SourceSyncApp";
import "./styles.css";
import "./vs003.css";
import "./source-sync.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Afrodite Studio root element was not found");
}

function StudioRoot() {
  const [workspace, setWorkspace] = createSignal(readWorkspace());

  onMount(() => {
    const handleHashChange = () => setWorkspace(readWorkspace());
    window.addEventListener("hashchange", handleHashChange);
    onCleanup(() => window.removeEventListener("hashchange", handleHashChange));
  });

  return (
    <>
      <nav class="workspace-switcher" aria-label="Afrodite workspace">
        <a classList={{ active: workspace() === "canvas" }} href="#canvas">Canvas</a>
        <a classList={{ active: workspace() === "source-sync" }} href="#source-sync">Source Sync</a>
      </nav>
      <Show when={workspace() === "source-sync"} fallback={<App />}>
        <SourceSyncApp />
      </Show>
    </>
  );
}

function readWorkspace(): "canvas" | "source-sync" {
  return window.location.hash === "#source-sync" ? "source-sync" : "canvas";
}

render(() => <StudioRoot />, root);
