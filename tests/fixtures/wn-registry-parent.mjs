import { join } from "node:path";
import { Storage } from "../../dist/storage/storage.js";
import { LeaseManager } from "../../dist/orchestration/lease-manager.js";
import { NativeProcessRegistry } from "../../dist/orchestration/native-process-registry.js";
import { WindowsProcessSupervisor } from "../../dist/runners/windows-process-supervisor.js";

const [root, jobId] = process.argv.slice(2);
const storage = new Storage({ dbPath: join(root, "state.db") });
const lease = new LeaseManager(storage.db).acquire(jobId, "hardkill-owner", 300000).lease;
const registry = new NativeProcessRegistry(storage.db, jobId, "hardkill-owner", lease.fencing_token);
await new WindowsProcessSupervisor().run({
  executable: join(root, "mvn.cmd"), cwd: root, argv: [], timeoutMs: 30000,
  env: { SystemRoot: process.env.SystemRoot, Path: process.env.Path },
}, undefined, registry);
storage.close();
