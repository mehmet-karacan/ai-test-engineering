/// <reference lib="dom" />

/** Serialized as a standalone script; all executable helpers live inside this function. */
export function localUiClient() {
  type Counter = { covered: number | null; missed: number | null; percent: number | null };
  type Candidate = { fqn: string; module_path: string; line: Counter; branch: Counter; reasons: string[]; suitable: boolean };
  type Scan = { job_id: string; project_root: string; overall: { line: Counter; branch: Counter }; recommendations: Candidate[]; class_count: number; unmeasured: { source_classes: number; report_classes: number } };
  type Measurement = { fqn: string; stage: string; line: Counter; branch: Counter; created_at: number };
  type Job = { status: { lifecycle: string; phase: string; outcome: string | null; events: { sequence: number; event_type: string; phase: string | null }[] }; project_root: string; measurements: Measurement[]; measurements_truncated: boolean;
    result: { coverage_scan?: Scan; coverage_scan_failure?: { reason: string; reason_code: string | null; diagnostic?: { hint: string; error_excerpt: string[] } }; report_path?: string | null; report_url?: string | null; patch_url?: string | null; report_facts?: { run_summary: { passed: number; total: number; failed: number; skipped: number } } | null } };
  const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const input = (id: string) => el<HTMLInputElement>(id);
  const button = (id: string) => el<HTMLButtonElement>(id);
  const create = (tag: string, text?: string, cls?: string) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (cls) node.className = cls; return node; };
  let csrf = "", workerEnabled = false, active = "", scan: Scan | null = null;
  let epoch = 0, timer: ReturnType<typeof setTimeout> | undefined, historyPage = 0, historyVersion = 0;
  let scanKey = crypto.randomUUID(), startKey = crypto.randomUUID();
  const phaseNames: Record<string, string> = { discovery: "Proje inceleniyor", preflight: "Çalışma ortamı kontrol ediliyor", baseline: "Başlangıç testleri çalışıyor", analysis: "Kapsam analiz ediliyor", generation: "Testler üretiliyor", candidate: "Test adayı deneniyor", verification: "Son doğrulama yapılıyor", reporting: "Rapor hazırlanıyor", completed: "Tamamlandı", execution: "Testler çalışıyor" };
  const lifecycleNames: Record<string, string> = { QUEUED: "Sırada", RUNNING: "Çalışıyor", WAITING_INPUT: "Seçim bekliyor", COMPLETED: "Tamamlandı", FAILED: "Başarısız", BLOCKED: "Engellendi", PAUSED: "Duraklatıldı", CANCELLED: "İptal edildi", INTERRUPTED: "Kesildi" };
  const outcomeNames: Record<string, string> = { TARGET_REACHED: "Kapsam hedefine ulaşıldı", TARGET_ALREADY_MET: "Hedef başlangıçta sağlanıyordu", COVERAGE_ANALYZED: "Genel analiz tamamlandı. Test üretmek için bir sınıf seçin.", BASELINE_FAILED: "Başlangıç testleri başarısız", FINAL_VERIFICATION_FAILED: "Son doğrulama başarısız", PLATEAU: "Kapsam ilerlemesi durdu", MAX_ITERATIONS: "İterasyon sınırına ulaşıldı", NO_DISCOVERED_TESTS: "Çalıştırılan test bulunamadı" };
  const eventNames: Record<string, string> = { unit_test_skip_override_enabled: "Çalışma kopyasında unit-test atlama kapatıldı", project_coverage_requested: "Genel kapsam analizi istendi", coverage_proposals_ready: "Sınıf önerileri hazır", candidate_accepted: "Test adayı kabul edildi", test_start_requested: "Test üretimi istendi", baseline_completed: "Başlangıç testleri tamamlandı", final_replay_started: "Son test doğrulaması başladı", report_published: "Rapor yayımlandı" };
  const notice = (message = "") => { el("notice").textContent = message; };
  const percent = (c: Counter) => c.covered === null || c.missed === null ? "Veri yok" : c.percent === null ? c.covered + c.missed === 0 ? "Uygulanamaz" : "Veri yok" : `%${c.percent.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`;
  const counts = (c: Counter) => c.covered === null || c.missed === null ? "Veri yok" : `${c.covered} / ${c.covered + c.missed}`;
  async function api<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(path, { credentials: "same-origin", ...(body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json", "x-ui-csrf": csrf }, body: JSON.stringify(body) }) });
    const value = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(value.error ?? "İstek tamamlanamadı"); return value;
  }
  function metric(label: string, value: string, detail: string) { const node = create("div", undefined, "metric"); node.append(create("small", label), create("strong", value), create("span", detail)); return node; }
  function resetSelection() { scan = null; el("start-form").hidden = true; el("selection-empty").hidden = false; el("selection-empty").textContent = "Analiz tamamlanınca uygun sınıflar burada görünecek."; el("overall").hidden = true; el("candidates").replaceChildren(create("legend", "Test üretilecek sınıfı seçin")); }
  function showScan(value: Scan) {
    const newScan = scan?.job_id !== value.job_id; scan = value;
    el("overall").hidden = false;
    el("overall").replaceChildren(metric("Projenin genel satır kapsamı", percent(value.overall.line), counts(value.overall.line)), metric("Projenin genel dal kapsamı", percent(value.overall.branch), counts(value.overall.branch)));
    if (!newScan) return;
    const candidates = value.recommendations.filter(c => c.suitable);
    el("selection-empty").hidden = candidates.length > 0; el("start-form").hidden = candidates.length === 0;
    el("selection-empty").textContent = `Analiz tamamlandı. Eşiğin altında uygun sınıf önerisi bulunamadı. ${value.class_count} sınıf ölçüldü.`;
    el("candidates").replaceChildren(create("legend", "Test üretilecek sınıfı seçin"));
    for (const candidate of candidates) { const label = create("label", undefined, "candidate"); const radio = document.createElement("input"); radio.type = "radio"; radio.name = "candidate"; radio.value = candidate.fqn; radio.required = true;
      const text = create("span", candidate.fqn); text.append(create("small", `${candidate.module_path || "Kök modül"} · Satır ${percent(candidate.line)} · Dal ${percent(candidate.branch)}`), create("small", "Öneri: Kaynakla eşleşen somut sınıf; veri/yapılandırma/üretilmiş tür filtresinden geçti.")); label.append(radio, text); el("candidates").append(label); }
    if (value.unmeasured.source_classes || value.unmeasured.report_classes) notice(`Analizde eşleşmeyen kayıtlar var: ${value.unmeasured.source_classes} kaynak sınıfı, ${value.unmeasured.report_classes} rapor sınıfı. Genel kapsam ve öneriler için bu sınıra dikkat edin.`);
    startKey = crypto.randomUUID();
  }
  function plot(rows: Measurement[]) {
    el("chart").replaceChildren();
    const table = create("table"), head = create("tr"); for (const text of ["Ölçüm", "Satır", "Dal"]) head.append(create("th", text)); table.append(head);
    for (const row of rows) { const tr = create("tr"); tr.append(create("td", `${row.stage === "before" ? "Başlangıç" : "Doğrulama"} · ${row.fqn}`), create("td", `${percent(row.line)} (${counts(row.line)})`), create("td", `${percent(row.branch)} (${counts(row.branch)})`)); table.append(tr); }
    el("measurements").replaceChildren(table);
    if (!rows.length || new Set(rows.map(row => row.fqn)).size !== 1) { el("chart").append(create("span", rows.length ? "Birden çok hedefin ayrıntıları raporda gösterilir." : "Doğrulanmış başlangıç ve son kapsam ölçümleri hazır olduğunda burada gösterilir.")); return; }
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg"); svg.setAttribute("viewBox", "0 0 600 220"); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "Seçilen sınıfın kayıtlı satır ve dal kapsam ölçümleri");
    for (const p of [0, 25, 50, 75, 100]) { const label = document.createElementNS(ns, "text"); label.setAttribute("x", "8"); label.setAttribute("y", String(185 - p * 1.5)); label.setAttribute("fill", "#8093a3"); label.setAttribute("font-size", "10"); label.textContent = `%${p}`; svg.append(label); const grid = document.createElementNS(ns, "path"); grid.setAttribute("d", `M48 ${180-p*1.5}H580`); grid.setAttribute("stroke", "#edf1f5"); svg.append(grid); }
    for (const [kind, color] of [["line", "#182C55"], ["branch", "#D7B172"]] as const) {
      let segment: string[] = [];
      const flush = () => { if (segment.length > 1) { const line = document.createElementNS(ns, "polyline"); line.setAttribute("points", segment.join(" ")); line.setAttribute("fill", "none"); line.setAttribute("stroke", color); line.setAttribute("stroke-width", "2"); svg.append(line); } segment = []; };
      rows.forEach((row, index) => { const value = row[kind].percent; if (value === null || !Number.isFinite(value)) { flush(); return; } const x = 55 + (rows.length === 1 ? 0 : index / (rows.length - 1) * 515); const y = 180 - Math.max(0, Math.min(100, value)) * 1.5; segment.push(`${x},${y}`); const dot = document.createElementNS(ns, "circle"); dot.setAttribute("cx", String(x)); dot.setAttribute("cy", String(y)); dot.setAttribute("r", "3"); dot.setAttribute("fill", color); svg.append(dot); }); flush();
    }
    const legend = document.createElementNS(ns, "text"); legend.setAttribute("x", "55"); legend.setAttribute("y", "210"); legend.setAttribute("fill", "#71879a"); legend.setAttribute("font-size", "10"); legend.textContent = "Mavi: Satır   Altın: Dal   ·   Ölçüm sırası →"; svg.append(legend); el("chart").append(svg);
  }
  async function refreshJob(id: string, version: number) {
    try {
      const job = await api<Job>(`/api/jobs/${id}`); if (version !== epoch) return;
      el("job-empty").hidden = true; el("job-view").hidden = false; el("job-project").textContent = job.project_root; input("project").value = job.project_root;
      el("live").textContent = lifecycleNames[job.status.lifecycle] ?? job.status.lifecycle;
      el("phase").textContent = job.status.lifecycle === "RUNNING" ? phaseNames[job.status.phase] ?? job.status.phase : lifecycleNames[job.status.lifecycle] ?? job.status.lifecycle;
      el("job-id").textContent = `İş ${id}`;
      el("outcome").textContent = job.result.coverage_scan_failure ? `${job.result.coverage_scan_failure.reason}${job.result.coverage_scan_failure.reason_code ? ` (${job.result.coverage_scan_failure.reason_code})` : ""}` : job.status.outcome ? outcomeNames[job.status.outcome] ?? job.status.outcome : "Çalışma sürüyor. Sonuç henüz doğrulanmadı.";
      const diagnostic = job.result.coverage_scan_failure?.diagnostic;
      if (diagnostic) el("outcome").textContent += `\n${diagnostic.hint}\n${diagnostic.error_excerpt.join("\n")}`;
      if (job.result.coverage_scan) showScan(job.result.coverage_scan);
      const run = job.result.report_facts?.run_summary;
      el("test-summary").replaceChildren(...(run ? [metric("Son doğrulanmış test sonucu", `${run.passed}/${run.total}`, `${run.failed} başarısız/hata · ${run.skipped} atlanan`)] : []));
      plot(job.measurements); el("chart-note").textContent = job.measurements_truncated ? "Son 200 kayıt gösteriliyor; tam kapsam raporda. Genel proje ölçümü bu eğriye eklenmez." : "Başlangıç ve son ölçüm, doğrulanmış rapor hazır olunca gösterilir. Ara iterasyon yüzdeleri üretilmez; genel proje kapsamı bu eğriye eklenmez.";
      el("events").replaceChildren(...job.status.events.map(event => create("li", `${phaseNames[event.phase ?? ""] ?? event.phase ?? ""} · ${eventNames[event.event_type] ?? event.event_type}`)));
      el("result-links").replaceChildren();
      for (const [path, text] of [[job.result.report_url, "Raporu aç"], [job.result.patch_url, "Test değişikliklerini aç"]]) if (path && /^\/reports\/[0-9a-f-]{36}\//.test(path)) { const link = document.createElement("a"); link.href = path; link.textContent = text!; link.target = "_blank"; link.rel = "noopener"; el("result-links").append(link); }
      if (job.status.lifecycle === "RUNNING" || job.status.lifecycle === "QUEUED") timer = setTimeout(() => { void refreshJob(id, version); }, 2000);
      else { button("analyze").disabled = false; void history(); }
    } catch (error) { if (version === epoch) { notice(`Durum alınamadı: ${String(error)}. Yenile düğmesiyle tekrar deneyebilirsiniz.`); button("analyze").disabled = false; } }
  }
  function openJob(id: string) { active = id; epoch++; if (timer) clearTimeout(timer); resetSelection(); el("job-view").hidden = true; el("job-empty").hidden = false; el("job-empty").textContent = "Çalışma yükleniyor…"; try { localStorage.setItem("aitest.job", id); } catch { /* optional persistence */ } void refreshJob(id, epoch); }
  async function history() {
    const version = ++historyVersion, page = historyPage;
    try { const value = await api<{ jobs: { id: string; project_root: string; lifecycle: string; created_at: number }[]; has_more: boolean }>(`/api/history?offset=${page * 10}&limit=10`); if (version !== historyVersion) return;
      const wrap = create("div", undefined, "table-wrap"), table = create("table"), head = create("tr"); for (const text of ["Proje", "Durum", "Başlangıç", ""]) head.append(create("th", text)); table.append(head);
      for (const job of value.jobs) { const row = create("tr"), cell = create("td"), action = create("button", "Göster") as HTMLButtonElement; action.type = "button"; action.onclick = () => openJob(job.id); cell.append(action); row.append(create("td", job.project_root), create("td", lifecycleNames[job.lifecycle] ?? job.lifecycle), create("td", new Date(job.created_at).toLocaleString("tr-TR")), cell); table.append(row); } wrap.append(table); el("history").replaceChildren(value.jobs.length ? wrap : create("p", "Henüz kayıtlı çalışma yok.", "hint")); button("history-prev").disabled = historyPage === 0; button("history-next").disabled = !value.has_more; el("history-page").textContent = `Sayfa ${historyPage + 1}`;
    } catch (error) { if (version === historyVersion) notice(`Geçmiş alınamadı: ${String(error)}`); }
  }
  input("project").oninput = () => { epoch++; active = ""; if (timer) clearTimeout(timer); resetSelection(); scanKey = crypto.randomUUID(); button("analyze").disabled = false; try { localStorage.removeItem("aitest.job"); } catch { /* optional */ } };
  input("use-branch").onchange = () => { input("branch").disabled = !input("use-branch").checked; };
  el<HTMLFormElement>("scan-form").onsubmit = event => { event.preventDefault(); void (async () => {
    button("analyze").disabled = true; notice(); resetSelection(); const version = ++epoch; if (timer) clearTimeout(timer);
    try { const value = await api<{ job_id: string; project_root: string }>("/api/scan", { project_root: input("project").value.trim(), below_percent: Number(input("below").value), idempotency_key: scanKey }); if (version !== epoch) return; input("project").value = value.project_root; openJob(value.job_id); scanKey = crypto.randomUUID(); }
    catch (error) { if (version === epoch) { notice(String(error)); button("analyze").disabled = false; } }
  })(); };
  el<HTMLFormElement>("start-form").onsubmit = event => { event.preventDefault(); void (async () => {
    const selected = document.querySelector<HTMLInputElement>('input[name="candidate"]:checked'); if (!scan || !selected) { notice("Önerilerden bir sınıf seçin."); return; }
    button("start").disabled = true; notice(); const version = epoch;
    try { const value = await api<{ job_id: string }>("/api/start", { coverage_scan_id: scan.job_id, selector: selected.value, line_percent: Number(input("line").value), ...(input("use-branch").checked ? { branch_percent: Number(input("branch").value) } : {}), model_profile: input("model").value.trim() || undefined, idempotency_key: startKey }); if (version !== epoch) return; openJob(value.job_id); startKey = crypto.randomUUID(); }
    catch (error) { if (version === epoch) notice(String(error)); } finally { button("start").disabled = !workerEnabled; }
  })(); };
  button("refresh").onclick = () => { notice(); if (active) { epoch++; if (timer) clearTimeout(timer); void refreshJob(active, epoch); } void history(); };
  button("history-prev").onclick = () => { historyPage = Math.max(0, historyPage - 1); void history(); };
  button("history-next").onclick = () => { historyPage++; void history(); };
  void (async () => { try {
    const value = await api<{ csrf: string; projects: { project_root: string }[]; worker_enabled: boolean; model: string | null }>("/api/bootstrap"); csrf = value.csrf; workerEnabled = value.worker_enabled;
    el("projects").replaceChildren(...value.projects.map(project => { const option = document.createElement("option"); option.value = project.project_root; return option; }));
    if (value.model) input("model").value = value.model;
    el("model-hint").textContent = value.worker_enabled ? "OpenCode üzerinden yapılandırılmış model kullanılır." : "Test üretimi kapalı. Başlatırken AITEST_WORKER_ENABLED=1 ayarı gerekli; genel analiz kullanılabilir."; button("start").disabled = !value.worker_enabled;
    await history(); let saved = ""; try { saved = localStorage.getItem("aitest.job") ?? ""; } catch { /* optional */ } if (/^[0-9a-f-]{36}$/.test(saved)) openJob(saved);
  } catch (error) { notice(`Ekran hazırlanamadı: ${String(error)}`); } })();
}
