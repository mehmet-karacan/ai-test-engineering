import { TaskAssignmentSchema, type AgentRole, type TaskAssignment } from "../../domain/agent-contracts.js";

export function renderTaskBrief(input: TaskAssignment): string[] {
  const assignment=TaskAssignmentSchema.parse(input);
  return [
    "Bu gorevi tamamlamak icin analiz, tasarim, gelistirme ve inceleme bilgisini birlikte kullanabilirsin.",
    "Asama/rol etiketi bir meslek veya yetenek siniri degildir; acik gorev, teslim ve kabul olcutleri esastir.",
    "## Gorevin amaci",assignment.objective,
    "## Beklenen teslim",...assignment.deliverables.map(value=>`- ${value}`),
    "## Kabul olcutleri",...assignment.acceptance_criteria.map(value=>`- ${value}`),"",
  ];
}

/** Explicit fallback for old persisted contracts that contain only a stage label. */
export function defaultAgentAssignment(role: AgentRole): TaskAssignment {
  const objectives:Record<AgentRole,string>={
    explorer:"Verilen kaynak ve onceki kanitlardan davranislari, bagimliliklari ve belirsizlikleri belirle.",
    test_architect:"Hedef davranis ve coverage aciklari icin uygulanabilir, kanita dayali test yaklasimini olustur.",
    test_developer:"Verilen hedef ve test-only kapsaminda anlamli test cozumunu gelistir; gerekli analiz ve son kontrolu yap.",
    reviewer:"Teslimi kaynak davranisi ve kabul olcutleriyle bagimsiz degerlendir; sorunlari kanit ve duzeltme onerisiyle bildir.",
  };
  return {objective:objectives[role],
    deliverables:["Beklenen sonuc semasinda kanitli ozet, mevcut artifact/run referanslari ve uygun sonraki adim."],
    acceptance_criteria:["Bulgular verilen kaynak/kanitla uyumlu olmali; belirsizlik veya eksik baglam acik bildirilmeli.",
      "Calistirilmamis test, coverage, degisiklik veya artifact icin basari uydurma; gerekirse BLOCKED ve somut sonraki adim don."]};
}
