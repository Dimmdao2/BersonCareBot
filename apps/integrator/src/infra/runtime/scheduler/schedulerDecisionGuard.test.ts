import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findSchedulerDecisionViolations } from './schedulerDecisionGuard.js';

const schedulerDir = dirname(fileURLToPath(import.meta.url));
const integratorSrc = join(schedulerDir, '..', '..', '..');
const SCANNED_DIRECTORIES = [join(integratorSrc, 'infra', 'runtime', 'scheduler'), join(integratorSrc, 'infra', 'runtime', 'worker')];

function productSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productSources(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.includes('.test.') ? [path] : [];
  });
}

describe('D30 schedulerDecisionGuard', () => {
  it('keeps product decisions out of resident scheduler and worker sources', () => {
    const offenders = SCANNED_DIRECTORIES.flatMap(productSources).flatMap((path) =>
      findSchedulerDecisionViolations(path, readFileSync(path, 'utf8')).map((v) => `${relative(integratorSrc, path)}:${v.line} ${v.kind}: ${v.text}`),
    );
    expect(offenders, `scheduler business decisions:\n${offenders.join('\n')}`).toEqual([]);
  });

  it.each([
    ['scheduled_literal', 'const offsetMinutes = 15; const job = { offsetMs: offsetMinutes * 60 * 1000 };'],
    ['scheduled_literal', 'let offsetMs = 900000; ({ offsetMs: offsetMs });'],
    ['scheduled_literal', 'const offsetMs = 900000; const job = { offsetMs };'],
    ['scheduled_literal', 'const offsetMs = 900000; const job = {}; job.offsetMs = offsetMs;'],
    ['scheduled_literal', "const key = 'offsetMs'; const job = {}; job[key] = 900000;"],
    ['russian_message', "const job = { text: 'Напомина' + 'ние: приём' };"],
    ['business_branch', "if (rule.reminderKind === 'visit') send();"],
    ['business_branch', "if (['visit', 'followup'].includes(rule.reminderKind)) send();"],
    ['decision_table_read', "const query = db.raw`select * from public.system_settings`;"],
  ] as const)('rejects %s self-test fixture', (kind, fixture) => {
    expect(findSchedulerDecisionViolations('fixture.ts', fixture)).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind })]),
    );
  });

  it('allows delivery mechanics and reads of already chosen data', () => {
    expect(findSchedulerDecisionViolations('fixture.ts', `
      const retry = { maxAttempts: 6, backoffSeconds: 60 };
      const text = row.text;
      const offset = policy.offsetMinutes;
    `)).toEqual([]);
  });

  it('keeps the documented imported re-export boundary explicit', () => {
    expect(findSchedulerDecisionViolations('fixture.ts', `
      import { MESSAGE_TEXT } from '../shared/message.js';
      const job = { text: MESSAGE_TEXT };
    `)).toEqual([]);
  });
});
