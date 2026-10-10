/**
 * Immutable JobContract (FIN01/K02/9.1): is baslamadan sabitlenen execution contract.
 * Sonradan gelen input original contract'i sessizce DEGISTIREMEZ; farkliysa CONTRACT_CONFLICT.
 * Model kimligi birebir korunur; tire/ek-refix duzeltmesi yoktur (6.1).
 */
import { createHash } from "node:crypto";

export interface ContractTarget {
  selector: string;
  kind: "class" | "package" | "module";
  resolved_fqn: string | null;
  line_target_bps: number;
  branch_target_bps: number;
}

export interface JobContractInput {
  job_id: string;
  project_id: string;
  location_id: string;
  canonical_root: string;
  request_digest: string;
  idempotency_key: string | null;
  source_snapshot_digest: string | null;
  resolved_targets: ContractTarget[];
  runner_kind: "docker" | "host_dev_only";
  model_profile: { provider_id: string; model_id: string } | null;
  policy_digest: string | null;
  config_digest: string;
  config_schema_version: number;
  budget: {
    max_candidate_iterations: number;
    max_repairs_per_candidate: number;
    no_progress_window: number;
    total_job_minutes: number;
  };
  parent_contract_digest: string | null;
  revision: number;
}

export interface JobContract extends JobContractInput {
  schema_version: 1;
  scope: "TEST_ONLY";
  created_at: number;
}

/** Contract referansi: DB'ye yazilabilen kisa ozet */
export interface JobContractRef {
  digest: string;
  revision: number;
}

export class ContractConflictError extends Error {
  readonly code = "CONTRACT_CONFLICT";
  readonly fields: string[];

  constructor(fields: string[]) {
    super(`Immutable contract cakismasi; degisen alanlar: ${fields.join(", ")}`);
    this.name = "ContractConflictError";
    this.fields = fields;
  }
}

const IMMUTABLE_FIELDS: Array<keyof JobContract> = [
  "job_id",
  "project_id",
  "location_id",
  "canonical_root",
  "request_digest",
  "idempotency_key",
  "source_snapshot_digest",
  "resolved_targets",
  "runner_kind",
  "model_profile",
  "policy_digest",
  "config_digest",
  "config_schema_version",
  "budget",
  "scope",
];

export function buildJobContract(input: JobContractInput, createdAt?: number): JobContract {
  if (input.resolved_targets.length === 0) {
    throw new Error("JobContract en az bir cozulmus hedef gerektirir");
  }
  for (const target of input.resolved_targets) {
    if (target.line_target_bps < 0 || target.line_target_bps > 10000) {
      throw new Error(`Gecersiz line_target_bps: ${target.line_target_bps}`);
    }
    if (target.branch_target_bps < 0 || target.branch_target_bps > 10000) {
      throw new Error(`Gecersiz branch_target_bps: ${target.branch_target_bps}`);
    }
  }
  return {
    schema_version: 1,
    scope: "TEST_ONLY",
    created_at: createdAt ?? Date.now(),
    ...input,
  };
}

/** Contract'tan DB referansi uretir */
export function contractRef(contract: JobContract): JobContractRef {
  return { digest: contractDigest(contract), revision: contract.revision };
}

/**
 * 9.1: Sonradan gelen input original contract'i sessizce degistiremez.
 * Degisen immutable alan varsa ContractConflictError; revision/lineage bilincli revizyonla acilir.
 */
export function assertContractImmutable(existing: JobContract, incoming: JobContract): void {
  const changed: string[] = [];
  for (const field of IMMUTABLE_FIELDS) {
    const before = JSON.stringify(existing[field]);
    const after = JSON.stringify(incoming[field]);
    if (before !== after) {
      changed.push(field);
    }
  }
  if (changed.length > 0) {
    throw new ContractConflictError(changed);
  }
}

export function contractDigest(contract: JobContract): string {
  const { created_at: _created, revision: _rev, ...stable } = contract;
  void _created;
  void _rev;
  return sha256Hex(JSON.stringify(stable));
}

export function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/**
 * 6.1: Full provider/model kimligi birebir korunur. Tire/bosluk/on-ekleri sezgisel duzeltme YOK;
 * bos/yanlis format reddedilir. Desteklenmeyen modele sessiz fallback yapilmaz.
 */
export function assertExactModelIdentity(providerId: string, modelId: string): void {
  if (providerId.length === 0 || modelId.length === 0) {
    throw new Error(`Model kimligi bos olamaz: provider='${providerId}' model='${modelId}'`);
  }
  if (providerId !== providerId.trim() || modelId !== modelId.trim()) {
    throw new Error(`Model kimligi bosluk iceriyor (birebir korunur, duzeltme yok): provider='${providerId}' model='${modelId}'`);
  }
  if (providerId.includes(" ") || modelId.includes(" ")) {
    throw new Error(`Model kimligi gecersiz karakter iceriyor: provider='${providerId}' model='${modelId}'`);
  }
}
