/**
 * Gap stratejileri ve plateau analizi.
 * Ilerleme durumu ile erisim/test edilebilirlik kaniti ayri tutulur.
 */
import type { GapAnalysis } from "../workers/opencode/model-schemas.js";

export interface GapState {
  gap_key: string;
  blocker_class: GapAnalysis["blocker_class"];
  attempted: string[];
  no_progress_iterations: number;
}

export interface PlateauDecision {
  is_plateau: boolean;
  can_continue: boolean;
  required_strategies: number;
  reason: string;
}

export class PlateauAnalyzer {
  private readonly gaps = new Map<string, GapState>();

  recordAttempt(gapKey: string, strategy: string, succeeded: boolean, blocker?: GapAnalysis["blocker_class"]): void {
    let state = this.gaps.get(gapKey);
    if (!state) {
      state = { gap_key: gapKey, blocker_class: blocker ?? "UNKNOWN", attempted: [], no_progress_iterations: 0 };
      this.gaps.set(gapKey, state);
    }
    if (!state.attempted.includes(strategy)) {
      state.attempted.push(strategy);
    }
    if (!succeeded) {
      state.no_progress_iterations++;
    } else {
      state.no_progress_iterations = 0;
    }
    if (blocker) {
      state.blocker_class = blocker;
    }
  }

  gapState(gapKey: string): GapState | undefined {
    return this.gaps.get(gapKey);
  }

  analyzePlateau(noProgressWindow: number): PlateauDecision {
    let allBlocked = true;
    let distinctStrategies = new Set<string>().size;
    const attemptedAll = new Set<string>();
    for (const [, state] of this.gaps) {
      if (state.no_progress_iterations < noProgressWindow) {
        allBlocked = false;
      }
      for (const strategy of state.attempted) {
        attemptedAll.add(strategy);
      }
    }
    distinctStrategies = attemptedAll.size;
    const isPlateau = allBlocked && this.gaps.size > 0;
    return {
      is_plateau: isPlateau,
      can_continue: distinctStrategies < 2 && isPlateau ? false : true,
      required_strategies: 2,
      reason: isPlateau
        ? distinctStrategies < 2
          ? "Plateau: tek strateji denendi; en az iki farkli uygulanabilir strateji gerekli"
          : "Plateau: iki strateji denendi ve ilerleme yok"
        : "Plateau yok: hala ilerleme var",
    };
  }

  listGaps(): GapState[] {
    return Array.from(this.gaps.values());
  }
}

export const GAP_STRATEGIES: ReadonlyArray<{ key: string; description: string; blocker: GapAnalysis["blocker_class"] }> = [
  { key: "new_scenario_inputs", description: "Yeni girdi/boundary/exception senaryolari turet", blocker: "MISSING_SCENARIO" },
  { key: "different_mocking", description: "Farkli izolasyon/fixture yaklasimi dene (mevcut framework icinde)", blocker: "MOCKING_OR_FIXTURE_GAP" },
  { key: "state_transition", description: "Durum gecisleri ve yan etkileri hedefle", blocker: "MISSING_SCENARIO" },
  { key: "collection_edges", description: "Bos/tek/cok elemanli koleksiyon senaryolari", blocker: "MISSING_SCENARIO" },
  { key: "concurrency_probe", description: "Basit concurrency/idempotency senaryolari (test-only)", blocker: "MISSING_SCENARIO" },
];

export function classifyBlocker(gap: GapAnalysis): GapAnalysis["blocker_class"] {
  return gap.blocker_class;
}
