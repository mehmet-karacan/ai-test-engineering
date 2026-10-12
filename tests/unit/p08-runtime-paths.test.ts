/**
 * P08/PP42: ortak runtime path resolver - desteklenen platformlarda config ve DB
 * ayni native path'ten turetilir; Linux/XDG, bosluk ve Unicode path'lerde ayrisma yok.
 * Bu test gercek makine kurulumu degil; resolver'in platform dallarini dogrulayip
 * PP42'nin yerel (izole) kismindan kanit uretir.
 */
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import {
  resolveConfigPath,
  resolveDbPath,
  resolveOpenCodeConfigPath,
  resolveRuntimeRoot,
} from "../../src/configuration/runtime-paths.js";

describe("P08/PP42: runtime path resolver (Linux/XDG/bosluk/Unicode)", () => {
  it("linux XDG_DATA_HOME: config ve DB ayni native root'tan turetilir", () => {
    const env = { XDG_DATA_HOME: "/home/user/.local/share", XDG_CONFIG_HOME: "/home/user/.config" };
    const root = resolveRuntimeRoot(env, "linux");
    expect(root).toBe(join("/home/user/.local/share", "ai-test-engineering"));
    expect(resolveConfigPath(env, "linux")).toBe(join(root, "config", "config.json"));
    expect(resolveDbPath(root, env)).toBe(join(root, "state.db"));
  });

  it("linux XDG yoksa ~/.local/share (data) ve ~/.config (config) varsayilani", () => {
    const env = { HOME: "/home/user" };
    const root = resolveRuntimeRoot(env, "linux");
    expect(root).toBe(join("/home/user", ".local", "share", "ai-test-engineering"));
    expect(resolveConfigPath(env, "linux")).toBe(join(root, "config", "config.json"));
    expect(resolveOpenCodeConfigPath(env, "linux")).toBe(join("/home/user", ".config", "opencode", "opencode.json"));
  });

  it("win32 LOCALAPPDATA bosluk + Unicode icermede native path korunur", () => {
    const local = "C:/Users/Ögrenci Bölüm/AppData/Local";
    const env = { LOCALAPPDATA: local, USERPROFILE: "C:/Users/Ögrenci Bölüm" };
    const root = resolveRuntimeRoot(env, "win32");
    expect(root).toBe(join(local, "ai-test-engineering"));
    // config ve DB ayni native root kokunden; bosluk/Unicode birlestirme bozulmaz
    expect(resolveConfigPath(env, "win32")).toBe(join(root, "config", "config.json"));
    expect(resolveDbPath(root, {})).toBe(join(root, "state.db"));
  });

  it("win32 LOCALAPPDATA yoksa USERPROFILE/AppData/Local fallback", () => {
    const env = { USERPROFILE: "C:/Users/tester" };
    const root = resolveRuntimeRoot(env, "win32");
    expect(root).toBe(join("C:/Users/tester", "AppData", "Local", "ai-test-engineering"));
    expect(resolveConfigPath(env, "win32")).toBe(join(root, "config", "config.json"));
  });

  it("darwin HOME/Library/Application Support dali native path uretir", () => {
    const env = { HOME: "/Users/tester" };
    const root = resolveRuntimeRoot(env, "darwin");
    expect(root).toBe(join("/Users/tester", "Library", "Application Support", "ai-test-engineering"));
    expect(resolveConfigPath(env, "darwin")).toBe(join(root, "config", "config.json"));
  });

  it("config/DB resolver ayni native storage root'unda; acik DB path override edilebilir", () => {
    const env = { XDG_DATA_HOME: "/data/ai test", HOME: "/home/u" };
    const root = resolveRuntimeRoot(env, "linux");
    const config = resolveConfigPath(env, "linux");
    const db = resolveDbPath(root, env);
    expect(config.startsWith(root)).toBe(true);
    expect(db.startsWith(root)).toBe(true);
    // AITEST_DB_PATH verildiginde explicit native path kazanir
    expect(resolveDbPath(root, { AITEST_DB_PATH: "/explicit/native/state.db" })).toBe("/explicit/native/state.db");
  });

  it("cozumlenemeyen runtime env fail-closed (sessiz bos path yok)", () => {
    expect(() => resolveRuntimeRoot({}, "linux")).toThrow();
    expect(() => resolveRuntimeRoot({}, "darwin")).toThrow();
    expect(() => resolveOpenCodeConfigPath({}, "win32")).toThrow();
  });
});
