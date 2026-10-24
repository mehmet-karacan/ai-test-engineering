/** Exact, secret-free inference backend selection. No executable/model fallback. */
import { createHash } from "node:crypto";
import { fstatSync, openSync, closeSync, readFileSync, statSync } from "node:fs";
import { extname, isAbsolute, resolve } from "node:path";
import { z } from "zod";
import type { AppConfig, WorkerProfile } from "../configuration/config-schema.js";
import { AppError } from "../domain/errors.js";
import { parseExactModelSpec } from "./opencode/profile-reader.js";

const ExactNameSchema = z.string().min(1).max(256).refine(value => !/\s/.test(value), "Kimlik bosluk iceremez");
const AbsolutePathSchema = z.string().min(1).max(32767).refine(value =>
  !value.includes("\0") && isAbsolute(value) && (process.platform !== "win32" || /^(?:[a-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+[\\/])/i.test(value)),
"Tam mutlak dosya yolu gerekli");
const ExecutableSchema = AbsolutePathSchema.refine(value => process.platform !== "win32" || extname(value).toLowerCase() === ".exe", "Windows native exe gerekli");
export const CliEnvReferenceNameSchema = z.string().min(1).max(128).regex(/^[A-Za-z_][A-Za-z0-9_]*$/);

export const WorkerBackendSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("opencode") }).strict(),
  z.object({
    kind: z.literal("cli_json"),
    command: z.array(z.string().max(32767).refine(value => !value.includes("\0"))).min(1).max(128)
      .refine(command => ExecutableSchema.safeParse(command[0]).success, "Ilk komut mutlak native executable olmali"),
  }).strict(),
  z.object({ kind: z.literal("codex_cli"), executable: ExecutableSchema, auth_home: AbsolutePathSchema.optional() }).strict(),
]);
export type WorkerBackend = z.infer<typeof WorkerBackendSchema>;

