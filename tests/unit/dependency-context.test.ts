import { it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { buildDependencyContext } from "../../src/workers/opencode/dependency-context.js";

it("resolves wildcard DTO/enum/DAO dependencies to actual compiled public types", async () => {
  const root = mkdtempSync(join(tmpdir(), "dependency-context-"));
  try {
    const source = join(root, "src/main/java/a"); mkdirSync(source, { recursive: true });
    const classes = join(root, "classes"); mkdirSync(classes);
    writeFileSync(join(source, "Dto.java"), "package a; public class Dto { public void setAmount(java.math.BigDecimal value) {} }");
    writeFileSync(join(source, "Unit.java"), "package a; public enum Unit { AMOUNT, RATIO }");
    writeFileSync(join(source, "Dao.java"), "package a; public interface Dao { String getSql(); }");
    const bare = join(root, "src/main/java/Bare.java");
    writeFileSync(bare, "public class Bare { public int getValue() { return 1; } }");
    execFileSync("javac", ["-d", classes, bare, ...["Dto", "Unit", "Dao"].map(n => join(source, n + ".java"))], { windowsHide: true });
    const input = { projectRoot: root, sourceRoot: "src/main/java", classesRoot: classes, targetBody: "package sut;\nimport a.*;\nclass Service { Dto dto; Unit unit; Dao dao; }", targetFqn: "sut.Service" };
    let eventLoopAdvanced = false;
    setImmediate(() => { eventLoopAdvanced = true; });
    const result = await buildDependencyContext(input);
    expect(eventLoopAdvanced).toBe(true);
    expect(result.text).toContain("setAmount(java.math.BigDecimal)");
    expect(result.text).toContain("java.lang.String getSql()");
    expect(result.text).toContain("a.Unit RATIO");
    expect(result.relativePaths).toContain("src/main/java/a/Dto.java");
    expect(result.text).not.toContain("StringBuilder");
    const staticEnum = await buildDependencyContext({ ...input, targetBody: "package b;\nimport static a.Unit.AMOUNT;\nclass Service { Object unit = AMOUNT; }" });
    expect(staticEnum.text).toContain("a.Unit AMOUNT");
    const defaultPackage = await buildDependencyContext({ ...input, targetBody: "class Service { Bare value; }" });
    expect(defaultPackage.text).toContain("int getValue()");
    const tiny = await buildDependencyContext({ ...input, maxBytes: 10 });
    expect(tiny.relativePaths).toEqual([]);
    expect(tiny.omitted.length).toBeGreaterThan(0);
    const expired = await buildDependencyContext({ ...input, deadlineAt: 0 });
    expect(expired.relativePaths).toEqual([]);
    expect(expired.omitted.some(x => x.includes("time budget"))).toBe(true);
    writeFileSync(join(source, "Dto.java"), "package a; public class Dto { public void changed() {} }");
    const frozen = join(root, "frozen"); mkdirSync(join(frozen, "src/main/java/a"), { recursive: true });
    writeFileSync(join(frozen, "src/main/java/a/Dto.java"), "different baseline source");
    const mismatched = await buildDependencyContext({ ...input, baselineRoot: frozen });
    expect(mismatched.relativePaths).not.toContain("src/main/java/a/Dto.java");
    expect(mismatched.omitted.some(x => x.includes("source differs"))).toBe(true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
