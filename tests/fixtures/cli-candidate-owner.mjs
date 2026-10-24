import { pathToFileURL } from 'node:url';
const [modulePath, root, fixture, probe] = process.argv.slice(2);
const { CliCandidateClient } = await import(pathToFileURL(modulePath).href);
const client = new CliCandidateClient({ backend: { kind: 'cli_json', command: [process.execPath, fixture, 'tree', probe] }, workRoot: root });
const session = await client.createSession();
await client.generate({ ...session, prompt: 'fixture', model: { providerID: 'fixture', modelID: 'fixture' }, timeout_ms: 25000, max_output_bytes: 4096 });
