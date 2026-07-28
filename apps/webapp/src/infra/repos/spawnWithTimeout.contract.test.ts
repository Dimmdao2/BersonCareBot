/** @vitest-environment node */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const helperUrl = pathToFileURL(join(repoRoot, 'scripts', 'spawn-with-timeout.mjs')).href;

describe('spawn-with-timeout argv contract', () => {
  it('keeps shell syntax literal and preserves error and timeout results', async () => {
    const source = `
      const { runWithTimeout } = await import(${JSON.stringify(helperUrl)});
      const cwd = process.cwd();
      const nodeLiteral = await runWithTimeout("node", ["-e", "process.exit(0)"], {
        cwd,
        name: "node-literal",
        timeoutMs: 5000,
      });
      const pnpmLiteral = await runWithTimeout("pnpm", ["exec", "node", "-e", "process.exit(0)"], {
        cwd,
        name: "pnpm-literal",
        timeoutMs: 5000,
      });
      const literal = await runWithTimeout(
        process.execPath,
        ["-e", "process.exit(process.argv[1] === '$HOME' ? 0 : 7)", "$HOME"],
        { cwd, name: "literal-shell-argument", timeoutMs: 5000 },
      );
      const missing = await runWithTimeout("bersoncare-command-that-does-not-exist", [], {
        cwd,
        name: "missing-executable",
        timeoutMs: 5000,
      });
      const timedOut = await runWithTimeout(
        process.execPath,
        ["-e", "setInterval(() => {}, 1000)"],
        { cwd, name: "timed-out-child", timeoutMs: 100 },
      );
      process.stdout.write(JSON.stringify({ nodeLiteral, pnpmLiteral, literal, missing, timedOut }));
    `;

    const { stdout } = await execFileAsync(
      process.execPath,
      ['--input-type=module', '-e', source],
      {
        cwd: repoRoot,
        timeout: 5_000,
      },
    );

    expect(JSON.parse(stdout)).toEqual({
      nodeLiteral: null,
      pnpmLiteral: null,
      literal: null,
      missing: 'missing-executable',
      timedOut: 'timed-out-child',
    });
  });
});
