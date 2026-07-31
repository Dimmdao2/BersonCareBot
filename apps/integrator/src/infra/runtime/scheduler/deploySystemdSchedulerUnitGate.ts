/**
 * D30 Ш0 §2a condition 2, point 4: mechanical proof that exactly one scheduler systemd unit exists
 * per environment, that it restarts on failure (the leader-election retry from
 * `runtime/scheduler/main.ts`), and that its host pin is still in place — so a second unit or a
 * dropped pin doesn't slip in silently. Same technique as the ladder-constants gate
 * (`apps/webapp/src/modules/org-entitlements/ladderConstants.ts`): parse real repo files, not
 * their text content pinned verbatim.
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

function environmentOf(fileName: string): string {
  const match = fileName.match(ENVIRONMENT_SUFFIX_RE);
  return match?.[1] ? match[1].toLowerCase() : 'unknown';
}

function hasHostPin(content: string): boolean {
  const hasConditionHost = /^ConditionHost=\S+/m.test(content);
  const hasExecConditionHostnameCheck = /^ExecCondition=.*hostname/m.test(content);
  return hasConditionHost && hasExecConditionHostnameCheck;
}

function hasRestartOnFailure(content: string): boolean {
  return /^Restart=on-failure\s*$/m.test(content);
}

/** Scans only `*.service` files whose name mentions "scheduler"; every other unit is ignored. */
export function findSchedulerSystemdUnitViolations(
  files: SchedulerSystemdUnitFile[],
): SchedulerSystemdUnitViolation[] {
  const schedulerFiles = files.filter((file) => SCHEDULER_UNIT_NAME_RE.test(file.name));
  const violations: SchedulerSystemdUnitViolation[] = [];

  const namesByEnvironment = new Map<string, string[]>();
  for (const file of schedulerFiles) {
    const environment = environmentOf(file.name);
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
    if (!hasRestartOnFailure(file.content)) {
      violations.push({ file: file.name, reason: 'missing "Restart=on-failure"' });
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
