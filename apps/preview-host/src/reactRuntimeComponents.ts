import React, {
  createContext,
  useContext,
  type MouseEventHandler,
} from "react";

export interface ActionCardProps {
  readonly title?: string;
  readonly subtitle?: string;
  readonly tone?: "pink" | "cyan";
  readonly count?: number;
  readonly tags?: readonly string[];
  readonly onActivate?: MouseEventHandler<HTMLButtonElement>;
}

export function ActionCard({
  title = "Action card",
  subtitle = "React runtime",
  tone = "pink",
  count = 3,
  tags = ["react", "preview"],
  onActivate,
}: ActionCardProps): React.ReactElement {
  const accent = tone === "pink" ? "#ff2fa6" : "#39d9ff";
  return React.createElement(
    "article",
    {
      "data-afrodite-id": "react:src/ActionCard.tsx#ActionCard",
      style: {
        minWidth: 240,
        border: `1px solid ${accent}`,
        borderRadius: 8,
        padding: 16,
        background: "rgba(10, 8, 20, 0.92)",
        color: "#f8f3ff",
        boxShadow: `0 0 22px ${accent}33`,
        fontFamily: "Inter, system-ui, sans-serif",
      },
    },
    React.createElement(
      "small",
      { style: { color: accent, textTransform: "uppercase", letterSpacing: "0.12em" } },
      `React · ${count}`,
    ),
    React.createElement("h3", { style: { margin: "8px 0 4px" } }, title),
    React.createElement("p", { style: { margin: "0 0 12px", opacity: 0.72 } }, subtitle),
    React.createElement(
      "div",
      { style: { display: "flex", gap: 6, flexWrap: "wrap" } },
      ...tags.map((tag) => React.createElement(
        "span",
        {
          key: tag,
          style: { border: `1px solid ${accent}66`, borderRadius: 999, padding: "2px 8px" },
        },
        tag,
      )),
    ),
    React.createElement(
      "button",
      { type: "button", onClick: onActivate, style: { marginTop: 14 } },
      "Activate",
    ),
  );
}

const RuntimeContext = createContext("unbound");

export interface ContextBadgeProps {
  readonly label?: string;
}

export function ContextBadge({ label = "Runtime" }: ContextBadgeProps): React.ReactElement {
  const runtime = useContext(RuntimeContext);
  return React.createElement("span", null, `${label}: ${runtime}`);
}
