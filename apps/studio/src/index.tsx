import { render } from "solid-js/web";
import { LiveStudioAppV9 } from "./LiveStudioAppV9";
import "./styles.css";
import "./vs003.css";
import "./source-sync.css";
import "./live-session.css";
import "./binding-manager.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Afrodite Studio root element was not found");
}

render(() => <LiveStudioAppV9 />, root);
