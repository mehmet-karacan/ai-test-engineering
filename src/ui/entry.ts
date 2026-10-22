import { createServices } from "../application/services.js";
import { resolveDbPath } from "../configuration/runtime-paths.js";
import { Storage } from "../storage/storage.js";
import { JobRepository } from "../storage/job-repository.js";
import { ArtifactStore } from "../storage/artifact-store.js";
import { createUiBackend } from "./backend.js";
import { createLocalUiServer } from "./server.js";

// Opening the screen enables its explicit Generate action, never an automatic
// model run. An explicit zero still keeps generation disabled.
process.env["AITEST_WORKER_ENABLED"] ??= "1";
const port = Number(process.env["AITEST_UI_PORT"] ?? 4317);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("AITEST_UI_PORT 0..65535 aralığında olmalı");
const services = createServices(process.env["AITEST_CONFIG"]);
const storage = new Storage({ dbPath: resolveDbPath(services.config.storage.root) }); storage.migrate();
services.storage = storage; services.jobs = new JobRepository(storage.db); services.artifacts = new ArtifactStore({ root: services.config.storage.root });
const server = createLocalUiServer(createUiBackend(services));
server.once("error", error => { process.stderr.write(`Yerel ekran başlatılamadı: ${error.message}\n`); storage.close(); process.exitCode = 1; });
server.listen(port, "127.0.0.1", () => { const address = server.address(); if (address && typeof address !== "string") process.stdout.write(`AI Unit Test Engineering: http://127.0.0.1:${address.port}\nTarayıcıda bu adresi açın. Çalışmalar sürerken bu pencereyi açık tutun.\n`); });
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => {
  // Do not close SQLite underneath an in-flight dispatcher. Existing native
  // ownership/recovery semantics handle interruption when this process exits.
  server.close(); server.closeAllConnections(); process.exit(0);
});
