import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { NativeToolchainResolver, verifyNativeToolchain } from "../../src/runners/native-toolchain.js";
import { CustomerRunnerFactory } from "../../src/runners/runner-factory.js";
import { WindowsProcessSupervisor } from "../../src/runners/windows-process-supervisor.js";

describe.skipIf(process.platform !== "win32")("WN15 customer native preflight", () => {
  it("refuses an incomplete installed distribution before any version probe", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-install-preflight-"));
    const run = vi.spyOn(WindowsProcessSupervisor.prototype, "run");
    try {
      const script = join(root, "mvn.cmd");
      writeFileSync(script, "@echo off\r\necho SHOULD_NOT_RUN\r\n");
      const env = { Path: root, JAVA_HOME: join(root, "missing-jdk") };
      const selected = NativeToolchainResolver.resolve({ cwd: root, executable: script, env });
      expect(selected.distributionManifestComplete).toBe(false);
      await expect(verifyNativeToolchain(selected, env, undefined, {
        beforeSpawn() {}, afterSpawn() {}, afterTerminal() {},
      })).rejects.toMatchObject({ details: { reason_code: "TOOLCHAIN_DISTRIBUTION_UNVERIFIED" } });
      expect(run).not.toHaveBeenCalled();
    } finally {
      run.mockRestore();
      const target = resolve(root);
      const inside = relative(resolve(tmpdir()), target);
      if (inside && !inside.startsWith("..") && !isAbsolute(inside) && basename(target).startsWith("aitest-wn-install-preflight-")) {
        rmSync(target, { recursive: true, force: true });
      }
    }
  });

  it("requires an owned lifecycle even if the outer customer gate is later opened", async () => {
    const readiness = vi.spyOn(CustomerRunnerFactory.prototype, "assertNativeCustomerReady").mockImplementation(() => {});
    try {
      await expect(new CustomerRunnerFactory().prepareNativeCustomerToolchain({
        cwd: resolve("."), env: { Path: "C:\\no-such-maven" }, executable: "C:\\no-such-maven\\mvn.cmd",
      }))
        .rejects.toMatchObject({ details: { reason_code: "NATIVE_PROCESS_OWNERSHIP_UNVERIFIED" } });
    } finally { readiness.mockRestore(); }
  });
});
