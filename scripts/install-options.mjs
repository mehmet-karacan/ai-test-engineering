/** Parse before bootstrap, filesystem changes, or client configuration access. */
export function parseInstallClient(args) {
  if (args.length === 0) return "opencode";
  if (args.length === 2 && args[0] === "--client" && ["opencode", "none"].includes(args[1])) return args[1];
  throw new Error("Gecersiz arguman: --client opencode|none bekleniyor");
}
