import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const allowed = new Set([
  path.join(srcRoot, 'infra/adapters/jobQueuePort.ts'),
  path.join(srcRoot, 'infra/db/repos/jobQueue.ts'),
  path.join(srcRoot, 'infra/scripts/check-no-legacy-message-retry-producers.ts'),
  path.join(srcRoot, 'infra/db/writePort.ts'),
  path.join(srcRoot, 'kernel/contracts/ports.ts'),
  path.join(srcRoot, 'kernel/contracts/schemas.ts'),
  path.join(srcRoot, 'kernel/domain/actions/index.ts'),
  path.join(srcRoot, 'kernel/domain/executor/executeAction.ts'),
  path.join(srcRoot, 'kernel/domain/executor/helpers.ts'),
  path.join(srcRoot, 'kernel/domain/executor/handlers/delivery.ts'),
]);

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(full)));
    else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.includes('.test.')) files.push(full);
  }
  return files;
}

const violations: string[] = [];
for (const file of await filesUnder(srcRoot)) {
  if (allowed.has(file)) continue;
  const source = await readFile(file, 'utf8');
  if (source.includes('enqueueMessageRetryJob(') || source.includes("'message.retry.enqueue'")) {
    violations.push(path.relative(srcRoot, file));
  }
}
if (violations.length > 0) {
  throw new Error(`legacy message_retry_jobs producer forbidden:\n${violations.join('\n')}`);
}
process.stdout.write('legacy message_retry_jobs producer gate: PASS\n');
