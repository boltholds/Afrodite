"use server";

export interface ServerCardProps {
  title: string;
}

export function ServerCard(props: ServerCardProps) {
  return <article>{props.title}</article>;
}
