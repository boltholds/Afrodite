import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectBridgeService, ProjectBridgeServiceError } from "../src/service.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("ProjectBridgeService screen import", () => {
  it("imports a bounded React component graph without executing the project", async () => {
    const root = await createFixture();
    const service = new ProjectBridgeService({ projectRoot: root });
    const result = await service.importScreen({
      adapterId: "afrodite.adapter.react",
      repositoryPath: "src/Screen.tsx",
      exportName: "Screen",
      maxFiles: 8,
      maxNodes: 100,
      maxGraphDepth: 4,
    });

    expect(result.document?.root.kind).toBe("element");
    expect(result.document?.root.sourceBinding?.stableMarker).toBe("screen.root");
    expect(result.stats.readOnlyRegions).toBeGreaterThan(0);
    expect(result.document?.root.children.some((child) => child.kind === "source-region")).toBe(true);
    expect(result.graph?.filesRead).toBe(2);
    expect(result.graph?.expandedComponents).toBe(1);
    expect(result.edges?.[0]).toMatchObject({
      localName: "Card",
      targetRepositoryPath: "src/Card.tsx",
      status: "expanded",
    });
    expect(result.files?.map((file) => file.repositoryPath)).toEqual([
      "src/Screen.tsx",
      "src/Card.tsx",
    ]);
  });

  it("keeps explicit stop boundaries inside the bridge request contract", async () => {
    const root = await createFixture();
    const service = new ProjectBridgeService({ projectRoot: root });
    const result = await service.importScreen({
      adapterId: "afrodite.adapter.react",
      repositoryPath: "src/Screen.tsx",
      exportName: "Screen",
      stopComponents: ["Card"],
    });

    expect(result.graph?.filesRead).toBe(1);
    expect(result.edges?.[0]?.status).toBe("boundary");
  });

  it("rejects unknown import adapters", async () => {
    const root = await createFixture();
    const service = new ProjectBridgeService({ projectRoot: root });
    await expect(service.importScreen({
      adapterId: "afrodite.adapter.unknown",
      repositoryPath: "src/Screen.tsx",
      exportName: "Screen",
    })).rejects.toMatchObject<ProjectBridgeServiceError>({ code: "SCREEN_IMPORT_ADAPTER_NOT_FOUND" });
  });
});

async function createFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "afrodite-import-"));
  roots.push(root);
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(
    path.join(root, "src/Screen.tsx"),
    `import { Card } from "./Card";
export function Screen(props: { ready: boolean }) {
  return (
    <main data-afrodite-id="screen.root" style={{ display: "grid", gap: 16 }}>
      <h1>Screen</h1>
      <Card />
      {props.ready ? <section>Ready</section> : <section>Loading</section>}
    </main>
  );
}
`,
    "utf8",
  );
  await writeFile(
    path.join(root, "src/Card.tsx"),
    `export function Card() {
  return <article data-afrodite-id="card.root" />;
}
`,
    "utf8",
  );
  return root;
}
