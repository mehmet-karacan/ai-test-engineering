import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Storage } from "../../src/storage/storage.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";

describe("S04 proje ve checkout kimligi", () => {
  const fixtures: string[] = [];
  const storages: Storage[] = [];
  afterEach(() => {
    for (const storage of storages.splice(0)) storage.close();
    for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
  });

  function repository() {
    const root = mkdtempSync(join(tmpdir(), "aitest-s04-identity-"));
    fixtures.push(root);
    const storage = new Storage({ dbPath: join(root, "state.db") });
    storage.migrate();
    storages.push(storage);
    return { storage, projects: new ProjectRepository(storage.db) };
  }

  it("remote'suz ayni ada sahip farkli kokleri farkli project olarak tutar", () => {
    const { projects } = repository();
    const first = projects.ensureLocation("C:/checkout/one", "demo", null);
    const second = projects.ensureLocation("C:/checkout/two", "demo", null);
    expect(second.project.id).not.toBe(first.project.id);
    expect(second.location.id).not.toBe(first.location.id);
  });

  it("ayni remote farkli checkout'lari tek project altinda farkli location yapar", () => {
    const { projects } = repository();
    const first = projects.ensureLocation("C:/checkout/one", "demo", "https://github.com/acme/demo.git");
    const second = projects.ensureLocation("D:/checkout/two", "demo", "https://github.com/acme/demo.git");
    expect(second.project.id).toBe(first.project.id);
    expect(second.location.id).not.toBe(first.location.id);
  });

  it("ayni ada sahip farkli remote'lari birlestirmez", () => {
    const { projects } = repository();
    const first = projects.ensureLocation("C:/checkout/one", "demo", "https://github.com/acme/one.git");
    const second = projects.ensureLocation("C:/checkout/two", "demo", "https://github.com/acme/two.git");
    expect(second.project.id).not.toBe(first.project.id);
  });

  it("eski belirsiz remote kaydinda sessiz secim yerine typed ambiguity doner", () => {
    const { storage, projects } = repository();
    const now = Date.now();
    const project = (id: string) => storage.db.prepare(
      "INSERT INTO projects (id, name, normalized_remote, identity_kind, created_at, updated_at, row_version) VALUES (?, 'demo', 'https://github.com/acme/demo.git', 'git_remote', ?, ?, 0)",
    ).run(id, now, now);
    project("00000000-0000-4000-8000-000000000001");
    project("00000000-0000-4000-8000-000000000002");
    expect(() => projects.ensureLocation("C:/checkout/three", "demo", "https://github.com/acme/demo.git"))
      .toThrowError(expect.objectContaining({ details: expect.objectContaining({ reason_code: "PROJECT_IDENTITY_AMBIGUOUS" }) }));
    expect(storage.db.prepare("SELECT COUNT(*) AS count FROM project_locations").get()).toEqual({ count: 0 });
  });
});
