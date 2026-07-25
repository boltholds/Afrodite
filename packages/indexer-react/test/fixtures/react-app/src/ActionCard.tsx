import type { MouseEventHandler } from "react";

export interface ActionCardProps {
  /** Visible card title. */
  title: string;
  subtitle?: string;
  tone?: "pink" | "cyan";
  count?: number;
  tags?: string[];
  metadata?: {
    trackingId: string;
    priority: number;
  };
  onActivate?: MouseEventHandler<HTMLButtonElement>;
}

export function ActionCard({
  title,
  subtitle = "React runtime",
  tone = "pink",
  count = 3,
  tags = ["react", "indexed"],
  onActivate,
}: ActionCardProps) {
  const accent = tone === "pink" ? "#ff2fa6" : "#39d9ff";

  return (
    <article
      style={{
        minWidth: 240,
        border: `1px solid ${accent}`,
        borderRadius: 8,
        padding: 16,
        background: "rgba(10, 8, 20, 0.92)",
        color: "#f8f3ff",
        boxShadow: `0 0 22px ${accent}33`,
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <small style={{ color: accent, textTransform: "uppercase", letterSpacing: "0.12em" }}>
        React · {count}
      </small>
      <h3 style={{ margin: "8px 0 4px" }}>{title}</h3>
      <p style={{ margin: "0 0 12px", opacity: 0.72 }}>{subtitle}</p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {tags.map((tag) => (
          <span key={tag} style={{ border: `1px solid ${accent}66`, borderRadius: 999, padding: "2px 8px" }}>
            {tag}
          </span>
        ))}
      </div>
      <button type="button" onClick={onActivate} style={{ marginTop: 14 }}>
        Activate
      </button>
    </article>
  );
}

export function add(left: number, right: number): number {
  return left + right;
}
