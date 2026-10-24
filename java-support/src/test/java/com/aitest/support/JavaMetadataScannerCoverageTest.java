package com.aitest.support;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JavaMetadataScannerCoverageTest {

    @TempDir
    Path dir;

    private Path writeJava(String fileName, String... lines) throws IOException {
        Path javaFile = dir.resolve(fileName);
        Files.writeString(javaFile, String.join("\n", lines) + "\n");
        return javaFile;
    }

    @Test
    void interfaceKindRaporlanir() throws Exception {
        Path javaFile = writeJava("Repo.java",
                "package p;",
                "public interface Repo {",
                "  String name();",
                "}");

        JavaMetadataScanner.ScanResult result = JavaMetadataScanner.scanFile(javaFile, dir);

        assertEquals(1, result.symbols().size());
        JavaMetadataScanner.SymbolInfo symbol = result.symbols().get(0);
        assertEquals("interface", symbol.kind());
        assertEquals("p.Repo", symbol.fullyQualifiedName());
        assertEquals(2, symbol.lineStart());
        assertEquals(4, symbol.lineEnd());
    }

    @Test
    void enumKindRaporlanir() throws Exception {
        Path javaFile = writeJava("Role.java",
                "package p;",
                "public enum Role {",
                "  ADMIN, USER",
                "}");

        JavaMetadataScanner.ScanResult result = JavaMetadataScanner.scanFile(javaFile, dir);

        assertEquals(1, result.symbols().size());
        JavaMetadataScanner.SymbolInfo symbol = result.symbols().get(0);
        assertEquals("enum", symbol.kind());
        assertEquals("p.Role", symbol.fullyQualifiedName());
    }

    @Test
    void recordKindRaporlanir() throws Exception {
        Path javaFile = writeJava("Point.java",
                "package p;",
                "public record Point(int x, int y) {",
                "}");

        JavaMetadataScanner.ScanResult result = JavaMetadataScanner.scanFile(javaFile, dir);

        assertEquals(1, result.symbols().size());
        JavaMetadataScanner.SymbolInfo symbol = result.symbols().get(0);
        assertEquals("record", symbol.kind());
        assertEquals("p.Point", symbol.fullyQualifiedName());
    }

    @Test
    void nestedClassEnclosingFqnTasirTopLevelNull() throws Exception {
        Path javaFile = writeJava("Outer.java",
                "package p;",
                "public class Outer {",
                "  public static class Inner { }",
                "}");

        JavaMetadataScanner.ScanResult result = JavaMetadataScanner.scanFile(javaFile, dir);

        JavaMetadataScanner.SymbolInfo outer = result.symbols().stream()
                .filter(s -> s.fullyQualifiedName().equals("p.Outer"))
                .findFirst().orElseThrow();
        JavaMetadataScanner.SymbolInfo inner = result.symbols().stream()
                .filter(s -> s.fullyQualifiedName().equals("p.Outer.Inner"))
                .findFirst().orElseThrow();

        assertNull(outer.enclosingFqn());
        assertEquals("p.Outer", inner.enclosingFqn());
    }

    @Test
    void defaultPackageFqnPaketOncogsuzUretir() throws Exception {
        Path javaFile = writeJava("Rootless.java",
                "public class Rootless {",
                "}");

        JavaMetadataScanner.ScanResult result = JavaMetadataScanner.scanFile(javaFile, dir);

        assertEquals(1, result.symbols().size());
        assertEquals("Rootless", result.symbols().get(0).fullyQualifiedName());
        assertEquals("", result.symbols().get(0).packageName());
    }

    @Test
    void relativePathForwardSlashIleNormalizasyon() throws Exception {
        Path nested = dir.resolve("src/main/java/p");
        Files.createDirectories(nested);
        Path javaFile = nested.resolve("Norm.java");
        Files.writeString(javaFile, "package p;\npublic class Norm {\n}\n");

        JavaMetadataScanner.ScanResult result = JavaMetadataScanner.scanFile(javaFile, dir);

        assertEquals("src/main/java/p/Norm.java", result.symbols().get(0).relativePath());
    }

    @Test
    void protectedVePackageVisibilityAyristirilir() throws Exception {
        Path javaFile = writeJava("Vis.java",
                "package p;",
                "class Vis {",
                "  protected void guard() { }",
                "  void silent() { }",
                "}");

        JavaMetadataScanner.ScanResult result = JavaMetadataScanner.scanFile(javaFile, dir);

        assertEquals(2, result.methods().size());
        assertTrue(result.methods().stream().anyMatch(m -> m.name().equals("guard") && m.visibility().equals("protected")));
        assertTrue(result.methods().stream().anyMatch(m -> m.name().equals("silent") && m.visibility().equals("package")));
        assertEquals("p.Vis", result.methods().get(0).ownerFqn());
    }

    @Test
    void overloadMetotlarAyriKayitlardir() throws Exception {
        Path javaFile = writeJava("Calc.java",
                "package p;",
                "public class Calc {",
                "  public int add(int a, int b) { return a + b; }",
                "  public long add(long a, long b) { return a + b; }",
                "}");

        JavaMetadataScanner.ScanResult result = JavaMetadataScanner.scanFile(javaFile, dir);

        List<JavaMetadataScanner.MethodInfo> overloads = result.methods().stream()
                .filter(m -> m.name().equals("add"))
                .toList();
        assertEquals(2, overloads.size());
        assertTrue(overloads.get(0).signature().contains("int"));
        assertTrue(overloads.get(1).signature().contains("long"));
        assertTrue(overloads.get(0).lineStart() != overloads.get(1).lineStart());
    }

    @Test
    void referencedTypesCagrilanTipleriBulur() throws Exception {
        Path javaFile = writeJava("Uses.java",
                "package p;",
                "public class Uses {",
                "  private Payment payment;",
                "  public Payment pay(Invoice invoice) { return payment; }",
                "}");

        Path paymentFile = writeJava("Payment.java",
                "package p;",
                "public class Payment {",
                "}");
        Path invoiceFile = writeJava("Invoice.java",
                "package p;",
                "public class Invoice {",
                "}");

        List<?> referenced = JavaMetadataScanner.referencedTypes(javaFile);

        List<String> names = referenced.stream()
                .map(Object::toString)
                .toList();
        assertTrue(names.stream().anyMatch(n -> n.contains("Payment")));
        assertTrue(names.stream().anyMatch(n -> n.contains("Invoice")));
        assertTrue(Files.exists(paymentFile));
        assertTrue(Files.exists(invoiceFile));
    }

    @Test
    void referencedTypesOkunamayanDosyadaUncheckedIOExceptionAtar() {
        Path missing = dir.resolve("Yok.java");

        assertThrows(UncheckedIOException.class, () -> JavaMetadataScanner.referencedTypes(missing));
    }

    @Test
    void collectJavaFilesVarOlmayanRootIcinBosListeDondurur() {
        Path missing = dir.resolve("olmayan-dizin");

        List<Path> files = JavaMetadataScanner.collectJavaFiles(missing);

        assertTrue(files.isEmpty());
    }

    @Test
    void collectJavaFilesRecursifGezinirVeSadeceJavaSecer() throws Exception {
        Path nested = dir.resolve("a/b");
        Files.createDirectories(nested);
        Files.writeString(nested.resolve("One.java"), "class One {\n}\n");
        Files.writeString(nested.resolve("notes.txt"), "not java");
        Path other = dir.resolve("c");
        Files.createDirectories(other);
        Files.writeString(other.resolve("Two.java"), "class Two {\n}\n");

        List<Path> files = JavaMetadataScanner.collectJavaFiles(dir);

        assertEquals(2, files.size());
        assertTrue(files.stream().allMatch(p -> p.toString().endsWith(".java")));
        assertFalse(files.stream().anyMatch(p -> p.toString().endsWith("notes.txt")));
    }

    @Test
    void okunamayanDosyaUncheckedIOExceptionIleSarilir() {
        Path directory = dir.resolve("bir-dizin");
        assertTrue(directory.toFile().mkdirs());

        assertThrows(UncheckedIOException.class, () -> JavaMetadataScanner.scanFile(directory, dir));
    }
}
