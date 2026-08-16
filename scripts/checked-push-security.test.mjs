import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');

test('renders redacted Gitleaks finding locations from SARIF', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bcb-gitleaks-sarif-'));
  const report = join(dir, 'gitleaks.sarif');
  writeFileSync(
    report,
    JSON.stringify({
      runs: [
        {
          results: [
            {
              ruleId: 'generic-api-key',
              partialFingerprints: { commitSha: '1234567890abcdef' },
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: { uri: 'src/secret.ts' },
                    region: { startLine: 17 },
                  },
                },
              ],
            },
          ],
        },
      ],
    }),
  );

  const result = spawnSync(process.execPath, ['scripts/render-gitleaks-sarif.mjs', report], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Findings: \*\*1\*\*/);
  assert.match(result.stdout, /src\/secret\.ts:17/);
  assert.doesNotMatch(result.stdout + result.stderr, /1234567890abcdef/);
  assert.match(result.stderr, /::error file=src\/secret\.ts,line=17/);
});

test('checked push exits non-zero when a discovered Actions run is red', () => {
  const bin = mkdtempSync(join(tmpdir(), 'bcb-checked-push-bin-'));
  const sha = 'a'.repeat(40);
  const git = join(bin, 'git');
  const gh = join(bin, 'gh');
  writeFileSync(
    git,
    `#!/usr/bin/env bash
case "$1:$2" in
  rev-parse:--show-toplevel) printf '%s\\n' ${JSON.stringify(root)} ;;
  rev-parse:HEAD) printf '%s\\n' ${JSON.stringify(sha)} ;;
  branch:--show-current) printf '%s\\n' audit-branch ;;
  config:*) exit 0 ;;
  remote:get-url) printf '%s\\n' https://github.com/example/repo.git ;;
  push:*) exit 0 ;;
  ls-remote:*) printf '%s\\trefs/heads/audit-branch\\n' ${JSON.stringify(sha)} ;;
  *) printf 'unexpected fake git args: %s\\n' "$*" >&2; exit 90 ;;
esac
`,
  );
  writeFileSync(
    gh,
    `#!/usr/bin/env bash
if [[ "$1:$2" == 'run:list' ]]; then
  printf '%s\\n' '[{"databaseId":7,"status":"completed","conclusion":"failure","name":"security","url":"https://example.test/run/7","workflowName":"Security","event":"push"}]'
  exit 0
fi
if [[ "$1:$2" == 'run:view' ]]; then
  printf '%s\\n' 'simulated failed log' >&2
  exit 0
fi
if [[ "$1:$2" == 'run:download' ]]; then exit 1; fi
printf 'unexpected fake gh args: %s\\n' "$*" >&2
exit 91
`,
  );
  chmodSync(git, 0o755);
  chmodSync(gh, 0o755);

  const result = spawnSync('bash', ['tools/git-push-and-wait.sh', 'origin', 'audit-branch'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      GITHUB_CHECK_TIMEOUT_SECONDS: '4',
      GITHUB_CHECK_POLL_SECONDS: '1',
      GITHUB_CHECK_DISCOVERY_GRACE_SECONDS: '1',
    },
  });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /security: failure/);
  assert.match(result.stderr, /pushed SHA has failed GitHub checks/);
});
