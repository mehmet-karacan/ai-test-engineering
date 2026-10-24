import type { ApplyOperationView } from "../domain/apply-contracts.js";

const escape = (value: unknown) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function applicationSummary(application?: ApplyOperationView): string[] {
  if (!application) return [];
  const verification = application.verification;
  return [
    `Application: ${application.state} / ${application.phase}`,
    `Operation: ${application.operation_id} / Checkpoint: ${application.checkpoint_id} / Patch SHA-256: ${application.patch_digest}`,
    `Uygulanan yollar: ${application.applied_paths.length}`,
    `Uygulama sonucu: ${application.message}`,
    ...(verification ? [
      `Apply verification: ${verification.status} / ${verification.scope}`,
      "Dogrulama, uygulanan asil projenin hash-dogrulanmis owned kopyasinda tum proje testlerini calistirir.",
      `${verification.total} test / ${verification.passed} gecti / ${verification.failures} basarisiz / ${verification.errors} hata / ${verification.skipped} atlandi`,
      `Mevcut testler korundu: ${verification.existing_tests_preserved} / Tum testler mevcut: ${verification.all_tests_present}`,
      `Exit code: ${verification.exit_code ?? "bilinmiyor"} / Neden: ${verification.reason_code ?? "yok"}`,
      `Execution root: ${verification.execution_root}`,
    ] : ["Apply verification: henuz kayitli sonuc yok"]),
  ];
}

export function applicationReport(application?: ApplyOperationView): string {
  if (!application) return "";
  return `<section class="section" id="application"><div class="section-title"><div><h2>Test uygulamasi ve tam proje dogrulamasi</h2><p>Uygulama kaniti generation sonucu ve hedef coverage olcumlerinden ayridir.</p></div></div><div class="card">${applicationSummary(application).map(line => `<p>${escape(line)}</p>`).join("")}<p><a href="report.json">Kayitli uygulama kaniti (report.json / application)</a></p></div></section>`;
}
