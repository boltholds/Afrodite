import { render } from "solid-js/web";
import { LiveStudioApp } from "./LiveStudioApp";
import "./styles.css";
import "./vs003.css";
import "./source-sync.css";
import "./live-session.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Afrodite Studio root element was not found");
}

render(() => <LiveStudioApp />, root);
