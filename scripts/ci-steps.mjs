#!/usr/bin/env node
import { spawn } from 'node:child_process';

const cpuBudget = Math.max(1, Number.parseInt(process.env.VITEST_MAX_WORKERS ?? '2', 10) || 2);
const parallel = cpuBudget >= 4 && process.env.CI_PARALLEL !== '0';

const command = (script, workers) => ({
  script,
  env: workers === undefined ? {} : { VITEST_MAX_WORKERS: String(workers) },
});

const phases = [
  [
    [command('lint')],
    [command('typecheck')],
  ],
  [
    [command('test', Math.max(1, Math.floor(cpuBudget / 4)))],
    [command('test:webapp', Math.max(1, Math.floor(cpuBudget / 2)))],
    [
      command('test:scripts'),
      command('test:db-principal', Math.max(1, Math.floor(cpuBudget / 4))),
      command('test:db-privileges'),
      command('test:media-worker', 1),
    ],
  ],
  [[command('build')]],
  [[command('build:webapp')]],
  [[command('audit')]],
];

if (!parallel) {
  phases[0] = [phases[0].flat()];
  phases[1] = [phases[1].flat()];
}

if (process.argv.includes('--dry-run')) {
  console.log(JSON.stringify({ cpuBudget, parallel, phases }, null, 2));
  process.exit(0);
}

const running = new Set();

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    for (const child of running) child.kill(signal);
    process.exit(1);
  });
}

function runStep(step) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    console.error(`ci-steps: START ${step.script}`);
    const child = spawn('pnpm', ['run', step.script], {
      env: { ...process.env, ...step.env },
      stdio: 'inherit',
    });
    running.add(child);
    child.once('error', (error) => {
      console.error(`ci-steps: FAIL ${step.script}: ${error.message}`);
    });
    child.once('close', (code, signal) => {
      running.delete(child);
      const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
      const exitCode = code ?? 1;
      console.error(
        `ci-steps: ${exitCode === 0 ? 'PASS' : 'FAIL'} ${step.script} (${elapsedSeconds}s)`
          + (signal ? ` signal=${signal}` : ''),
      );
      resolve(exitCode);
    });
  });
}

async function runLane(lane) {
  for (const step of lane) {
    const exitCode = await runStep(step);
    if (exitCode !== 0) return exitCode;
  }
  return 0;
}

for (const [index, phase] of phases.entries()) {
  console.error(`ci-steps: PHASE ${index + 1}/${phases.length} (${phase.length} lane${phase.length === 1 ? '' : 's'})`);
  const results = await Promise.all(phase.map(runLane));
  if (results.some((exitCode) => exitCode !== 0)) process.exit(1);
}
