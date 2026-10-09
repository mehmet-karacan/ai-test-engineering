package com.aitest.support;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.EnumDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.RecordDeclaration;
import com.github.javaparser.ast.type.ClassOrInterfaceType;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * JavaParser tabanli sinif/interface/enum/record ve metot imzasi cozumleme yardimcisi.
 * Bu modul urune aittir; hedef projenin POM'una eklenmez.
 * Symbol resolution eksik classpath nedeniyle tamamlanamazsa unresolved olarak raporlanir.
 */
public final class JavaMetadataScanner {

    public record SymbolInfo(
            String kind,
            String fullyQualifiedName,
            String packageName,
            String relativePath,
            int lineStart,
            int lineEnd,
            String enclosingFqn
    ) {
    }

    public record MethodInfo(
            String ownerFqn,
            String name,
            String signature,
            int lineStart,
            String visibility
    ) {
    }

    public record ScanResult(
            List<SymbolInfo> symbols,
            List<MethodInfo> methods,
            List<String> unresolved
    ) {
    }

    private JavaMetadataScanner() {
    }

    public static ScanResult scanFile(Path javaFile, Path projectRoot) {
        List<SymbolInfo> symbols = new ArrayList<>();
        List<MethodInfo> methods = new ArrayList<>();
        List<String> unresolved = new ArrayList<>();

        CompilationUnit cu;
        try {
            cu = StaticJavaParser.parse(javaFile);
        } catch (IOException e) {
            throw new UncheckedIOException("Java dosyasi okunamadi: " + javaFile, e);
        } catch (Exception e) {
            unresolved.add("PARSE_HATASI: " + javaFile + ": " + e.getMessage());
            return new ScanResult(symbols, methods, unresolved);
        }

        String packageName = cu.getPackageDeclaration()
                .map(pd -> pd.getNameAsString())
                .orElse("");

        String relativePath = projectRoot.relativize(javaFile).toString().replace('\\', '/');

        cu.findAll(ClassOrInterfaceDeclaration.class).forEach(decl -> {
            String fqn = resolveFqn(cu, decl, packageName);
            symbols.add(new SymbolInfo(
                    decl.isInterface() ? "interface" : "class",
                    fqn,
                    packageName,
                    relativePath,
                    decl.getBegin().map(p -> p.line).orElse(1),
                    decl.getEnd().map(p -> p.line).orElse(1),
                    enclosingOf(decl, packageName)
            ));
        });

        cu.findAll(EnumDeclaration.class).forEach(decl ->
                symbols.add(new SymbolInfo(
                        "enum",
                        resolveFqn(cu, decl, packageName),
                        packageName,
                        relativePath,
                        decl.getBegin().map(p -> p.line).orElse(1),
                        decl.getEnd().map(p -> p.line).orElse(1),
                        null
                )));

        cu.findAll(RecordDeclaration.class).forEach(decl ->
                symbols.add(new SymbolInfo(
                        "record",
                        resolveFqn(cu, decl, packageName),
                        packageName,
                        relativePath,
                        decl.getBegin().map(p -> p.line).orElse(1),
                        decl.getEnd().map(p -> p.line).orElse(1),
                        null
                )));

        cu.findAll(MethodDeclaration.class).forEach(decl -> {
            ClassOrInterfaceDeclaration owner = decl.findAncestor(ClassOrInterfaceDeclaration.class).orElse(null);
            String ownerFqn = owner != null ? resolveFqn(cu, owner, packageName) : "";
            String visibility = decl.isPublic() ? "public"
                    : decl.isProtected() ? "protected"
                    : decl.isPrivate() ? "private"
                    : "package";
            methods.add(new MethodInfo(
                    ownerFqn,
                    decl.getNameAsString(),
                    decl.getDeclarationAsString(false, false, false),
                    decl.getBegin().map(p -> p.line).orElse(1),
                    visibility
            ));
        });

        return new ScanResult(symbols, methods, unresolved);
    }

    private static String resolveFqn(CompilationUnit cu, com.github.javaparser.ast.body.TypeDeclaration<?> decl, String packageName) {
        Optional<String> qualified = decl.getFullyQualifiedName();
        if (qualified.isPresent()) {
            return qualified.get();
        }
        return packageName + (packageName.isEmpty() ? "" : ".") + decl.getNameAsString();
    }

    private static String enclosingOf(ClassOrInterfaceDeclaration decl, String packageName) {
        return decl.findAncestor(ClassOrInterfaceDeclaration.class)
                .map(parent -> parent.getNameAsString())
                .map(name -> packageName + (packageName.isEmpty() ? "" : ".") + name)
                .orElse(null);
    }

    public static List<ClassOrInterfaceType> referencedTypes(Path javaFile) {
        try {
            CompilationUnit cu = StaticJavaParser.parse(javaFile);
            return cu.findAll(ClassOrInterfaceType.class);
        } catch (IOException e) {
            throw new UncheckedIOException("Java dosyasi okunamadi: " + javaFile, e);
        }
    }

    public static List<Path> collectJavaFiles(Path root) {
        try {
            if (!Files.exists(root)) {
                return List.of();
            }
            List<Path> files = new ArrayList<>();
            try (var stream = Files.walk(root)) {
                stream.filter(p -> Files.isRegularFile(p) && p.toString().endsWith(".java"))
                        .forEach(files::add);
            }
            return files;
        } catch (IOException e) {
            throw new UncheckedIOException("Dizin gezilemedi: " + root, e);
        }
    }
}
