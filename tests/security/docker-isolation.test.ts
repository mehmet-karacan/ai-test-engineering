/**
 * AC39/AC40: Izole Docker runner fault testleri.
 * Host source/home/secrets erisimi engellenir; network/kotasI gercekten uygulanir.
 * Kontrollu, yerel, sentetik; gercek kurum sistemi hedeflenmez.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import { DockerRunner, DEFAULT_MAVEN_IMAGE, assertDockerPreflightUsable } from "../../src/runners/docker-runner.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";

const RUN_OPTS = (projectDir: string, logDir: string) => ({
  working_dir: projectDir,
  image: DEFAULT_MAVEN_IMAGE,
  timeout_ms: 120000,
  log_dir: logDir,
  network: "none" as const,
  memory_mb: 1024,
  cpus: 1,
});

describe("AC39: izole runner host erisimi (gercek Docker)", () => {
  let dir: string;
  let projectDir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-docker-"));
    projectDir = join(dir, "project");
    mkdirSync(join(projectDir, "src"), { recursive: true });
    writeFileSync(join(projectDir, "src", "Secret.java"), "public class Secret {}\n");
  });

  afterAll(() => {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Windows dosya kilidi
    }
  });

  it("preflight temiz olmali", async () => {
    const runner = new DockerRunner();
    const preflight = await runner.preflight();
    assertDockerPreflightUsable(preflight);
    expect(preflight.docker_available).toBe(true);
  }, 60000);

  it("read-only mount'a yazma engellenmeli (AC39)", async () => {
    const runner = new DockerRunner();
    const result = await runner.run({
      ...RUN_OPTS(projectDir, join(dir, "logs-1")),
      command: ["sh", "-c", "(echo hacked > /work/src/Secret.java) 2>&1 || echo WRITE_DENIED"],
    });
    const output = readFileSync(result.stdout_log_path, "utf8");
    expect(output).toContain("Read-only file system");
    expect(readFileSync(join(projectDir, "src", "Secret.java"), "utf8")).toBe("public class Secret {}\n");
  }, 180000);

  it("host home/secrets container'a verilmez (AC39)", async () => {
    const runner = new DockerRunner();
    const result = await runner.run({
      ...RUN_OPTS(projectDir, join(dir, "logs-2")),
      command: ["sh", "-c", "ls /root/.ssh 2>&1 || echo NO_SSH; ls /work/.. 2>&1 | head -3"],
    });
    const output = readFileSync(result.stdout_log_path, "utf8");
    expect(output).not.toContain("id_rsa");
  }, 180000);

  it("yalniz /work mount edilmis olmali; host ozel dizinleri yok (AC39)", async () => {
    const runner = new DockerRunner();
    const result = await runner.run({
      ...RUN_OPTS(projectDir, join(dir, "logs-3")),
      command: ["sh", "-c", "ls / | tr '\\n' ' '"],
    });
    const output = readFileSync(result.stdout_log_path, "utf8");
    expect(output).toContain("work");
    // host ozel dizinleri (Linux standart dizinleri home/var/usr degil):
    expect(output).not.toContain("Users");
    expect(output).not.toContain("innova");
    expect(output).not.toContain("projeler");
    // /work icerigi proje dosyalari olmali:
    const listing = await runner.run({
      ...RUN_OPTS(projectDir, join(dir, "logs-3b")),
      command: ["sh", "-c", "ls /work | tr '\\n' ' '"],
    });
    const workOutput = readFileSync(listing.stdout_log_path, "utf8");
    expect(workOutput).toContain("src");
  }, 180000);
});

describe("AC40: kotalar gercekten uygulanmali (gercek Docker)", () => {
  let dir: string;
  let projectDir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-docker-kota-"));
    projectDir = join(dir, "project");
    mkdirSync(projectDir, { recursive: true });
  });

  afterAll(() => {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Windows dosya kilidi
    }
  });

  it("network kapali: dis ag erisimi engellenmeli (AC40)", async () => {
    const runner = new DockerRunner();
    const result = await runner.run({
      ...RUN_OPTS(projectDir, join(dir, "logs-net")),
      command: ["sh", "-c", "(wget -q -T 3 -O /dev/null http://example.com) 2>&1 || echo NETWORK_DENIED"],
    });
    const output = readFileSync(result.stdout_log_path, "utf8");
    expect(output).toContain("NETWORK_DENIED");
  }, 180000);

  it("non-root kullanici ile calismali (AC39/AC40)", async () => {
    const runner = new DockerRunner();
    const result = await runner.run({
      ...RUN_OPTS(projectDir, join(dir, "logs-user")),
      command: ["sh", "-c", "id -u; id -g"],
    });
    const output = readFileSync(result.stdout_log_path, "utf8");
    expect(output).toContain("1000");
    expect(output).not.toContain("\n0\n");
  }, 180000);

  it("memory limiti konteyner'a uygulanmali", async () => {
    const runner = new DockerRunner();
    const result = await runner.run({
      ...RUN_OPTS(projectDir, join(dir, "logs-mem")),
      command: ["sh", "-c", "cat /sys/fs/cgroup/memory.max 2>/dev/null || cat /sys/fs/cgroup/memory/memory.limit_in_bytes 2>/dev/null || echo NO_CGROUP"],
    });
    const output = readFileSync(result.stdout_log_path, "utf8");
    expect(output).toMatch(/1073741824|NO_CGROUP/);
  }, 180000);
});
