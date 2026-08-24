import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cutoverPath = fileURLToPath(new URL('./therapysto-domain-cutover.sh', import.meta.url));
const monitorPath = fileURLToPath(
  new URL('./check-therapysto-domain-certificates.sh', import.meta.url),
);

function executable(path, body) {
  writeFileSync(path, `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`);
  chmodSync(path, 0o755);
}

function fixture(extra = []) {
  const root = mkdtempSync(join(tmpdir(), 'therapysto-domain-acceptance-'));
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const certPath = join(root, 'platform-fullchain.pem');
  const keyPath = join(root, 'platform-privkey.pem');
  const clinicCertPath = join(root, 'clinic-fullchain.pem');
  const clinicKeyPath = join(root, 'clinic-privkey.pem');
  const mapPath = join(root, 'hosts.env');
  writeFileSync(certPath, 'fixture certificate\n');
  writeFileSync(keyPath, 'fixture key\n');
  writeFileSync(clinicCertPath, 'fixture clinic certificate\n');
  writeFileSync(clinicKeyPath, 'fixture clinic key\n');
  writeFileSync(
    mapPath,
    [
      'STAFF_HOST=staff.test.example',
      'PLATFORM_ADMIN_HOST=admin.test.example',
      'PATIENT_DEFAULT_HOST=therapygo.test.example',
      'PATIENT_BRANDED_HOST=bersoncare.therapygo.test.example',
      'CLINIC_CUSTOM_HOST=app.bersoncare.test.example',
      `PLATFORM_TLS_CERTIFICATE_PATH=${certPath}`,
      `PLATFORM_TLS_CERTIFICATE_KEY_PATH=${keyPath}`,
      `CLINIC_TLS_CERTIFICATE_PATH=${clinicCertPath}`,
      `CLINIC_TLS_CERTIFICATE_KEY_PATH=${clinicKeyPath}`,
      'EXPECTED_DNS_TARGET=192.0.2.10',
      'APP_BASE_URL=https://staff.test.example',
      'PATIENT_APP_ORIGIN=https://therapygo.test.example',
      'YANDEX_OAUTH_REDIRECT_URIS=https://therapygo.test.example/api/auth/oauth/callback/yandex,https://app.bersoncare.test.example/api/auth/oauth/callback/yandex',
      'CERT_EXPIRY_WARN_DAYS=30',
      ...extra,
      '',
    ].join('\n'),
  );
  return { bin, certPath, keyPath, mapPath, root };
}

function run(path, args, runtime, env = {}) {
  return spawnSync('bash', [path, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${runtime.bin}:${process.env.PATH ?? ''}`,
      ...env,
    },
  });
}

function installSuccessfulNetworkFakes(runtime) {
  executable(join(runtime.bin, 'getent'), "printf '%s\\n' '192.0.2.10 STREAM fixture'");
  executable(join(runtime.bin, 'openssl'), 'exit 0');
}

function applyFixture() {
  const runtime = fixture();
  installSuccessfulNetworkFakes(runtime);
  const webappEnv = join(runtime.root, 'webapp.test');
  const nginxState = join(runtime.root, 'test.bersoncare.ru');
  const events = join(runtime.root, 'events');
  const restartFailed = join(runtime.root, 'restart-failed-once');
  const healthFailed = join(runtime.root, 'health-failed-once');
  writeFileSync(
    webappEnv,
    'APP_BASE_URL=https://legacy.test.example\nPATIENT_APP_ORIGIN=https://legacy-patient.test.example\nFIXTURE_ONLY=not-a-live-secret\n',
  );
  writeFileSync(nginxState, 'old test.bersoncare.ru seam\n');
  writeFileSync(events, '');
  executable(
    join(runtime.bin, 'sudo'),
    `while [[ "\${1:-}" == '-n' ]]; do shift; done
if [[ "\${1:-}" == '-u' ]]; then
  printf 'db-check\\n' >> '${events}'
  [[ "\${FAKE_DB_MATCH:-yes}" == 'yes' ]]
  exit
fi
command="\${1:-}"
shift || true
case "$command" in
  cp)
    src="\${@: -2:1}"
    dst="\${@: -1}"
    /bin/cp -p -- "$src" "$dst"
    if [[ "$dst" == '${webappEnv}' ]]; then printf 'restore-env\\n' >> '${events}'; fi
    if [[ "$dst" == '${nginxState}' ]]; then printf 'restore-nginx\\n' >> '${events}'; fi
    ;;
  install)
    src="\${@: -2:1}"
    dst="\${@: -1}"
    /bin/cp -- "$src" "$dst"
    if [[ "$dst" == '${webappEnv}' ]]; then printf 'mutate-env\\n' >> '${events}'; fi
    if [[ "$dst" == '${nginxState}' ]]; then printf 'mutate-nginx\\n' >> '${events}'; fi
    ;;
  nginx)
    count=0
    if [[ -f '${runtime.root}/nginx-count' ]]; then count=$(<'${runtime.root}/nginx-count'); fi
    count=$((count + 1))
    printf '%s' "$count" > '${runtime.root}/nginx-count'
    printf 'nginx-t:%s\\n' "$count" >> '${events}'
    [[ "\${FAKE_NGINX_FAIL_AT:-0}" != "$count" ]]
    ;;
  systemctl)
    action="\${1:-}"
    if [[ "$action" == 'restart' ]]; then
      origin=$(/usr/bin/awk -F= '$1 == "APP_BASE_URL" { print $2 }' '${webappEnv}')
      printf 'restart:%s\\n' "$origin" >> '${events}'
      if [[ "\${FAKE_RESTART_FAIL_ONCE:-0}" == '1' && ! -f '${restartFailed}' ]]; then
        : > '${restartFailed}'
        exit 1
      fi
    elif [[ "$action" == 'reload' ]]; then
      printf 'reload:%s\\n' "\${2:-}" >> '${events}'
    elif [[ "$action" == 'is-active' ]]; then
      printf 'is-active\\n' >> '${events}'
    fi
    ;;
  *)
    printf 'unexpected-sudo:%s\\n' "$command" >> '${events}'
    exit 99
    ;;
