import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Storage } from "../../src/storage/storage.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";

describe("WN32-WN35: project/location identity", () => {
  let dir: string;
  let storage: Storage;
  let projects: ProjectRepository;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-wn-project-identity-"));
    storage = new Storage({ dbPath: join(dir, "state.db") });
    storage.migrate();
    projects = new ProjectRepository(storage.db);
  });

  afterEach(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("ayni adli iki remote'suz kok ayridir; ayni remote checkout'lari ayni project'te location olarak kalir", () => {
    const localA = projects.ensureLocation("C:/work/alpha-a", "alpha", null);
    const localB = projects.ensureLocation("C:/work/alpha-b", "alpha", null);
    expect(localB.project.id).not.toBe(localA.project.id);

    const remoteA = projects.ensureLocation("C:/work/repo-a", "repo", "https://github.com/mehmet-karacan/repo.git");
    const remoteB = projects.ensureLocation("D:/work/repo-b", "repo", "https://github.com/mehmet-karacan/repo");
    expect(remoteB.project.id).toBe(remoteA.project.id);
    expect(remoteB.location.id).not.toBe(remoteA.location.id);
  });
});
