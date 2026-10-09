package com.aitest.support;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JavaMetadataScannerTest {

    @Test
    void scansClassAndMethods() throws Exception {
        Path dir = Files.createTempDirectory("aitest-support-");
        Path javaFile = dir.resolve("Demo.java");
        Files.writeString(javaFile, String.join("\n",
                "package p;",
                "public class Demo {",
                "  public int calc(int x) { return x * 2; }",
                "  private String hide() { return \"x\"; }",
                "}",
                ""));

        JavaMetadataScanner.ScanResult result = JavaMetadataScanner.scanFile(javaFile, dir);

        assertEquals(1, result.symbols().size());
        assertEquals("p.Demo", result.symbols().get(0).fullyQualifiedName());
        assertEquals("class", result.symbols().get(0).kind());
        assertEquals(2, result.methods().size());
        assertTrue(result.methods().stream().anyMatch(m -> m.name().equals("calc") && m.visibility().equals("public")));
        assertTrue(result.methods().stream().anyMatch(m -> m.name().equals("hide") && m.visibility().equals("private")));
    }

    @Test
    void scansNestedClass() throws Exception {
        Path dir = Files.createTempDirectory("aitest-support-");
        Path javaFile = dir.resolve("Outer.java");
        Files.writeString(javaFile, String.join("\n",
                "package p;",
                "public class Outer {",
                "  public static class Inner { }",
                "}",
                ""));

        JavaMetadataScanner.ScanResult result = JavaMetadataScanner.scanFile(javaFile, dir);

        assertEquals(2, result.symbols().size());
        assertTrue(result.symbols().stream().anyMatch(s -> s.fullyQualifiedName().equals("p.Outer.Inner")));
    }

    @Test
    void brokenFileReportsUnresolved() throws Exception {
        Path dir = Files.createTempDirectory("aitest-support-");
        Path javaFile = dir.resolve("Broken.java");
        Files.writeString(javaFile, "public class Broken { bocvur kod !!!");

        JavaMetadataScanner.ScanResult result = JavaMetadataScanner.scanFile(javaFile, dir);

        assertEquals(1, result.unresolved().size());
        assertTrue(result.unresolved().get(0).startsWith("PARSE_HATASI"));
    }
}
