import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
const [mode, probe] = process.argv.slice(2);
let input = '';
for await (const chunk of process.stdin) input += chunk;
const envelope = JSON.parse(input);
if (probe) writeFileSync(probe, JSON.stringify({ argv: process.argv, env: process.env, cwd: process.cwd(), envelope }));
if (mode === 'hang' || mode === 'tree') {
  if (mode === 'tree') {
    const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
    if (probe) writeFileSync(probe + '.pid', String(child.pid));
  }
  setInterval(() => {}, 1000);
} else if (mode === 'nonzero') { process.stderr.write('PRIVATE-SECRET'); process.exitCode = 9; }
else if (mode === 'malformed') process.stdout.write('{"schema_version":');
else if (mode === 'oversize') process.stdout.write('x'.repeat(100000));
else if (mode === 'stderr-oversize') { process.stderr.write('x'.repeat(100000)); process.stdout.write('{}'); }
else if (mode === 'empty') process.stdout.write(' ');
else process.stdout.write(JSON.stringify({ schema_version: 1, changes: [{ path: 'src/test/java/DemoTest.java', action: 'create', new_content: envelope.prompt, scenario_ids: [] }] }));
