import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  findSchedulerDecisionClosureViolations,
  findSchedulerDecisionViolations,
} from './schedulerDecisionGuard.js';

const schedulerDir = dirname(fileURLToPath(import.meta.url));
const integratorSrc = join(schedulerDir, '..', '..', '..');
const SCANNED_DIRECTORIES = [
  join(integratorSrc, 'infra', 'runtime', 'scheduler'),
  join(integratorSrc, 'infra', 'runtime', 'worker'),
];
const scheduledHandler = join(
  integratorSrc,
  'kernel',
  'domain',
  'executor',
  'handlers',
  'scheduledMaterialization.ts',
);

function productSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productSources(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.includes('.test.') ? [path] : [];
  });
}

function resolveLocalSource(fromFileName: string, specifier: string) {
  const unresolved = resolve(dirname(fromFileName), specifier.replace(/\.js$/, ''));
  const candidates = [`${unresolved}.ts`, `${unresolved}.tsx`, join(unresolved, 'index.ts')];
  const target = candidates.find(existsSync);
  if (!target || !target.startsWith(integratorSrc)) return null;
  return { fileName: target, sourceText: readFileSync(target, 'utf8') };
}

describe('D30 schedulerDecisionGuard', () => {
  it('keeps product decisions out of resident scheduler and worker sources', () => {
    const offenders = [...SCANNED_DIRECTORIES.flatMap(productSources), scheduledHandler].flatMap(
      (path) =>
        findSchedulerDecisionViolations(path, readFileSync(path, 'utf8')).map(
          (v) => `${relative(integratorSrc, path)}:${v.line} ${v.kind}: ${v.text}`,
        ),
    );
    expect(offenders, `scheduler business decisions:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('routes every scheduler script action through the scanned scheduled handler', () => {
    const scriptsPath = join(integratorSrc, 'content', 'scheduler', 'scripts.json');
    const scripts = JSON.parse(readFileSync(scriptsPath, 'utf8')) as Array<{
      steps?: Array<{ action?: unknown }>;
    }>;
    const actions = scripts.flatMap((script) => script.steps ?? []).map((step) => step.action);
    expect(actions).toEqual(['patientReminders.materializeWake']);

    const executorPath = join(integratorSrc, 'kernel', 'domain', 'executor', 'executeAction.ts');
    const executor = readFileSync(executorPath, 'utf8');
    expect(executor).toContain(
      "import { handleScheduledMaterialization } from './handlers/scheduledMaterialization.js'",
    );
    expect(executor).toContain("['patientReminders.materializeWake']");
    expect(executor).toContain('return handleScheduledMaterialization(action, ctx, fullDeps)');

    const handler = readFileSync(scheduledHandler, 'utf8');
    const localImports = [...handler.matchAll(/from\s+['"](\.[^'"]+)['"]/g)]
      .map((match) => match[1])
      .filter((value): value is string => value !== undefined);
    expect(localImports).toEqual(['../../../contracts/index.js', '../helpers.js']);
    for (const imported of localImports) {
      const target = resolve(dirname(scheduledHandler), imported.replace(/\.js$/, '.ts'));
      expect(target.startsWith(join(integratorSrc, 'kernel'))).toBe(true);
      const importedViolations = findSchedulerDecisionViolations(
        target,
        readFileSync(target, 'utf8'),
      );
      expect(
        importedViolations,
        `imported scheduler decision source: ${relative(integratorSrc, target)}`,
      ).toEqual([]);
    }
  });

  it('scans dynamic and transitive local imports for hidden decisions', () => {
    const graph = new Map([
      ['/entry.ts', "export async function wake() { return import('./bridge.js'); }"],
      ['/bridge.ts', "export { decision } from './hidden.js';"],
      ['/hidden.ts', "export const decision = { dueAt: 900000, text: 'Напоминание' };"],
    ]);
    const violations = findSchedulerDecisionClosureViolations(
      [{ fileName: '/entry.ts', sourceText: graph.get('/entry.ts') ?? '' }],
      (fromFileName, specifier) => {
        const target = resolve(dirname(fromFileName), specifier.replace(/\.js$/, '.ts'));
        const sourceText = graph.get(target);
        return sourceText === undefined ? null : { fileName: target, sourceText };
      },
    );
    expect(violations.map((violation) => violation.kind)).toEqual(
      expect.arrayContaining(['scheduled_literal', 'russian_message']),
    );
  });

  it('keeps the real scheduled-handler import closure free of product decisions', () => {
    expect(
      findSchedulerDecisionClosureViolations(
        [{ fileName: scheduledHandler, sourceText: readFileSync(scheduledHandler, 'utf8') }],
        resolveLocalSource,
      ),
    ).toEqual([]);
  });

  it.each([
    [
      'scheduled_literal',
      'const offsetMinutes = 15; const job = { offsetMs: offsetMinutes * 60 * 1000 };',
    ],
    ['scheduled_literal', 'let offsetMs = 900000; ({ offsetMs: offsetMs });'],
    ['scheduled_literal', 'const offsetMs = 900000; const job = { offsetMs };'],
    ['scheduled_literal', 'const offsetMs = 900000; const job = {}; job.offsetMs = offsetMs;'],
    ['scheduled_literal', "const key = 'offsetMs'; const job = {}; job[key] = 900000;"],
    ['russian_message', "const job = { text: 'Напомина' + 'ние: приём' };"],
    ['business_branch', "if (rule.reminderKind === 'visit') send();"],
    ['business_branch', "if (['visit', 'followup'].includes(rule.reminderKind)) send();"],
    // Deliberate violation fixture: this string IS the thing schedulerDecisionGuard must reject,
    // so the repo-wide ban on settings-table SQL does not apply to it.
    // eslint-disable-next-line no-restricted-syntax
    ['decision_table_read', 'const query = db.raw`select * from public.system_settings`;'],
  ] as const)('rejects %s self-test fixture', (kind, fixture) => {
    expect(findSchedulerDecisionViolations('fixture.ts', fixture)).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind })]),
    );
  });

  it('allows delivery mechanics and reads of already chosen data', () => {
    expect(
      findSchedulerDecisionViolations(
        'fixture.ts',
        `
      const retry = { maxAttempts: 6, backoffSeconds: 60 };
      const text = row.text;
      const offset = policy.offsetMinutes;
    `,
      ),
    ).toEqual([]);
  });

  it('keeps the documented imported re-export boundary explicit', () => {
    expect(
      findSchedulerDecisionViolations(
        'fixture.ts',
        `
      import { MESSAGE_TEXT } from '../shared/message.js';
      const job = { text: MESSAGE_TEXT };
    `,
      ),
    ).toEqual([]);
  });
});
