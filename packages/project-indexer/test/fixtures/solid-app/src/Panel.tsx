export default function Panel(
  props: {
    title: string;
    tags?: string[];
    density?: "compact" | "comfortable";
  },
) {
  return (
    <section>
      <h2>{props.title}</h2>
      <p>{props.tags?.join(", ")}</p>
    </section>
  );
}
