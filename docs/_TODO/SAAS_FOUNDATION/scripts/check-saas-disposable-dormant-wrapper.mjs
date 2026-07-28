#!/usr/bin/env node
import { sourceTextIncludes, sourceTextIndexOf } from './source-text-guard.mjs';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  deploy667: 'scripts/deploy-saas-667.sh',
  wrapper: 'docs/_TODO/SAAS_FOUNDATION/scripts/run-saas-disposable-dormant-rehearsal.mjs',
  protocol: 'docs/_TODO/SAAS_FOUNDATION/HARD_MIGRATION_PROTOCOL.md',
  packageJson: 'package.json',
};

function usage() {
  return [
    'Usage:',
    '  node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-disposable-dormant-wrapper.mjs',
    '  node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-disposable-dormant-wrapper.mjs --self-test',
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

function forbidMatches(label, text, matchers) {
  const present = matchers
    .filter(({ pattern }) => pattern.test(text))
    .map(({ description }) => description);
  if (present.length > 0) {
    fail(`${label} contains forbidden pattern(s):\n- ${present.join('\n- ')}`);
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

  requireFragments(files.wrapper, loaded.wrapper, [
    'safeDbNamePattern = /^bcb_saas_[a-z0-9_]+_(scratch|rehearsal)_[a-z0-9_]+$/',
    'fixtureRehearsalDbNamePattern = /^bcb_saas_[a-z0-9_]+_rehearsal_[a-z0-9_]+$/',
    'unsafeNameTokenPattern = /(^|[_-])(prod|production|test|testing|dev|development)([_-]|$)/',
    'forbiddenDbNames',
    '"bcb_webapp_prod"',
    '"bcb_webapp_test"',
    '"bcb_webapp_dev"',
    '"bersoncarebot"',
    'dryRun: true',
    'execute: false',
    'superuserSudoEnv = "SAAS_DISPOSABLE_SUPERUSER_SUDO_POSTGRES"',
    'deploySuperuserSudoEnv = "SUPERUSER_SUDO_POSTGRES"',
    '--superuser-sudo-postgres',
    'superuserSudoPostgres: envFlag(superuserSudoEnv)',
    'Choose only one superuser transport',
    'defaultDbName',
    'bcb_saas_dormant_rehearsal_',
    'validateDumpIfPresent',
    'pg_restore',
    '"--list"',
    '"--no-owner"',
    '"--no-acl"',
    '"--no-comments"',
    '`--role=${plan.ownerRole}`',
    'deploySaas667Path = "scripts/deploy-saas-667.sh"',
    'DATABASE_URL: plan.targetOwnerUrl',
    'PGOPTIONS: rolePgOptions(plan.ownerRole)',
    'env.SUPERUSER_URL = plan.targetSuperuserUrl',
    'env[deploySuperuserSudoEnv] = "1"',
    'plan.transport === "sudo-postgres"',
    '"sudo", ["-n", "-u", "postgres", "psql"',
    '"-n", "-u", "postgres", "pg_restore"',
    'PASSWORD ${quoteLiteral(plan.ownerPassword)}',
    'function rolePgOptions(roleName) {',
    'return `-c role=${roleName}`;',
    'plan.targetOwnerUrl.includes("options=")',
    'target owner URL to keep role handoff out of URL options',
    'explicitDeployEnv.PGOPTIONS !== "-c role=bcb_saas_dormant_rehearsal_selftest"',
    'const plusEncodedRoleToken = ["+", "role"].join("");',
    'explicitDeployEnv.DATABASE_URL.includes(plusEncodedRoleToken)',
    'API_ENV_FILE: "/nonexistent"',
    'WEBAPP_ENV_FILE: "/nonexistent"',
    'phase4RehearsalRunnerPath',
    '"--mode=db-state"',
    'assertCleanup',
    'rolbypassrls::text',
    'pg_has_role',
    'self-test expected pg_restore to fail closed without tolerateFailure',
    'self-test expected pg_restore non-zero to be fatal, not warning-only',
    'dropOnSuccess',
    '--prove-test-fixture',
    'e1WebappRuntimeConfigPath = "deploy/postgres/e1-webapp-runtime-config.sql"',
    'apply canonical E1 patient runtime capability overlay to disposable rehearsal',
    'fixtureRuntimeRole: `${options.dbName}_runtime`',
    'createFixtureRuntimeRole(plan)',
    'assertFixtureProofResourcesFresh(plan)',
    'disposable fixture DB or role name is already in use',
    'fixture proof with scratch DB name',
    'normalize disposable fixture owner before cleanup',
    'IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=${quoteLiteral(plan.appOwnerRole)}) THEN',
    'function cleanupModeAfterExecution',
    'if (created && shouldDropOnSuccess && !primaryError) return "ordinary";',
    'self-test expected failure-aware ordinary/fixture cleanup decisions',
    'self-test expected pre-app_owner fixture cleanup to remain fail-safe',
    'e1_webapp_runtime_role=${plan.fixtureRuntimeRole}',
    'app.install_signed_context',
    'self-test expected fixture capability proof to use only signed principal context',
    '--drop-on-success',
    '--replace-existing',
    '--dry-run',
    '--self-test',
    'assertThrows("conflicting dry-run/execute flags", () => parseArgs(["--dry-run", "--execute"]));',
    'sanitizedChildEnv',
    'const env = { ...process.env };',
    'return { ...env, ...extra };',
    '"DATABASE_URL"',
    '"PGDATABASE"',
    '"PGHOST"',
    '"PGOPTIONS"',
    '"SUPERUSER_URL"',
    'deploySuperuserSudoEnv',
    'process.env[superuserUrlEnv]',
    'superuserSudoEnv',
    'deploy667ChildEnv',
    'self-test expected --superuser-sudo-postgres to be explicit and preserve dry-run',
    'self-test expected deploy #667 child env to pass explicit ${deploySuperuserSudoEnv}=1',
    'self-test expected sudo deploy #667 child env not to pass SUPERUSER_URL',
    'run-saas-disposable-dormant-rehearsal self-test: OK',
  ]);

  requireOrderedFragments(`${files.wrapper} child env sanitizer`, loaded.wrapper, [
    'function sanitizedChildEnv(extra = {}) {',
    'const env = { ...process.env };',
    '"DATABASE_URL"',
    '"SUPERUSER_URL"',
    'superuserUrlEnv',
    'delete env[key];',
    'return { ...env, ...extra };',
  ]);

  requireOrderedFragments(`${files.wrapper} deploy #667 explicit env`, loaded.wrapper, [
    'function runDeploy667(plan) {',
    'const env = deploy667ChildEnv(plan);',
    'run("bash", [deploySaas667Path], {',
    'function deploy667ChildEnv(plan) {',
    'DATABASE_URL: plan.targetOwnerUrl',
    'PGOPTIONS: rolePgOptions(plan.ownerRole)',
    'if (plan.transport === "sudo-postgres") {',
    'env[deploySuperuserSudoEnv] = "1";',
    '} else {',
    'env.SUPERUSER_URL = plan.targetSuperuserUrl;',
  ]);

  requireOrderedFragments(`${files.wrapper} final dry-run gate`, loaded.wrapper, [
    'const plan = buildPlan(options);',
    'const dumpInfo = validateDumpIfPresent(options.dumpPath, { execute: options.execute });',
    'if (options.dryRun) {',
    'printDryRun(plan, dumpInfo, options);',
    '} else {',
    'runExecute(plan, options);',
  ]);

  forbidFragments(files.wrapper, loaded.wrapper, [
    'bersoncarebot_test";',
    'bcb_webapp_dev";',
    'bcb_webapp_prod";',
    'test.bersoncare.ru/api/health',
    'systemctl restart',
    'sudo systemctl',
    'crontab -l',
    'manual UPDATE',
    'manual DELETE',
    'manual INSERT',
    '+role',
    'options=-c+role',
    '-c+role',
    'options=${encodeURIComponent(`-c role=${roleName}`)}',
    'options=-c%20role',
    'targetOwnerUrl.includes("options=-c+role',
    'tolerateFailure: true',
    'pg_restore returned non-zero',
    'representative restored row counts passed',
  ]);

  requireFragments(files.protocol, loaded.protocol, [
    'DEV/disposable dormant wrapper',
    'run-saas-disposable-dormant-rehearsal.mjs',
    '--dry-run',
    '--execute',
    '--drop-on-success',
    'bcb_saas_dormant_rehearsal_',
    'scripts/deploy-saas-667.sh',
    'does not touch TEST services',
    'Full disposable execution is still owner-authorized',
    '--superuser-sudo-postgres',
    'SAAS_DISPOSABLE_SUPERUSER_SUDO_POSTGRES=1',
    'SUPERUSER_SUDO_POSTGRES=1',
    '`env -i`',
    'treat any non-zero `pg_restore` exit as a failed restore gate',
    'representative row-count assertions are',
    'must not turn a non-zero restore into a pass',
    'pnpm run check:saas-disposable-dormant-wrapper',
    'The dormant `#667` base intentionally does not grant the patient E1 capability',
  ]);

  forbidFragments(files.protocol, loaded.protocol, [
    'Known gap: DEV/disposable dormant wrapper',
    'There is still no complete repo-tracked DEV/disposable dormant wrapper',
    'Required next artifact before claiming DEV/disposable dormant rehearsal proof',
  ]);

  requireFragments(files.deploy667, loaded.deploy667, [
    'SUPERUSER_SUDO_POSTGRES="${SUPERUSER_SUDO_POSTGRES:-0}"',
    'SUPERUSER_SUDO_POSTGRES must be 0 or 1',
    'SUPERUSER_URL and SUPERUSER_SUDO_POSTGRES=1 are mutually exclusive',
    'SUPERUSER_URL is required unless SUPERUSER_SUDO_POSTGRES=1 is explicit.',
    'superuser_psql_target()',
    'sudo -n -u postgres env -i PATH="${PATH:-/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin}" psql -d "${migrator_database}" "$@"',
    'psql "${SUPERUSER_URL}" "$@"',
    'run_superuser_psql_file()',
    'run_superuser_psql "$@" < "${sql_path}"',
    'run_superuser_psql_file deploy/postgres/p0-5b-role-split-staff-patient.sql',
    'superuser cleanup failed',
    'superuser_psql_target -X -v ON_ERROR_STOP=1',
    'header "Step 4/6: normalize app schema ownership after migrations"',
    'ALTER SCHEMA app OWNER TO %I',
    'ALTER FUNCTION app.is_staff() OWNER TO %I',
    'header "Step 5/6: install protected DB principal context"',
    'CREATE EXTENSION pgcrypto WITH SCHEMA app_ext',
    'pgcrypto_app_ext_conflicting_functions',
    'ALTER EXTENSION pgcrypto SET SCHEMA app_ext',
    'pgcrypto_must_be_installed_in_app_ext',
  ]);

  forbidFragments(files.deploy667, loaded.deploy667, [
    ': "${SUPERUSER_URL:?FATAL: SUPERUSER_URL is required',
    'sudo -n -u postgres psql -d "${migrator_database}" "$@"',
  ]);
  forbidMatches(files.deploy667, loaded.deploy667, [
    {
      pattern: /superuser_psql_target[\s\S]{0,200}-f\s+deploy\/postgres\//,
      description: 'superuser_psql_target must not use psql -f for repo deploy/postgres SQL files',
    },
    {
      pattern: /sudo\b[\s\S]{0,200}\bpsql\b[\s\S]{0,200}\s-f\s+deploy\/postgres\//,
      description: 'sudo postgres psql must not use -f for repo deploy/postgres SQL files',
    },
  ]);

  const packageJson = JSON.parse(loaded.packageJson);
  const wrapperScript = packageJson.scripts?.['check:saas-disposable-dormant-wrapper'];
  if (
    wrapperScript !==
    'node --check docs/_TODO/SAAS_FOUNDATION/scripts/run-saas-disposable-dormant-rehearsal.mjs && node docs/_TODO/SAAS_FOUNDATION/scripts/run-saas-disposable-dormant-rehearsal.mjs --self-test && node --check docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-disposable-dormant-wrapper.mjs && node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-disposable-dormant-wrapper.mjs && node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-disposable-dormant-wrapper.mjs --self-test'
  ) {
    fail(
      `${files.packageJson} must wire check:saas-disposable-dormant-wrapper to syntax, wrapper self-test, checker, and checker self-test`,
    );
  }
  const hardScript = packageJson.scripts?.['check:saas-hard-migration-protocol'];
  if (!hardScript?.includes('pnpm run check:saas-disposable-dormant-wrapper')) {
    fail(
      `${files.packageJson} check:saas-hard-migration-protocol must include the disposable wrapper checker`,
    );
  }
}

function runSelfTest() {
  const wrapper = read(files.wrapper);
  const deploy667 = read(files.deploy667);
  const protocol = read(files.protocol);
  const packageJson = read(files.packageJson);
  const replaceRequired = (label, text, search, replacement) => {
    if (!sourceTextIncludes(text, search, label)) {
      fail(`self-test mutation target missing for ${label}: ${search}`);
    }
    return text.replace(search, replacement);
  };
  const finalDryRunBranch = [
    'if (options.dryRun) {',
    '    printDryRun(plan, dumpInfo, options);',
    '  } else {',
    '    runExecute(plan, options);',
    '  }',
  ].join('\n');
  const cases = [
    {
      wrapper: wrapper.replaceAll('rolbypassrls::text', 'rolbypassrls_missing'),
    },
    {
      wrapper: wrapper.replaceAll('pg_has_role', 'pgrole_missing'),
    },
    {
      wrapper: replaceRequired(
        'ordinary failed rehearsal must preserve evidence',
        wrapper,
        'if (created && shouldDropOnSuccess && !primaryError) return "ordinary";',
        'if (created && shouldDropOnSuccess) return "ordinary";',
      ),
    },
    {
      wrapper: replaceRequired(
        'fixture cleanup must tolerate missing app_owner',
        wrapper,
        'IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=${quoteLiteral(plan.appOwnerRole)}) THEN',
        'IF true THEN',
      ),
    },
    {
      wrapper: replaceRequired(
        'fixture proof must reject scratch names before writes',
        wrapper,
        'fixtureRehearsalDbNamePattern = /^bcb_saas_[a-z0-9_]+_rehearsal_[a-z0-9_]+$/',
        'fixtureRehearsalDbNamePattern = safeDbNamePattern',
      ),
    },
    {
      wrapper: replaceRequired(
        'fixture proof must use canonical E1 runtime overlay',
        wrapper,
        'const e1WebappRuntimeConfigPath = "deploy/postgres/e1-webapp-runtime-config.sql";',
        'const e1WebappRuntimeConfigPath = "deploy/postgres/ad-hoc-grant.sql";',
      ),
    },
    {
      wrapper: replaceRequired(
        'pg_restore must fail closed',
        wrapper,
        '{ label: "pg_restore disposable DB" }',
        '{ label: "pg_restore disposable DB", tolerateFailure: true }',
      ),
    },
    {
      wrapper: replaceRequired(
        'pg_restore non-zero must not be warning-only',
        wrapper,
        '  if (result.stderr) process.stderr.write(result.stderr);',
        [
          '  if (result.stderr) process.stderr.write(result.stderr);',
          '  if (result.status !== 0) console.warn("[saas-disposable] pg_restore returned non-zero; representative restored row counts passed");',
        ].join('\n'),
      ),
    },
    {
      wrapper: wrapper.replaceAll('bcb_saas_dormant_rehearsal_', 'bersoncarebot_test'),
    },
    {
      wrapper: wrapper.replaceAll('"--no-comments"', '"--comments"'),
    },
    {
      wrapper: wrapper.replaceAll(
        'DATABASE_URL: plan.targetOwnerUrl',
        'DATABASE_URL: process.env.DATABASE_URL',
      ),
    },
    {
      wrapper: replaceRequired(
        'role handoff must not use URL options',
        wrapper,
        'PGOPTIONS: rolePgOptions(plan.ownerRole)',
        'DATABASE_URL: `${plan.targetOwnerUrl}?options=-c+role%3D${plan.ownerRole}`',
      ),
    },
    {
      wrapper: replaceRequired(
        'self-test rejects plus-encoded role handoff',
        wrapper,
        'const plusEncodedRoleToken = ["+", "role"].join("");',
        'const plusEncodedRoleToken = "safe";',
      ),
    },
    {
      wrapper: replaceRequired(
        'sanitizer merges explicit DB env before deletion',
        wrapper,
        'const env = { ...process.env };',
        'const env = { ...process.env, ...extra };',
      ),
    },
    {
      wrapper: replaceRequired(
        'sanitizer drops explicit DB env',
        wrapper,
        'return { ...env, ...extra };',
        'return env;',
      ),
    },
    {
      wrapper: wrapper.replaceAll('"SUPERUSER_URL"', '"SUPERUSER_URL_MISSING"'),
    },
    {
      wrapper: wrapper.replaceAll(
        'env[deploySuperuserSudoEnv] = "1";',
        'env.SUPERUSER_URL = plan.targetSuperuserUrl;',
      ),
    },
    {
      wrapper: wrapper.replaceAll(
        'superuserSudoEnv = "SAAS_DISPOSABLE_SUPERUSER_SUDO_POSTGRES"',
        'superuserSudoEnv = "SAAS_DISPOSABLE_SUPERUSER_URL"',
      ),
    },
    {
      deploy667: deploy667.replace(
        'sudo -n -u postgres env -i PATH="${PATH:-/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin}" psql -d "${migrator_database}" "$@"',
        'sudo -n -u postgres psql -d "${migrator_database}" "$@"',
      ),
    },
    {
      deploy667: deploy667.replace(
        'sudo -n -u postgres env -i PATH="${PATH:-/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin}" psql -d "${migrator_database}" "$@"',
        'psql "${SUPERUSER_URL}" "$@"',
      ),
    },
    {
      deploy667: deploy667.replace(
        'run_superuser_psql "$@" < "${sql_path}"',
        'run_superuser_psql "$@" -f "${sql_path}"',
      ),
    },
    {
      deploy667: deploy667.replace(
        'run_superuser_psql_file deploy/postgres/p0-5b-role-split-staff-patient.sql \\\n  -X -v ON_ERROR_STOP=1',
        'superuser_psql_target -X -v ON_ERROR_STOP=1 \\\n  -f deploy/postgres/p0-5b-role-split-staff-patient.sql',
      ),
    },
    {
      deploy667: replaceRequired(
        'pgcrypto schema normalization must be repo-controlled',
        deploy667,
        'ALTER EXTENSION pgcrypto SET SCHEMA app_ext;',
        '-- missing repo-controlled pgcrypto schema normalization',
      ),
    },
    {
      deploy667: replaceRequired(
        'app.is_staff owner normalization before P2-B must stay repo-controlled',
        deploy667,
        'ALTER FUNCTION app.is_staff() OWNER TO %I',
        '-- missing app.is_staff owner normalization before P2-B',
      ),
    },
    {
      deploy667: `${deploy667}\n: "\${SUPERUSER_URL:?FATAL: SUPERUSER_URL is required}"\n`,
    },
    {
      wrapper: wrapper.replaceAll(
        'const env = deploy667ChildEnv(plan);',
        'const env = sanitizedChildEnv();',
      ),
    },
    {
      wrapper: replaceRequired('default dry-run true', wrapper, 'dryRun: true,', 'dryRun: false,'),
    },
    {
      wrapper: replaceRequired(
        'default execute false',
        wrapper,
        'execute: false,',
        'execute: true,',
      ),
    },
    {
      wrapper: replaceRequired(
        'conflict flags must be order independent',
        wrapper,
        'assertThrows("conflicting dry-run/execute flags", () => parseArgs(["--dry-run", "--execute"]));',
        '',
      ),
    },
    {
      wrapper: replaceRequired(
        'final dry-run branch bypass',
        wrapper,
        finalDryRunBranch,
        'runExecute(plan, options);',
      ),
    },
    {
      wrapper: replaceRequired(
        'final dry-run branch routed to execute',
        wrapper,
        '    printDryRun(plan, dumpInfo, options);',
        '    runExecute(plan, options);',
      ),
    },
    {
      protocol: protocol.replaceAll('does not touch TEST services', 'may touch TEST services'),
    },
    {
      protocol: `${protocol}\n\n## Known gap: DEV/disposable dormant wrapper\n`,
    },
    {
      packageJson: packageJson.replaceAll(
        'check:saas-disposable-dormant-wrapper',
        'check:saas-disposable-dormant-wrapper-broken',
      ),
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
    console.log('check-saas-disposable-dormant-wrapper self-test: OK');
  } else {
    runChecks();
    console.log('check-saas-disposable-dormant-wrapper: OK');
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-saas-disposable-dormant-wrapper: ${message}`);
  process.exit(1);
}
