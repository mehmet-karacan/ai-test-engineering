import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultServicesForTest } from "../../src/application/services.js";
import type { Services } from "../../src/application/services.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { JobDispatcher } from "../../src/orchestration/job-dispatcher.js";
import { LeaseManager } from "../../src/orchestration/lease-manager.js";
import { CustomerRunnerFactory } from "../../src/runners/runner-factory.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("P02 dispatch cleanup", () => {
  it("baseline erken donusunde lease'i serbest birakir", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-p02-cleanup-"));
    let services: Services | null = null;
    try {
      const projectRoot = join(root, "project");
      mkdirSync(projectRoot, { recursive: true });
      writeFileSync(join(projectRoot, "pom.xml"), `<?xml version="1.0"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion><groupId>g</groupId><artifactId>no-tests</artifactId><version>1</version>
</project>`);

      services = createDefaultServicesForTest(join(root, "state.db"), join(root, "artifacts"));
      vi.spyOn(CustomerRunnerFactory.prototype, "assertHostDevOnlyAllowed").mockImplementation(() => undefined);
      const projects = new ProjectRepository(services.storage!.db);
      const { location } = projects.ensureLocation(projectRoot, "no-tests", null);
      const job = services.jobs!.createJob({ locationId: location.id, requestDigest: "p02-cleanup" });
      const dispatcher = new JobDispatcher({
        services,
        runnerKind: "host_dev_only",
        workerEnabled: false,
        workspaceRoot: join(root, "workspace"),
      });
      const goal = dispatcher.buildGoalContract(job, [], projectRoot);

      const result = await dispatcher.dispatch(job, goal, projectRoot);

      expect(result.final_outcome).toBe("BASELINE_FAILED");
      const leases = new LeaseManager(services.storage!.db);
      expect(leases.get(job.id).expires_at).toBeLessThanOrEqual(Date.now());
    } finally {
      // Dispatch erken hata verse bile SQLite handle'i acik birakilmaz.
      try { services?.storage?.close(); } catch { /* test cleanup */ }
      rmSync(root, { recursive: true, force: true });
    }
  });
});
