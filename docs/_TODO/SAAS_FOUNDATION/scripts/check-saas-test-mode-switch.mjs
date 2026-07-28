#!/usr/bin/env node
import { sourceTextIncludes, sourceTextIndexOf } from './source-text-guard.mjs';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  script: 'deploy/host/saas-test-mode.sh',
  deployTestSaas: 'deploy/host/deploy-test-saas.sh',
  protocol: 'docs/_TODO/SAAS_FOUNDATION/HARD_MIGRATION_PROTOCOL.md',
  packageJson: 'package.json',
};

function usage() {
  return [
    'Usage:',
    '  node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-test-mode-switch.mjs',
    '  node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-test-mode-switch.mjs --self-test',
  ].join('\n');
}

function parseArgs(argv) {
  const options = { selfTest: false };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--self-test') {
      options.selfTest = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
  }
  return options;
}

function read(path) {
  return readFileSync(resolve(path), 'utf8');
}

function fail(message) {
  throw new Error(message);
}

function requireFragments(label, text, fragments) {
  const missing = fragments.filter((fragment) => !sourceTextIncludes(text, fragment, label));
  if (missing.length > 0) {
    fail(`${label} missing required fragment(s):\n- ${missing.join('\n- ')}`);
  }
}

function forbidFragments(label, text, fragments) {
  const present = fragments.filter((fragment) => sourceTextIncludes(text, fragment, label));
  if (present.length > 0) {
    fail(`${label} contains forbidden fragment(s):\n- ${present.join('\n- ')}`);
  }
}

function requireOrderedFragments(label, text, fragments) {
  let cursor = 0;
  for (const fragment of fragments) {
    const index = sourceTextIndexOf(text, fragment, label, cursor);
    if (index < 0) {
      fail(`${label} missing ordered fragment after offset ${cursor}: ${fragment}`);
    }
    cursor = index + 1;
  }
}

function load(overrides = {}) {
  return Object.fromEntries(
    Object.entries(files).map(([key, path]) => [key, overrides[key] ?? read(path)]),
  );
}

