import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { WindowsProcessSupervisor } from "../../dist/runners/windows-process-supervisor.js";

const output = process.argv[2];
const root = process.argv[3];
const result = await new WindowsProcessSupervisor().run({
  executable: join(root, "mvn.cmd"), cwd: root, argv: [], timeoutMs: 5000,
  env: { SystemRoot: process.env.SystemRoot, Path: process.env.Path },
});
writeFileSync(output, JSON.stringify(result));
