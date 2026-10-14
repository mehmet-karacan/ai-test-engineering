import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildPlan } from "../../src/orchestration/build-plan.js";
import { assertEffectiveMavenModelReplay, resolveEffectiveMavenModel } from "../../src/discovery/effective-maven-model.js";

const temporaryRoots: string[] = [];

function fixture(): string {
  const root = mkdtempSync(join(process.env.TEMP ?? process.cwd(), "aitest-s06-effective-"));
  temporaryRoots.push(root);
  mkdirSync(join(root, "app"), { recursive: true });
  writeFileSync(join(root, "pom.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.example</groupId><artifactId>root</artifactId><version>1</version><packaging>pom</packaging>
  <modules><module>app</module></modules>
  <properties><custom.test.root>checks</custom.test.root></properties>
  <build>
    <plugins><plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-surefire-plugin</artifactId><version>3.2.5</version></plugin></plugins>
    <pluginManagement><plugins>
      <plugin><groupId>org.jacoco</groupId><artifactId>jacoco-maven-plugin</artifactId><version>0.8.12</version><executions><execution><goals><goal>prepare-agent</goal><goal>report</goal></goals></execution></executions></plugin>
    </plugins></pluginManagement>
  </build>
  <profiles><profile><id>coverage</id><activation><activeByDefault>true</activeByDefault></activation><build><testSourceDirectory>\${custom.test.root}</testSourceDirectory></build></profile></profiles>
</project>`, "utf8");
  writeFileSync(join(root, "app", "pom.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <parent><groupId>com.example</groupId><artifactId>root</artifactId><version>1</version><relativePath>../pom.xml</relativePath></parent>
  <artifactId>app</artifactId><packaging>jar</packaging>
  <dependencies><dependency><groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter</artifactId><version>5.10.2</version><scope>test</scope></dependency></dependencies>
  <build><plugins><plugin><groupId>org.jacoco</groupId><artifactId>jacoco-maven-plugin</artifactId></plugin></plugins></build>
</project>`, "utf8");
  mkdirSync(join(root, "tooling"), { recursive: true });
  writeFileSync(join(root, "tooling", "toolchains.xml"), `<toolchains><toolchain><type>jdk</type><provides><version>21</version><vendor>fixture</vendor></provides><configuration><jdkHome>C:\\jdk\\21</jdkHome></configuration></toolchain></toolchains>`, "utf8");
  writeFileSync(join(root, "settings.xml"), `<settings><servers><server><id>private</id><password>secret-must-not-be-read</password></server></servers></settings>`, "utf8");
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

describe("S06 effective Maven model", () => {
  it("parent, active profile ve pluginManagement'i concrete module planina baglar", () => {
    const root = fixture();
    const model = resolveEffectiveMavenModel(root, { active_profiles: ["coverage"], settings_path: join(root, "settings.xml"), toolchains_path: join(root, "tooling", "toolchains.xml"), toolchain_version: "21" });
    const app = model.modules.find((module) => module.module_relative_path === "app");
    expect(app).toMatchObject({
      artifact_id: "app",
      test_root: "app/checks",
      active_profiles: ["coverage"],
      jacoco_configured: true,
      surefire_configured: true,
      junit5_present: true,
      toolchain: { path: "tooling/toolchains.xml", version: "21", vendor: "fixture", jdk_home_present: true },
    });
    expect(app?.plugins.find((plugin) => plugin.artifact_id === "jacoco-maven-plugin")).toMatchObject({
      version: "0.8.12",
      executions: ["prepare-agent", "report"],
    });
    expect(JSON.stringify(model)).not.toContain("secret-must-not-be-read");
    expect(model.input_digests.map((entry) => entry.relative_path)).toEqual(["app/pom.xml", "pom.xml", "settings.xml", "tooling/toolchains.xml"]);
  });

  it("BuildPlan effective modelden custom root ve inherited JaCoCo bilgilerini kullanir", () => {
    const root = fixture();
    const plan = buildPlan(root, ["app"], { active_profiles: ["coverage"], toolchains_path: join(root, "tooling", "toolchains.xml") });
    const app = plan.modules.find((module) => module.module_relative_path === "app");
    expect(app?.test_root).toBe("app/checks");
    expect(app?.jacoco_configured).toBe(true);
    expect(plan.effective_maven_model.model_digest).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("model input degisince final replay fail-closed olur", () => {
    const root = fixture();
    const before = resolveEffectiveMavenModel(root, { active_profiles: ["coverage"] });
    writeFileSync(join(root, "app", "pom.xml"), readFileSync(join(root, "app", "pom.xml"), "utf8").replace("<artifactId>app</artifactId>", "<artifactId>app-renamed</artifactId>"), "utf8");
    const after = resolveEffectiveMavenModel(root, { active_profiles: ["coverage"] });
    expect(() => assertEffectiveMavenModelReplay(before, after)).toThrowError(/Effective Maven modeli replay/iu);
  });
});
