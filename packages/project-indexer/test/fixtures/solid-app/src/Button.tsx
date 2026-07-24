import type { Component } from "solid-js";

export interface ButtonProps {
  /** Visible button label. */
  label: string;
  disabled?: boolean;
  tone?: "pink" | "cyan";
  metadata?: {
    trackingId: string;
    priority: number;
  };
  onClick?: () => void;
}

export const Button: Component<ButtonProps> = (props) => (
  <button disabled={props.disabled} onClick={props.onClick}>
    {props.label}
  </button>
);
