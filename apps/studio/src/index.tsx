import { render } from "solid-js/web";
import { App } from "./App";
import "./styles.css";
import "./vs003.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Afrodite Studio root element was not found");
}

render(() => <App />, root);
