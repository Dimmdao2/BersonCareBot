import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findLadderConstantViolations } from './ladderConstants';

/**
 * §5a item 2.6 — механическая проверка: в коде нет длительностей и конечных состояний, выбранных
 * агентом. Paths are resolved from THIS file, never from the working directory, so the test does
 * not depend on where it was launched.
 */
const moduleDir = dirname(fileURLToPath(import.meta.url));
const webappSrc = join(moduleDir, '..', '..');

/** Where ladder policy actually lives: the module, its guards and the tariff constructor. */
const SCANNED_DIRECTORIES = [
  join(webappSrc, 'modules', 'org-entitlements'),
  join(webappSrc, 'app-layer', 'guards'),
  join(webappSrc, 'app', 'app', 'admin', 'commercial'),
];

function productSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => /\.tsx?$/.test(name) && !name.includes('.test.'))
    .map((name) => join(directory, name));
}

describe('§5a item 2.6 — no agent-chosen ladder constants in code', () => {
  it('finds no hardcoded duration or terminal state in the ladder sources', () => {
    const offenders = SCANNED_DIRECTORIES.flatMap(productSources).flatMap((path) =>
      findLadderConstantViolations(path, readFileSync(path, 'utf8')).map(
        (violation) =>
          `${relative(webappSrc, path)}:${violation.line} — ${violation.field} (${violation.kind}): ${violation.text}`,
      ),
    );

    expect(offenders, `агентские константы лестницы:\n${offenders.join('\n')}`).toEqual([]);
  });

  // Self-test («сломай специально — убедись, что заметил»). Without these, a green run above
  // could mean the analyzer stopped looking rather than that the code is clean.
  it('catches a duration the agent chose', () => {
    expect(
      findLadderConstantViolations('fixture.ts', 'const policy = { graceDays: 14 };'),
    ).toEqual([expect.objectContaining({ field: 'graceDays', kind: 'literal' })]);
  });

  it('catches a terminal state the agent chose', () => {
    expect(
      findLadderConstantViolations('fixture.ts', "const policy = { terminalState: 'disabled' };"),
    ).toEqual([expect.objectContaining({ field: 'terminalState', kind: 'literal' })]);
  });

  it('catches a substitution for a value the owner did not configure', () => {
    expect(
      findLadderConstantViolations('fixture.ts', 'const seats = tariff.includedSeats ?? 1;'),
    ).toEqual([expect.objectContaining({ field: 'includedSeats', kind: 'fallback' })]);
    expect(
      findLadderConstantViolations('fixture.ts', "const days = policy['graceDays'] || 3;"),
    ).toEqual([expect.objectContaining({ field: 'graceDays', kind: 'fallback' })]);
  });

  it('catches a negative notification offset written in code', () => {
    expect(
      findLadderConstantViolations('fixture.ts', 'const row = { offsetDays: -3 };'),
    ).toEqual([expect.objectContaining({ field: 'offsetDays', kind: 'literal' })]);
  });

  // The gate's boundary, pinned so it is not widened or narrowed by accident: an empty form field
  // and a select's "nothing chosen yet" sentinel are the ABSENCE of a value, not a value the agent
  // picked. Widening this to every string literal made the constructor unfixable-by-design.
  it('does not fire on unfilled constructor form state', () => {
    expect(
      findLadderConstantViolations(
        'fixture.tsx',
        `const draft = { graceDays: '', readOnlyDays: '', terminalState: null };
         const selected = draft.terminalState ?? 'unset';`,
      ),
    ).toEqual([]);
  });

  // The analyzer must not fire on reading the owner's values — otherwise the gate would be
  // impossible to satisfy and would be deleted rather than obeyed.
  it('does not fire on code that reads the values instead of choosing them', () => {
    expect(
      findLadderConstantViolations(
        'fixture.ts',
        `const days = policy.graceDays;
         const state = policy.terminalState;
         const seats = tariff.includedSeats ?? null;
         const rows = policy.notifications.filter((rule) => rule.offsetDays <= 0);`,
      ),
    ).toEqual([]);
  });

  // §5a item 2.6 gate hole, reproduced from the owner's break: giving a literal a name made the
  // gate go silent, because it only looked at the property's own initializer. These four self-tests
  // pin the identifier-resolution branches that closed it — each is worded to catch exactly the
  // form the owner demonstrated, and each must go red if its own resolution branch is removed.

  it('catches a duration given a name instead of a literal', () => {
    const violations = findLadderConstantViolations(
      'fixture.ts',
      `const GRACE_DAYS = 14;
       const agentPolicy = { graceDays: GRACE_DAYS };`,
    );
    expect(violations).toEqual([expect.objectContaining({ field: 'graceDays', kind: 'literal' })]);
    expect(violations[0].text).toContain('GRACE_DAYS');
  });

  it('catches a terminal state given a name instead of a literal', () => {
    const violations = findLadderConstantViolations(
      'fixture.ts',
      `const TERMINAL = 'disabled';
       const agentPolicy = { terminalState: TERMINAL };`,
    );
    expect(violations).toEqual([
      expect.objectContaining({ field: 'terminalState', kind: 'literal' }),
    ]);
    expect(violations[0].text).toContain('TERMINAL');
  });

  it('catches a fallback substituting a named constant instead of a literal', () => {
    const violations = findLadderConstantViolations(
      'fixture.ts',
      `const GRACE_DAYS = 14;
       const days = policy.graceDays ?? GRACE_DAYS;`,
    );
    expect(violations).toEqual([expect.objectContaining({ field: 'graceDays', kind: 'fallback' })]);
    expect(violations[0].text).toContain('GRACE_DAYS');
  });

  it('catches a two-link const chain ending in a literal', () => {
    const violations = findLadderConstantViolations(
      'fixture.ts',
      `const BASE = 14;
       const GRACE_DAYS = BASE;
       const agentPolicy = { graceDays: GRACE_DAYS };`,
    );
    expect(violations).toEqual([expect.objectContaining({ field: 'graceDays', kind: 'literal' })]);
    expect(violations[0].text).toContain('GRACE_DAYS');
    expect(violations[0].text).toContain('BASE');
  });

  // Item 2.6's other half: a `const` that is never assigned to an owner's field picks nothing for
  // him — flagging the declaration itself would make the gate fire on ordinary numbers in the file
  // and get it disabled rather than obeyed.
  it('does not fire on a named constant that is never assigned to an owner field', () => {
    expect(
      findLadderConstantViolations(
        'fixture.ts',
        `const GRACE_DAYS = 14;
         const TERMINAL = 'disabled';
         function describe(): string {
           return \`grace \${GRACE_DAYS}, terminal \${TERMINAL}\`;
         }`,
      ),
    ).toEqual([]);
  });
});
