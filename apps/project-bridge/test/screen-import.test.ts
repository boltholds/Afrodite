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
  it("imports a bounded React screen without executing the project", async () => {
    const root = await createFixture();
    const service = new ProjectBridgeService({ projectRoot: root });
    const result = await service.importScreen({
      adapterId: "afrodite.adapter.react",
      repositoryPath: "src/Screen.tsx",
      exportName: "Screen",
    });

    expect(result.document?.root.kind).toBe("element");
    expect(result.document?.root.sourceBinding?.stableMarker).toBe("screen.root");
    expect(result.stats.readOnlyRegions).toBeGreaterThan(0);
    expect(result.document?.root.children.some((child) => child.kind === "source-region")).toBe(true);
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
    `export function Screen(props: { ready: boolean }) {
  return (
    <main data-afrodite-id="screen.root" style={{ display: "grid", gap: 16 }}>
      <h1>Screen</h1>
      {props.ready ? <section>Ready</section> : <section>Loading</section>}
    </main>
  );
}
`,
    "utf8",
  );
  return root;
}
