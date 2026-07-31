import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findSchedulerSystemdUnitViolations } from './deploySystemdSchedulerUnitGate.js';

/**
 * D30 Ш0 §2a condition 2, point 4 — pins today's `deploy/systemd/*.service` state so a second
 * scheduler unit, a dropped `Restart=on-failure`, or a dropped host pin doesn't land unnoticed.
 * Paths are resolved from THIS file, never from the working directory.
 */
const moduleDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(moduleDir, '..', '..', '..', '..', '..', '..');
const systemdDir = join(repoRoot, 'deploy', 'systemd');

function readSystemdUnitFiles(directory: string) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.service'))
    .map((entry) => ({
      name: entry.name,
      content: readFileSync(join(directory, entry.name), 'utf8'),
    }));
}

const CLEAN_PROD_UNIT = {
  name: 'bersoncarebot-scheduler-prod.service',
  content: `[Unit]
Description=BersonCareBot Scheduler (Production)
ConditionHost=adelaide

[Service]
ExecCondition=/bin/sh -c 'case " $(/usr/bin/hostname -I) " in *" 135.106.162.170 "*) exit 0;; *) exit 1;; esac'
Restart=on-failure
RestartSec=5
`,
};

describe('D30 Ш0 — deploy/systemd scheduler unit gate', () => {
  it('finds no violation in the real repository deploy/systemd files', () => {
    const files = readSystemdUnitFiles(systemdDir);
    expect(files.length, `no *.service files found under ${systemdDir}`).toBeGreaterThan(0);

    const violations = findSchedulerSystemdUnitViolations(files);
    expect(
      violations,
      `unexpected scheduler systemd unit violations:\n${violations
        .map((v) => `${v.file}: ${v.reason}`)
        .join('\n')}`,
    ).toEqual([]);
  });

  it('there is exactly one scheduler unit file in the repository today', () => {
    const files = readSystemdUnitFiles(systemdDir);
    const schedulerFiles = files.filter((file) => /scheduler/i.test(file.name));
    expect(schedulerFiles.map((file) => file.name)).toEqual([
      'bersoncarebot-scheduler-prod.service',
    ]);
  });

  // Self-tests («сломай специально»).

  it('catches a second scheduler unit silently added for the same environment', () => {
    const violations = findSchedulerSystemdUnitViolations([
      CLEAN_PROD_UNIT,
      { ...CLEAN_PROD_UNIT, name: 'bersoncarebot-scheduler-standby-prod.service' },
    ]);
    expect(violations).toContainEqual(
      expect.objectContaining({ reason: expect.stringContaining('expected exactly 1') }),
    );
  });

  it('catches a scheduler unit missing Restart=on-failure', () => {
    const broken = {
      ...CLEAN_PROD_UNIT,
      content: CLEAN_PROD_UNIT.content.replace('Restart=on-failure\n', ''),
    };
    const violations = findSchedulerSystemdUnitViolations([broken]);
    expect(violations).toContainEqual(
      expect.objectContaining({ file: broken.name, reason: expect.stringContaining('Restart=on-failure') }),
    );
  });

  it('catches a scheduler unit that dropped its host pin', () => {
    const brokenConditionHost = {
      ...CLEAN_PROD_UNIT,
      content: CLEAN_PROD_UNIT.content.replace('ConditionHost=adelaide\n', ''),
    };
    expect(findSchedulerSystemdUnitViolations([brokenConditionHost])).toContainEqual(
      expect.objectContaining({ file: brokenConditionHost.name, reason: expect.stringContaining('host pin') }),
    );

    const brokenExecCondition = {
      ...CLEAN_PROD_UNIT,
      content: CLEAN_PROD_UNIT.content.replace(/^ExecCondition=.*$/m, ''),
    };
    expect(findSchedulerSystemdUnitViolations([brokenExecCondition])).toContainEqual(
      expect.objectContaining({ file: brokenExecCondition.name, reason: expect.stringContaining('host pin') }),
    );
  });

  it('does not fire on a clean single-unit fixture', () => {
    expect(findSchedulerSystemdUnitViolations([CLEAN_PROD_UNIT])).toEqual([]);
  });

  it('ignores non-scheduler unit files entirely', () => {
    expect(
      findSchedulerSystemdUnitViolations([
        { name: 'bersoncarebot-worker-prod.service', content: 'Restart=always\n' },
      ]),
    ).toEqual([]);
  });
});