function normalizedPath(path: string): string {
  const absolute = resolve(path);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

export const WorkerBindingSchema = z.object({
  profile_name: ExactNameSchema,
  provider_id: ExactNameSchema,
  model_id: ExactNameSchema,
  backend: WorkerBackendSchema,
  secret_reference_names: z.array(z.string().min(1).max(128)).max(16).optional(),
  command_inputs: z.array(z.object({ path: AbsolutePathSchema, sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).min(1).max(128).optional(),
}).strict().superRefine((binding, context) => {
  const paths = (binding.command_inputs ?? []).map(input => normalizedPath(input.path));
  if (new Set(paths).size !== paths.length) {
    context.addIssue({ code: "custom", path: ["command_inputs"], message: "Ayni normalized command input tekrarlanamaz" });
  }
  if (binding.backend.kind === "opencode") return;
  for (const [index, name] of (binding.secret_reference_names ?? []).entries()) {
    if (!CliEnvReferenceNameSchema.safeParse(name).success) {
      context.addIssue({ code: "custom", path: ["secret_reference_names", index], message: "CLI secret referansi normal ortam degiskeni adi olmali" });
    }
  }
  const executable = binding.backend.kind === "codex_cli" ? binding.backend.executable : binding.backend.command[0];
  if (executable === undefined || !paths.includes(normalizedPath(executable))) {
    context.addIssue({ code: "custom", path: ["command_inputs"], message: "CLI executable icin frozen SHA256 kaydi gerekli" });
  }
});
export type WorkerBinding = z.infer<typeof WorkerBindingSchema>;

function invalid(message: string): never {
  throw new AppError("INVALID_PARAMETERS", message);
}

function hashRegularFile(path: string): string {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, "r");
    const before = fstatSync(descriptor);
    if (!before.isFile()) return invalid("CLI executable/input normal dosya olmali");
    const digest = createHash("sha256").update(readFileSync(descriptor)).digest("hex");
    const after = fstatSync(descriptor);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
      return invalid("CLI executable/input hash sirasinda degisti");
    }
    return digest;
  } catch (error) {
    if (error instanceof AppError) throw error;
    return invalid("CLI executable/input okunamadi; fallback uygulanmaz");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function bind(profile: WorkerProfile): WorkerBinding {
  const backend = WorkerBackendSchema.parse(profile.backend ?? { kind: "opencode" });
  const binding = {
    profile_name: profile.profile_name, provider_id: profile.provider_id, model_id: profile.model_id, backend,
    ...(profile.secret_reference_names.length === 0 ? {} : { secret_reference_names: profile.secret_reference_names }),
  };
  if (backend.kind === "opencode") return WorkerBindingSchema.parse(binding);
  const command = backend.kind === "cli_json" ? backend.command : [backend.executable];
  const paths = [command[0]!];
  for (const argument of command.slice(1)) {
    if (!isAbsolute(argument) || paths.some(path => normalizedPath(path) === normalizedPath(argument))) continue;
    try {
      if (statSync(argument).isFile()) paths.push(argument);
    } catch (error) {
      // An absent absolute output path is not a command input. Other read errors fail closed.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") invalid("CLI arguman dosyasi okunamadi");
    }
  }
  return WorkerBindingSchema.parse({ ...binding, command_inputs: paths.map(path => ({ path, sha256: hashRegularFile(path) })) });
}

/** Undefined deliberately preserves the historical OpenCode config/digest path. */
export function resolveWorkerBinding(config: Pick<AppConfig, "worker_profiles" | "default_worker_profile">, input: {
  worker_profile?: string;
  model_profile?: string;
}): WorkerBinding | undefined {
  const cliEnabled = config.worker_profiles.some(profile => profile.backend !== undefined && profile.backend.kind !== "opencode");
  if (input.worker_profile === undefined && !cliEnabled) return undefined;
  const model = input.model_profile === undefined ? undefined : parseExactModelSpec(input.model_profile);
  if (model && (!ExactNameSchema.safeParse(model.provider_id).success || !ExactNameSchema.safeParse(model.model_id).success)) {
    return invalid("Gecersiz provider/model kimligi; duzeltme uygulanmaz");
  }
  if (input.worker_profile !== undefined) {
    if (!ExactNameSchema.safeParse(input.worker_profile).success) return invalid("Gecersiz worker_profile");
    const profiles = config.worker_profiles.filter(profile => profile.profile_name === input.worker_profile);
    if (profiles.length !== 1) return invalid("Worker profili bulunamadi veya birden fazla kayit var");
    const profile = profiles[0]!;
    if (model && (profile.provider_id !== model.provider_id || profile.model_id !== model.model_id)) {
      return invalid("worker_profile ile model_profile birebir eslesmiyor");
    }
    return bind(profile);
  }
  if (model) {
    const profiles = config.worker_profiles.filter(profile => profile.provider_id === model.provider_id && profile.model_id === model.model_id);
    if (profiles.length > 1) return invalid("Model icin birden fazla profil var; worker_profile gerekli (ambiguous)");
    if (profiles.length === 1) {
      const profile = profiles[0]!;
      if (config.worker_profiles.filter(candidate => candidate.profile_name === profile.profile_name).length !== 1) {
        return invalid("Secilen profil adinda birden fazla kayit var (ambiguous)");
      }
      return profile.backend !== undefined && profile.backend.kind !== "opencode" ? bind(profile) : undefined;
    }
  }
  if (config.default_worker_profile !== undefined) {
    const profiles = config.worker_profiles.filter(profile => profile.profile_name === config.default_worker_profile);
    if (profiles.length !== 1) return invalid("Varsayilan worker profili bulunamadi veya birden fazla kayit var");
    const profile = profiles[0]!;
    if (profile.backend !== undefined && profile.backend.kind !== "opencode") {
      if (model) return invalid("Model CLI varsayilaniyla eslesmiyor; fallback uygulanmaz");
      return bind(profile);
    }
  }
  return undefined;
}
