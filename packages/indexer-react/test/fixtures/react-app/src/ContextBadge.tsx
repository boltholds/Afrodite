/** @jsxImportSource react */
import { createContext, useContext } from "react";

const RuntimeContext = createContext("unbound");

export interface ContextBadgeProps {
  label: string;
}

export const ContextBadge = ({ label }: ContextBadgeProps) => {
  const runtime = useContext(RuntimeContext);
  return <span>{label}: {runtime}</span>;
};
