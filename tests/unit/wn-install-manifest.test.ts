import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { NativeToolchainResolver } from "../../src/runners/native-toolchain.js";

describe.skipIf(process.platform !== "win32")("WN15 installed Maven and JDK byte set", () => {
  it("changes verified plan identity when Maven jar or JDK runtime bytes change", () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-install-manifest-"));
    try {
      const maven = join(root, "apache-maven");
      const jdk = join(root, "jdk");
      const work = join(root, "work");
      for (const dir of [work, ...["bin", "boot", "lib", "conf"].map((part) => join(maven, part)),
        ...["bin", "lib", "conf"].map((part) => join(jdk, part))]) mkdirSync(dir, { recursive: true });
      const script = join(maven, "bin", "mvn.cmd");
      const jar = join(maven, "lib", "maven-core.jar");
      const modules = join(jdk, "lib", "modules");
      writeFileSync(script, "@echo off\r\n");
      writeFileSync(join(maven, "boot", "plexus-classworlds.jar"), "boot-v1");
      writeFileSync(jar, "core-v1");
      writeFileSync(join(maven, "conf", "settings.xml"), "<settings/>");
      writeFileSync(join(jdk, "bin", "java.exe"), "java-v1");
      writeFileSync(join(jdk, "bin", "jvm.dll"), "dll-v1");
      writeFileSync(modules, "modules-v1");
      writeFileSync(join(jdk, "conf", "java.security"), "security-v1");
      writeFileSync(join(jdk, "release"), "JAVA_VERSION=25");
      const options = { cwd: work, env: { Path: join(maven, "bin"), JAVA_HOME: jdk }, executable: script };
      const first = NativeToolchainResolver.resolve(options);
      expect(first.distributionManifestComplete).toBe(true);
      for (const path of [script, jar, modules, join(jdk, "bin", "java.exe"), join(jdk, "bin", "jvm.dll"),
        join(maven, "boot", "plexus-classworlds.jar"), join(maven, "conf", "settings.xml"), join(jdk, "release")]) {
        expect(first.pinnedInputs.some((input) => input.path === path && input.sha256 !== null)).toBe(true);
      }
      writeFileSync(jar, "core-v2");
      const second = NativeToolchainResolver.resolve(options);
      expect(second.identity).not.toBe(first.identity);
      expect(second.pinnedInputs.some((input) => input.path === jar && input.sha256 !== null)).toBe(true);
      writeFileSync(modules, "modules-v2");
      const third = NativeToolchainResolver.resolve(options);
      expect(third.identity).not.toBe(second.identity);
      expect(third.pinnedInputs.some((input) => input.path === modules && input.sha256 !== null)).toBe(true);
    } finally {
      const target = resolve(root);
      if (target.startsWith(`${resolve(tmpdir())}${sep}`) && target.split(sep).at(-1)?.startsWith("aitest-wn-install-manifest-")) {
        rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      }
    }
  });
});