esac`,
  );
  executable(
    join(runtime.bin, 'curl'),
    `header=''
while (($#)); do
  case "$1" in
    -H) header="\${2:-}"; shift 2 ;;
    *) shift ;;
  esac
done
origin=$(/usr/bin/awk -F= '$1 == "APP_BASE_URL" { print $2 }' '${webappEnv}')
expected_host="\${origin#*://}"
printf 'health:%s\\n' "$header" >> '${events}'
[[ "$header" == "Host: $expected_host" ]] || exit 22
if [[ "\${FAKE_HEALTH_FAIL_ONCE:-0}" == '1' && ! -f '${healthFailed}' ]]; then
  : > '${healthFailed}'
  exit 22
fi
printf '%s\\n' '{"ok":true}'`,
  );
  return { ...runtime, events, nginxState, webappEnv };
}

function runApply(runtime, extraEnv = {}) {
  const digest = run(
    cutoverPath,
    ['--host-map', runtime.mapPath, '--approval-digest'],
    runtime,
  ).stdout.trim();
  return run(cutoverPath, ['--host-map', runtime.mapPath, '--apply'], runtime, {
    THERAPYSTO_CUTOVER_OWNER_APPROVED: 'yes',
    THERAPYSTO_CUTOVER_OWNER_APPROVED_MAP_SHA256: digest,
    THERAPYSTO_CUTOVER_HERMETIC_ROOT: runtime.root,
    ...extraEnv,
  });
}

test('offline render uses the declared certificate key path', () => {
  const runtime = fixture();
  const output = join(runtime.root, 'candidate.conf');
  const result = run(
    cutoverPath,
    ['--host-map', runtime.mapPath, '--offline', '--render', output],
    runtime,
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    readFileSync(output, 'utf8'),
    new RegExp(`ssl_certificate_key ${runtime.keyPath.replaceAll('/', '\\/')};`, 'u'),
    'the CLI accepted TLS_CERTIFICATE_KEY_PATH but rendered another key',
  );
});

test('fixture-looking hosts cannot bypass the split TLS certificate boundary', () => {
  const runtime = fixture();
  const sharedPairMap = readFileSync(runtime.mapPath, 'utf8')
    .replace(/^CLINIC_TLS_CERTIFICATE_PATH=.*$/mu, `CLINIC_TLS_CERTIFICATE_PATH=${runtime.certPath}`)
    .replace(
      /^CLINIC_TLS_CERTIFICATE_KEY_PATH=.*$/mu,
      `CLINIC_TLS_CERTIFICATE_KEY_PATH=${runtime.keyPath}`,
    );
  writeFileSync(runtime.mapPath, sharedPairMap);

  const result = run(cutoverPath, ['--host-map', runtime.mapPath, '--offline'], runtime);
  assert.notEqual(
    result.status,
    0,
    'a hostname suffix used by fixtures bypassed the operator contract requiring separate platform and clinic TLS pairs',
  );
});

test('preflight rejects a resolved address different from the approved DNS target', () => {
  const runtime = fixture();
  executable(join(runtime.bin, 'getent'), "printf '%s\\n' '192.0.2.99 STREAM wrong-target'");
  executable(join(runtime.bin, 'openssl'), 'exit 0');
  const result = run(cutoverPath, ['--host-map', runtime.mapPath], runtime);
  assert.notEqual(
    result.status,
    0,
    'preflight accepted hosts that resolve away from the explicitly approved target',
  );
});

test('preflight rejects a map that cannot prepare staff/patient origins and OAuth callbacks', () => {
  const runtime = fixture();
  const withoutRuntimeInputs = readFileSync(runtime.mapPath, 'utf8')
    .split('\n')
    .filter(
      (line) =>
        !line.startsWith('APP_BASE_URL=') &&
        !line.startsWith('PATIENT_APP_ORIGIN=') &&
        !line.startsWith('YANDEX_OAUTH_REDIRECT_URIS='),
    )
    .join('\n');
  writeFileSync(runtime.mapPath, withoutRuntimeInputs);
  const result = run(cutoverPath, ['--host-map', runtime.mapPath, '--offline'], runtime);
  assert.notEqual(
    result.status,
    0,
    'preflight reported readiness without the runtime origin/callback inputs consumed by the resolver and auth',
  );
});

test('apply proves DB/runtime activation and restores every partial failure using only fixtures', () => {
  const dbMismatch = applyFixture();
  const dbMismatchResult = runApply(dbMismatch, { FAKE_DB_MATCH: 'no' });
  assert.notEqual(dbMismatchResult.status, 0, 'DB callback mismatch must abort apply');
  const dbMismatchEvents = readFileSync(dbMismatch.events, 'utf8');
  assert.match(dbMismatchEvents, /^db-check$/mu);
  assert.doesNotMatch(dbMismatchEvents, /mutate-|restart:|reload:/u);
  assert.equal(readFileSync(dbMismatch.webappEnv, 'utf8').includes('legacy.test.example'), true);
  assert.equal(readFileSync(dbMismatch.nginxState, 'utf8'), 'old test.bersoncare.ru seam\n');

  const invalidInstalledNginx = applyFixture();
  const invalidInstalledResult = runApply(invalidInstalledNginx, { FAKE_NGINX_FAIL_AT: '2' });
  assert.notEqual(invalidInstalledResult.status, 0, 'installed nginx validation failure must abort');
  const invalidEvents = readFileSync(invalidInstalledNginx.events, 'utf8');
  const invalidOrder = [
    'mutate-env',
    'mutate-nginx',
    'nginx-t:2',
    'restore-env',
    'restore-nginx',
    'nginx-t:3',
  ].map((event) => invalidEvents.indexOf(event));
  assert.equal(invalidOrder.every((position) => position >= 0), true, invalidEvents);
  assert.deepEqual(invalidOrder, invalidOrder.toSorted((left, right) => left - right));
  assert.doesNotMatch(invalidEvents, /restart:/u, 'webapp restarted before installed validation');
  assert.equal(readFileSync(invalidInstalledNginx.nginxState, 'utf8'), 'old test.bersoncare.ru seam\n');
  assert.match(readFileSync(invalidInstalledNginx.webappEnv, 'utf8'), /APP_BASE_URL=https:\/\/legacy\.test\.example/u);

  for (const [faultName, fault] of [
    ['restart', { FAKE_RESTART_FAIL_ONCE: '1' }],
    ['health', { FAKE_HEALTH_FAIL_ONCE: '1' }],
  ]) {
    const failedActivation = applyFixture();
    const failedActivationResult = runApply(failedActivation, fault);
    assert.notEqual(failedActivationResult.status, 0, `${faultName} failure must abort apply`);
    const failedEvents = readFileSync(failedActivation.events, 'utf8');
    assert.match(failedEvents, /nginx-t:2[\s\S]*restart:https:\/\/staff\.test\.example/u);
    assert.match(failedEvents, /restore-env[\s\S]*restore-nginx/u);
    assert.match(failedEvents, /restart:https:\/\/legacy\.test\.example[\s\S]*health:Host: legacy\.test\.example/u);
    assert.equal(readFileSync(failedActivation.nginxState, 'utf8'), 'old test.bersoncare.ru seam\n');
    assert.match(readFileSync(failedActivation.webappEnv, 'utf8'), /APP_BASE_URL=https:\/\/legacy\.test\.example/u);
  }

  const successful = applyFixture();
  const successfulResult = runApply(successful);
  assert.equal(successfulResult.status, 0, successfulResult.stderr);
  assert.match(successfulResult.stdout, /apply OK/u);
  const successfulEvents = readFileSync(successful.events, 'utf8');
  const successOrder = [
    'db-check',
    'nginx-t:1',
    'mutate-env',
    'mutate-nginx',
    'nginx-t:2',
    'restart:https://staff.test.example',
    'health:Host: staff.test.example',
    'reload:nginx',
  ].map((event) => successfulEvents.indexOf(event));
  assert.equal(successOrder.every((position) => position >= 0), true, successfulEvents);
  assert.deepEqual(successOrder, successOrder.toSorted((left, right) => left - right));
  assert.equal(successfulEvents.match(/restart:/gu)?.length, 1, successfulEvents);
  assert.match(readFileSync(successful.webappEnv, 'utf8'), /APP_BASE_URL=https:\/\/staff\.test\.example/u);
});

test('apply without the owner gate cannot reach sudo', () => {
  const runtime = fixture();
  installSuccessfulNetworkFakes(runtime);
  const marker = join(runtime.root, 'sudo-reached');
  executable(join(runtime.bin, 'sudo'), `printf reached > '${marker}'`);
  const result = run(cutoverPath, ['--host-map', runtime.mapPath, '--apply'], runtime, {
    THERAPYSTO_CUTOVER_OWNER_APPROVED: '',
  });
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(marker), false, 'owner-gated refusal reached a privileged boundary');
});

test('offline render does not call DNS, TLS, sudo or service binaries', () => {
  const runtime = fixture();
  const marker = join(runtime.root, 'host-side-effect');
  for (const command of ['getent', 'openssl', 'sudo', 'systemctl']) {
    executable(join(runtime.bin, command), `printf '%s\\n' '${command}' >> '${marker}'; exit 99`);
  }
  const output = join(runtime.root, 'candidate.conf');
  const result = run(
    cutoverPath,
    ['--host-map', runtime.mapPath, '--offline', '--render', output],
    runtime,
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(marker), false, 'offline mode crossed a host boundary');
});

test('offline apply is rejected before reaching sudo even with a valid owner digest', () => {
  const runtime = fixture();
  const marker = join(runtime.root, 'sudo-reached');
  executable(join(runtime.bin, 'sudo'), `printf reached > '${marker}'; exit 99`);
  const digest = run(
    cutoverPath,
    ['--host-map', runtime.mapPath, '--approval-digest'],
    runtime,
  ).stdout.trim();

  const result = run(
    cutoverPath,
    ['--host-map', runtime.mapPath, '--offline', '--apply'],
    runtime,
    {
      THERAPYSTO_CUTOVER_OWNER_APPROVED: 'yes',
      THERAPYSTO_CUTOVER_OWNER_APPROVED_MAP_SHA256: digest,
    },
  );
  assert.notEqual(result.status, 0, 'offline and apply modes must be mutually exclusive');
  assert.equal(existsSync(marker), false, 'offline apply reached a privileged host boundary');
});

test('host-map validation rejects duplicate host values', () => {
  const runtime = fixture();
  const source = readFileSync(runtime.mapPath, 'utf8').replace(
    'PLATFORM_ADMIN_HOST=admin.test.example',
    'PLATFORM_ADMIN_HOST=staff.test.example',
  );
  writeFileSync(runtime.mapPath, source);
  const result = run(cutoverPath, ['--host-map', runtime.mapPath, '--offline'], runtime);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must be distinct/u);
});

test('daily monitoring fails when DNS differs from the approved target', () => {
  const runtime = fixture();
  executable(join(runtime.bin, 'getent'), "printf '%s\\n' '192.0.2.99 STREAM wrong-target'");
  executable(
    join(runtime.bin, 'openssl'),
    `if [[ "\${1:-}" == s_client ]]; then printf 'fixture certificate\\n'; else cat >/dev/null; printf 'notAfter=Jan  1 00:00:00 2099 GMT\\n'; fi`,
  );
  const result = run(monitorPath, [runtime.mapPath], runtime);
  assert.notEqual(result.status, 0, 'monitoring accepted DNS drift with exit zero');
});

test('daily monitoring fails for an expired certificate instead of only printing its date', () => {
  const runtime = fixture();
  executable(join(runtime.bin, 'getent'), "printf '%s\\n' '192.0.2.10 STREAM expected-target'");
  executable(
    join(runtime.bin, 'openssl'),
    `if [[ "\${1:-}" == s_client ]]; then printf 'fixture certificate\\n'; else cat >/dev/null; printf 'notAfter=Jan  1 00:00:00 2020 GMT\\n'; fi`,
  );
  const result = run(monitorPath, [runtime.mapPath], runtime);
  assert.notEqual(result.status, 0, 'monitoring printed an expired certificate and exited zero');
});
