/** Private request-file transport. No prompt or provider output reaches argv/stderr. */
import { spawn } from 'node:child_process';
import { closeSync, existsSync, lstatSync, openSync, readSync, statSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function codexArguments(request, cwd) {
  return ['exec', '--json', '--ephemeral', '--sandbox', 'read-only', '--ignore-user-config', '--skip-git-repo-check', '--color', 'never',
    '--model', request.model.modelID, '--cd', cwd, '--output-schema', request.schemaFile, '--output-last-message', request.lastMessageFile,
    '--disable', 'shell_tool', '--disable', 'multi_agent', '--disable', 'apps',
    '-c', 'web_search="disabled"', '-c', 'mcp_servers={}', '-c', 'approval_policy="never"', '-'];
}
function readBounded(path, max) {
  if (!statSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error('file');
  const fd = openSync(path, 'r');
  try {
    const bytes = Buffer.alloc(max + 1); const count = readSync(fd, bytes, 0, bytes.length, 0);
    if (count > max) throw new Error('size');
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, count));
  } finally { closeSync(fd); }
}
export async function runBridge(requestPath) {
  const request = JSON.parse(readBounded(requestPath, 32 * 1024 * 1024));
  const max = request.max_output_bytes;
  if (!Number.isSafeInteger(max) || max < 1 || max > 8 * 1024 * 1024) throw new Error('budget');
  const isCodex = request.backend.kind === 'codex_cli';
  const executable = isCodex ? request.backend.executable : request.backend.command[0];
  const argv = isCodex ? codexArguments(request, process.cwd()) : request.backend.command.slice(1);
  const stdin = isCodex ? request.prompt : JSON.stringify({ schema_version: 1, prompt: request.prompt, model: request.model, json_schema: request.json_schema });
  const stdoutLimit = isCodex ? Math.min(8 * 1024 * 1024, Math.max(65536, max * 4)) : max;
  const stderrLimit = Math.min(65536, max);
  let stdoutBytes = 0; let stderrBytes = 0; let truncated = false;
  const chunks = [];
  const child = spawn(executable, argv, { shell: false, windowsHide: true, cwd: process.cwd(), env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
  const truncate = () => { truncated = true; child.kill(); };
  child.stdout.on('data', (chunk) => { stdoutBytes += chunk.length; if (stdoutBytes > stdoutLimit) truncate(); else if (!isCodex) chunks.push(chunk); });
  child.stderr.on('data', (chunk) => { stderrBytes += chunk.length; if (stderrBytes > stderrLimit) truncate(); });
  child.stdin.on('error', () => {});
  const monitor = isCodex ? setInterval(() => {
    try { if (existsSync(request.lastMessageFile) && statSync(request.lastMessageFile).size > max) truncate(); }
    catch { truncate(); }
  }, 25) : undefined;
  let spawnFailed = false;
  const exitCode = await new Promise((resolve) => {
    child.on('error', () => { spawnFailed = true; });
    child.on('close', (code) => resolve(code));
    child.stdin.end(stdin);
  });
  if (monitor) clearInterval(monitor);
  if (truncated) return { kind: 'TRUNCATED_JSON' };
  if (spawnFailed || exitCode !== 0) return { kind: 'PROVIDER_ERROR' };
  let text;
  try { text = isCodex ? readBounded(request.lastMessageFile, max) : new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); }
  catch { return { kind: 'TRUNCATED_JSON' }; }
  if (!text.trim()) return { kind: 'EMPTY_FINAL' };
  try { JSON.parse(text); } catch { return { kind: 'TRUNCATED_JSON' }; }
  writeFileSync(request.responseFile, text, { flag: 'wx', mode: 0o600 });
  return { kind: 'OK' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(JSON.stringify(await runBridge(process.argv[2]))); }
  catch { process.stdout.write(JSON.stringify({ kind: 'PROVIDER_ERROR' })); }
}
