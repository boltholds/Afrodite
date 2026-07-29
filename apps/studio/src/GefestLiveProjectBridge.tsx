import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { currentLiveProjectSessionState } from "@afrodite/project-session";
import { decodeUiDocument, serializeUiDocument, type UiDocument } from "@afrodite/ui-ir";
import { GefestLiveCanvas } from "./GefestLiveCanvas";
import { GEFEST_DOCUMENT_ID } from "./gefestProjectSeed";

const STORAGE_KEY = "afrodite.ui-document.v1";

export function GefestLiveProjectBridge() {
  const [canvasHost, setCanvasHost] = createSignal<HTMLElement>();
  const [liveVisible, setLiveVisible] = createSignal(currentDocument()?.id === GEFEST_DOCUMENT_ID);
  let observer: MutationObserver | undefined;

  const locateCanvas = () => {
    const next = document.querySelector<HTMLElement>(".manual-canvas");
    setCanvasHost(next ?? undefined);
  };

  const handleImported = (document: UiDocument, status: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, serializeUiDocument(document));
      sessionStorage.setItem("afrodite.gefest-import-status", status);
    } finally {
      window.location.reload();
    }
  };

  const handleRuntimeSelection = (nodeId: string) => {
    const nodes = document.querySelectorAll<HTMLElement>("[data-afrodite-node-id]");
    const target = [...nodes].find((node) => node.dataset.afroditeNodeId === nodeId);
    target?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  };

  onMount(() => {
    locateCanvas();
    observer = new MutationObserver(locateCanvas);
    observer.observe(document.body, { childList: true, subtree: true });
    onCleanup(() => observer?.disconnect());
  });

  return (
    <Show when={canvasHost()} keyed>
      {(mount) => (
        <Portal mount={mount}>
          <Show when={liveVisible()} fallback={
            <button class="gefest-live-launcher" onClick={() => setLiveVisible(true)}>
              Open live Gefest CAD
            </button>
          }>
            <GefestLiveCanvas
              getDocument={() => currentDocument() ?? emptyFallbackDocument()}
              onImported={handleImported}
              onSelectNode={(nodeId) => handleRuntimeSelection(nodeId)}
              onShowSemantic={() => setLiveVisible(false)}
            />
          </Show>
        </Portal>
      )}
    </Show>
  );
}

function currentDocument(): UiDocument | undefined {
  const active = currentLiveProjectSessionState();
  if (active) return active.history.present;
  try {
    const source = localStorage.getItem(STORAGE_KEY);
    if (!source) return undefined;
    const decoded = decodeUiDocument(source);
    return decoded.ok ? decoded.document : undefined;
  } catch {
    return undefined;
  }
}

function emptyFallbackDocument(): UiDocument {
  return {
    schemaVersion: 1,
    id: "document.unavailable",
    name: "Unavailable project session",
    root: {
      id: "node.unavailable",
      kind: "element",
      element: "div",
      name: "Unavailable",
      layout: {
        display: "block",
        direction: "column",
        sizing: { width: "fill", height: "fill" },
      },
      props: {},
      children: [],
    },
  };
}
