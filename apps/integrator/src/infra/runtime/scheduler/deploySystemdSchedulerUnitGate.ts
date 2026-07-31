/**
 * D30 Ш0 §2a condition 2, point 4: mechanical proof that exactly one scheduler systemd unit exists
 * per environment, that it restarts on failure with the pinned delay (the leader-election retry
 * from `runtime/scheduler/main.ts`), and that its host pin is still in place — so a second unit or
 * a dropped pin doesn't slip in silently. Same technique as the ladder-constants gate
 * (`apps/webapp/src/modules/org-entitlements/ladderConstants.ts`): parse real repo files, not
 * their text content pinned verbatim.
 *
 * systemd resolves a repeated directive by keeping only the LAST occurrence, not the first — so
 * checking that a directive is merely *present* in the file (audit D30_STEP0_AUDIT.md finding 3)
 * goes green even when a later line overrides it. Every directive check below reads the last
 * match, matching systemd's own precedence rule.
 */

export type SchedulerSystemdUnitFile = {
  name: string;
  content: string;
};

export type SchedulerSystemdUnitViolation = {
  file: string;
  reason: string;
};

const SCHEDULER_UNIT_NAME_RE = /scheduler/i;
const ENVIRONMENT_SUFFIX_RE = /-([a-z0-9]+)\.service$/i;
/** D30_STEP0_AUDIT.md finding 4: an unrecognized suffix is a violation, not a new environment. */
const KNOWN_ENVIRONMENTS = ['prod', 'test'] as const;

function lastDirectiveValue(content: string, key: string): string | null {
  const directiveRe = new RegExp(`^${key}=(.*)$`, 'gm');
  let value: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = directiveRe.exec(content)) !== null) {
    value = (match[1] ?? '').trim();
  }
  return value;
}

/** Returns the known environment name, or null when the suffix isn't in `KNOWN_ENVIRONMENTS`. */
function environmentOf(fileName: string): string | null {
  const suffix = fileName.match(ENVIRONMENT_SUFFIX_RE)?.[1]?.toLowerCase();
  if (!suffix) return null;
  return (KNOWN_ENVIRONMENTS as readonly string[]).includes(suffix) ? suffix : null;
}

function hasHostPin(content: string): boolean {
  const hasConditionHost = /^ConditionHost=\S+/m.test(content);
  const hasExecConditionHostnameCheck = /^ExecCondition=.*hostname/m.test(content);
  return hasConditionHost && hasExecConditionHostnameCheck;
}

/** D30_STEP0_AUDIT.md finding 5: `RestartSec=5` is part of the leader-election design (`main.ts`), not a default. */
const PINNED_RESTART_SEC = '5';

/** Scans only `*.service` files whose name mentions "scheduler"; every other unit is ignored. */
export function findSchedulerSystemdUnitViolations(
  files: SchedulerSystemdUnitFile[],
): SchedulerSystemdUnitViolation[] {
  const schedulerFiles = files.filter((file) => SCHEDULER_UNIT_NAME_RE.test(file.name));
  const violations: SchedulerSystemdUnitViolation[] = [];

  const namesByEnvironment = new Map<string, string[]>();
  for (const file of schedulerFiles) {
    const environment = environmentOf(file.name);
    if (environment === null) {
      violations.push({
        file: file.name,
        reason: `unit file name's environment suffix is not one of the known environments (${KNOWN_ENVIRONMENTS.join(', ')})`,
      });
      continue;
    }
    const names = namesByEnvironment.get(environment) ?? [];
    names.push(file.name);
    namesByEnvironment.set(environment, names);
  }
  for (const [environment, names] of namesByEnvironment) {
    if (names.length > 1) {
      violations.push({
        file: names.join(', '),
        reason: `${names.length} scheduler units declared for environment "${environment}", expected exactly 1`,
      });
    }
  }

  for (const file of schedulerFiles) {
    const restartValue = lastDirectiveValue(file.content, 'Restart');
    if (restartValue !== 'on-failure') {
      violations.push({
        file: file.name,
        reason: `last "Restart=" directive must be "on-failure", found ${restartValue === null ? 'none' : JSON.stringify(restartValue)}`,
      });
    }
    const restartSecValue = lastDirectiveValue(file.content, 'RestartSec');
    if (restartSecValue !== PINNED_RESTART_SEC) {
      violations.push({
        file: file.name,
        reason: `last "RestartSec=" directive must be "${PINNED_RESTART_SEC}", found ${restartSecValue === null ? 'none' : JSON.stringify(restartSecValue)}`,
      });
    }
    if (!hasHostPin(file.content)) {
      violations.push({
        file: file.name,
        reason: 'missing host pin (ConditionHost=... plus an ExecCondition hostname check)',
      });
    }
  }

  return violations;
}