function runChecks(overrides = {}) {
  const loaded = load(overrides);

  // TEST-only paths are a hard safety property: this checker must fail if the artifact can drift to prod.
  requireFragments(files.script, loaded.script, [
    '#!/usr/bin/env bash',
    'TEST-only SaaS runtime mode preflight/switch helper',
    'API_ENV="/opt/env/bersoncarebot/api.test"',
    'WEBAPP_ENV="/opt/env/bersoncarebot/webapp.test"',
    'ENV_FILES=("$API_ENV" "$WEBAPP_ENV")',
    'TEST_DB_NAME="bersoncarebot_test"',
    'TEST_OWNER_ROLE="bersoncarebot_test"',
    'UNIT_ORDER=(api worker scheduler webapp media-worker)',
    'ACTION="dry-run"',
    '--check',
    '--mode dormant',
    '--mode locked',
    '--dry-run',
    '--apply',
    '--restart',
    'assert_test_only_paths',
    '/opt/env/bersoncarebot/*.test',
    '*prod*|*main*',
    'render_redacted_report',
    'database_url_shape=',
    'database_url_dormant_owner_topology=',
    'assert_dormant_topology',
    'DATABASE_URL is not the known dormant TEST owner topology',
    'DB_PRINCIPAL_CONTEXT_MODE=legacy-guc',
    'locked mode is not implemented by this TEST env rollback helper',
    'repo-known dual URLs/signing secret distribution',
    'future full flip wrapper',
    'cp -p -- "$file" "$backup"',
    'mktemp "${file}.tmp.XXXXXX"',
    'chmod --reference="$file" "$tmp"',
    'chown --reference="$file" "$tmp"',
    'mv -f -- "$tmp" "$file"',
    'secret values redacted',
    'would not print DATABASE_URL, signing secret, or other secret values',
    '[ -w "$file" ] || fatal',
    'restart TEST units in deploy-test order',
    'sudo systemctl restart "bersoncarebot-$unit-test"',
    '--restart requires --apply',
    'TEST units not restarted',
  ]);

  requireOrderedFragments(`${files.script} check before mode operations`, loaded.script, [
    'if [ "$CHECK" = "1" ]; then',
    'render_redacted_report',
    'exit 0',
    '[ -n "$MODE" ] ||',
    'case "$MODE" in',
  ]);

  requireOrderedFragments(`${files.script} dormant plan/apply order`, loaded.script, [
    'log "redacted current state"',
    'render_redacted_report',
    'log "dormant topology preflight"',
    'assert_dormant_topology',
    'if [ "$ACTION" = "dry-run" ]; then',
    'log "apply dormant TEST env mode"',
    'rewrite_env_file "$file"',
    'log "post-apply redacted state"',
    'render_redacted_report',
  ]);

  forbidFragments(files.script, loaded.script, [
    '/opt/env/bersoncarebot/api.prod',
    '/opt/env/bersoncarebot/webapp.prod',
    'crontab -l',
    'crontab <',
    'cat "$file"',
    'source "$file"',
    '. "$file"',
    'set -a &&',
    'DATABASE_URL_STAFF=',
    'DATABASE_URL_NONSTAFF=',
    'DB_PRINCIPAL_SIGNING_SECRET=',
    'systemctl restart "bersoncarebot-$unit-prod"',
    'bersoncarebot-$unit-prod',
  ]);

  requireFragments(files.deployTestSaas, loaded.deployTestSaas, [
    'TEST services run DB_PRINCIPAL_CONTEXT_MODE=locked after migrations',
    'assert_test_runtime_mode_ready',
    'must use DB_PRINCIPAL_CONTEXT_MODE=locked for strict TEST',
  ]);

  requireFragments(files.protocol, loaded.protocol, [
    '`deploy/host/saas-test-mode.sh` - TEST-only redacted mode check / dormant rollback helper.',
    'Integrator API startup is not a migration runner in `shadow|locked`.',
    'historical TEST-only diagnostic artifact',
    'must not be used to recover a\n   failed strict TEST deployment by switching walls off',
    'not required for a locked TEST restart',
    'bash deploy/host/saas-test-mode.sh --check',
    'bash deploy/host/saas-test-mode.sh --mode dormant --dry-run',
    'historical mode helper may still be inspected in dry-run mode',
    '`saas-test-mode.sh --mode locked` remains fail-fast',
  ]);

  const packageJson = JSON.parse(loaded.packageJson);
  const switchScript = packageJson.scripts?.['check:saas-test-mode-switch'];
  if (
    switchScript !==
    'bash -n deploy/host/saas-test-mode.sh && node --check docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-test-mode-switch.mjs && node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-test-mode-switch.mjs && node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-test-mode-switch.mjs --self-test'
  ) {
    fail(
      `${files.packageJson} must wire check:saas-test-mode-switch to bash syntax, node syntax, main check, and self-test`,
    );
  }

  const hardScript = packageJson.scripts?.['check:saas-hard-migration-protocol'];
  if (!hardScript?.includes('pnpm run check:saas-test-mode-switch')) {
    fail(
      `${files.packageJson} check:saas-hard-migration-protocol must include check:saas-test-mode-switch`,
    );
  }
}

function runSelfTest() {
  const baseScript = read(files.script);
  const cases = [
    {
      script: baseScript.replaceAll('ACTION="dry-run"', '# missing dry-run action'),
    },
    {
      script: baseScript.replaceAll('--apply', '--commit'),
    },
    {
      script: baseScript.replace(
        'API_ENV="/opt/env/bersoncarebot/api.test"',
        'API_ENV="/opt/env/bersoncarebot/api.prod"',
      ),
    },
    {
      script: baseScript.replace('cp -p -- "$file" "$backup"', 'cp -- "$file" "$backup"'),
    },
    {
      script: baseScript.replace('mv -f -- "$tmp" "$file"', 'cat "$tmp" > "$file"'),
    },
    {
      script: baseScript.replace(
        'locked mode is not implemented by this TEST env rollback helper',
        'locked mode writes env here',
      ),
    },
    {
      deployTestSaas: read(files.deployTestSaas).replace(
        'must use DB_PRINCIPAL_CONTEXT_MODE=locked for strict TEST',
        'legacy mode accepted',
      ),
    },
    {
      protocol: read(files.protocol).replace(
        'not required for a locked TEST restart',
        'locked restart requires manual env edit',
      ),
    },
    {
      packageJson: '{"scripts":{}}',
    },
  ];

  let detected = 0;
  for (const testCase of cases) {
    try {
      runChecks(testCase);
    } catch {
      detected += 1;
    }
  }

  if (detected !== cases.length) {
    fail(`self-test detected ${detected}/${cases.length} broken cases`);
  }
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) {
    runSelfTest();
    console.log('check-saas-test-mode-switch self-test: OK');
  } else {
    runChecks();
    console.log('check-saas-test-mode-switch: OK');
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-saas-test-mode-switch: ${message}`);
  process.exit(1);
}
