#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_STATE_FILE = '/home/dev/brain/runs/bcb-dependency-health-state.json';
const DEFAULT_NOTIFY_SCRIPT = '/home/dev/brain/host-orch/ping-owner.sh';
const COMMAND_TIMEOUT_MS = 4 * 60 * 1000;
const FINDING_REPEAT_MS = 7 * 24 * 60 * 60 * 1000;
const ERROR_REPEAT_MS = 24 * 60 * 60 * 1000;

function numericParts(version) {
  const match = String(version ?? '').match(/^(\d+)\.(\d+)/u);
  return match ? { major: Number(match[1]), minor: Number(match[2]) } : null;
}

export function classifyOutdatedPackages(report) {
  const significant = [];
  for (const [name, entry] of Object.entries(report ?? {})) {
    if (!entry || typeof entry !== 'object') continue;
    const current = typeof entry.current === 'string' ? entry.current : '';
    const latest = typeof entry.latest === 'string' ? entry.latest : '';
    const currentParts = numericParts(current);
    const latestParts = numericParts(latest);
    const deprecated = entry.isDeprecated === true;
    const majorBehind =
      currentParts !== null && latestParts !== null && latestParts.major > currentParts.major;
    const preOneMinorBehind =
      currentParts !== null &&
      latestParts !== null &&
      currentParts.major === 0 &&
      latestParts.major === 0 &&
      latestParts.minor > currentParts.minor;

    if (!deprecated && !majorBehind && !preOneMinorBehind) continue;
    significant.push({
      name,
      current,
      latest,
      reason: deprecated ? 'deprecated' : preOneMinorBehind ? 'pre-1.0 minor' : 'major',
    });
  }
  return significant.sort((left, right) => left.name.localeCompare(right.name));
}

export function shouldNotify({ previous, currentKind, fingerprint, nowMs }) {
  if (!previous) return currentKind !== 'clean';
  if (currentKind === 'clean') return previous.kind !== 'clean';
  if (previous.kind !== currentKind || previous.fingerprint !== fingerprint) return true;
  const lastNotifiedMs = Date.parse(previous.lastNotifiedAt ?? '');
  if (!Number.isFinite(lastNotifiedMs)) return true;
  const repeatMs = currentKind === 'error' ? ERROR_REPEAT_MS : FINDING_REPEAT_MS;
  return nowMs - lastNotifiedMs >= repeatMs;
}

function run(command, args) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: COMMAND_TIMEOUT_MS,
    env: process.env,
  });
}

function commandFailure(result, label) {
  if (result.error) return `${label}: ${result.error.message}`;
  const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
  return `${label}: exit ${result.status ?? 'unknown'}${combined ? `\n${combined}` : ''}`;
}

function inspectRegistry() {
  const result = run(process.execPath, [path.join(repoRoot, 'scripts/registry-prod-audit.mjs')]);
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
  if (result.status === 0) return { kind: 'clean', output };
  if (output.includes('registry-prod-audit: found vulnerable dependencies')) {
    return { kind: 'vulnerable', output };
  }
  return { kind: 'error', output: commandFailure(result, 'registry audit') };
}

function inspectOutdated() {
  const result = run('pnpm', ['outdated', '-r', '--format', 'json']);
  if (result.error || (result.status !== 0 && result.status !== 1)) {
    return { kind: 'error', output: commandFailure(result, 'pnpm outdated'), significant: [] };
  }
  try {
    const report = JSON.parse(result.stdout || '{}');
    return { kind: 'ok', output: '', significant: classifyOutdatedPackages(report) };
  } catch (error) {
    return {
      kind: 'error',
      output: `pnpm outdated: invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      significant: [],
    };
  }
}

function truncate(value, length) {
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`;
}

function buildResult() {
  const registry = inspectRegistry();
  const outdated = inspectOutdated();
  const errors = [];
  if (registry.kind === 'error') errors.push(registry.output);
  if (outdated.kind === 'error') errors.push(outdated.output);

  const kind =
    errors.length > 0
      ? 'error'
      : registry.kind === 'vulnerable' || outdated.significant.length > 0
        ? 'findings'
        : 'clean';
  const fingerprintPayload = {
    kind,
    registry: registry.kind === 'vulnerable' ? registry.output : registry.kind,
    significant: outdated.significant,
    errors,
  };
  const fingerprint = createHash('sha256').update(JSON.stringify(fingerprintPayload)).digest('hex');
  return { kind, fingerprint, registry, outdated, errors };
}

function formatMessage(result) {
  if (result.kind === 'clean') return 'BCB dependencies: проверка снова чистая.';
  const lines = [
    result.kind === 'error'
      ? 'BCB dependencies: проверка завершилась технической ошибкой.'
      : 'BCB dependencies: требуется техническое внимание.',
  ];
  if (result.registry.kind === 'vulnerable') {
    lines.push('', 'Уязвимости:', truncate(result.registry.output, 1600));
  }
  if (result.outdated.significant.length > 0) {
    lines.push('', `Существенно устарели или deprecated: ${result.outdated.significant.length}`);
    for (const item of result.outdated.significant.slice(0, 30)) {
      lines.push(`• ${item.name}: ${item.current} → ${item.latest} (${item.reason})`);
    }
    if (result.outdated.significant.length > 30) {
      lines.push(`…ещё ${result.outdated.significant.length - 30}`);
    }
  }
  if (result.errors.length > 0) {
    lines.push('', 'Ошибки:', truncate(result.errors.join('\n\n'), 1400));
  }
  lines.push('', 'Команда: pnpm run dependencies:health');
  return truncate(lines.join('\n'), 3900);
}

function readState(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeState(filePath, state) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

function parseArgs(argv) {
  return {
    notify: argv.includes('--notify'),
    forceNotify: argv.includes('--force-notify'),
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const now = new Date();
  const stateFile = process.env.BCB_DEPENDENCY_HEALTH_STATE ?? DEFAULT_STATE_FILE;
  const notifyScript = process.env.BCB_NOTIFY_OWNER_SCRIPT ?? DEFAULT_NOTIFY_SCRIPT;
  const previous = options.notify ? readState(stateFile) : null;
  const result = buildResult();
  const notify =
    options.notify &&
    (options.forceNotify ||
      shouldNotify({
        previous,
        currentKind: result.kind,
        fingerprint: result.fingerprint,
        nowMs: now.getTime(),
      }));

  const message = formatMessage(result);
  console.log(message);

  let lastNotifiedAt = previous?.lastNotifiedAt ?? null;
  if (notify) {
    const delivered = run(notifyScript, [message]);
    if (delivered.status !== 0) {
      console.error(commandFailure(delivered, 'owner notification'));
      process.exitCode = 2;
      return;
    }
    console.log('dependency-health: owner notified');
    lastNotifiedAt = now.toISOString();
  }

  if (options.notify) {
    writeState(stateFile, {
      schemaVersion: 1,
      kind: result.kind,
      fingerprint: result.fingerprint,
      lastRunAt: now.toISOString(),
      lastNotifiedAt,
    });
  }
  if (result.kind !== 'clean') process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
