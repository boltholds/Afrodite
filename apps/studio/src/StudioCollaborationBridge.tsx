import { onCleanup, onMount } from "solid-js";
import {
  subscribeLiveProjectSession,
  type LiveProjectSessionSnapshot,
} from "@afrodite/project-session";
import { ProjectBridgeClient } from "./projectBridgeClient";

const BRIDGE_TOKEN_KEY = "afrodite.project-bridge.token";
const COLLABORATION_SESSION_KEY = "afrodite.collaboration.session-id";
const DEFAULT_BRIDGE_URL = import.meta.env.VITE_PROJECT_BRIDGE_URL ?? "http://127.0.0.1:4175";

export function StudioCollaborationBridge() {
  let latest: LiveProjectSessionSnapshot | undefined;
  let publishing = false;
  let lastPublished = "";
  const sessionId = getOrCreateSessionId();

  const publish = async () => {
    if (!latest || publishing) return;
    const token = sessionStorage.getItem(BRIDGE_TOKEN_KEY) ?? "";
    if (token.length < 16) return;
    const identity = `${sessionId}:${latest.revision}`;
    if (identity === lastPublished) return;

    publishing = true;
    try {
      const client = new ProjectBridgeClient(DEFAULT_BRIDGE_URL, token);
      await client.publishLiveSession(sessionId, latest.revision, latest.document);
      lastPublished = identity;
      window.dispatchEvent(new CustomEvent("afrodite:live-session-published", {
        detail: { sessionId, revision: latest.revision },
      }));
    } catch {
      // Studio remains fully usable while the local bridge is offline.
    } finally {
      publishing = false;
    }
  };

  const unsubscribe = subscribeLiveProjectSession((snapshot) => {
    latest = snapshot;
    void publish();
  });

  onMount(() => {
    const interval = window.setInterval(() => void publish(), 1_000);
    onCleanup(() => window.clearInterval(interval));
  });
  onCleanup(unsubscribe);

  return null;
}

function getOrCreateSessionId(): string {
  const existing = sessionStorage.getItem(COLLABORATION_SESSION_KEY);
  if (existing) return existing;
  const created = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `studio_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  sessionStorage.setItem(COLLABORATION_SESSION_KEY, created);
  return created;
}
