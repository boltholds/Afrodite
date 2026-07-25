export interface AsyncPanelProps {
  title: string;
}

export async function AsyncPanel(props: AsyncPanelProps) {
  return <section>{props.title}</section>;
}
