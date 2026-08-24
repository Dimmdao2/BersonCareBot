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

test('a failed candidate nginx validation leaves the previous active TEST vhost intact', () => {
  const runtime = fixture();
  installSuccessfulNetworkFakes(runtime);
  const state = join(runtime.root, 'virtual-active-vhost');
  const nginxChecks = join(runtime.root, 'nginx-check-count');
  const sudoCalls = join(runtime.root, 'sudo-calls');
  writeFileSync(state, 'old test.bersoncare.ru seam\n');
  executable(
    join(runtime.bin, 'sudo'),
    `printf '<%s>' "$@" >> '${sudoCalls}'
printf '\\n' >> '${sudoCalls}'
case "\${1:-}" in
  nginx)
    count=0
    if [[ -f '${nginxChecks}' ]]; then count=$(<'${nginxChecks}'); fi
    count=$((count + 1))
    printf '%s' "$count" > '${nginxChecks}'
    if ((count >= 2)); then exit 1; fi
    ;;
  install)
    src="\${@: -2:1}"
    dst="\${@: -1}"
    if [[ "$dst" == '/etc/nginx/sites-available/test.bersoncare.ru' ]]; then
      cp -- "$src" '${state}'
    fi
    ;;
  cp)
    src="\${@: -2:1}"
    dst="\${@: -1}"
    if [[ "$src" == '/etc/nginx/sites-available/test.bersoncare.ru' ]]; then
      cp -- '${state}' '${state}.backup'
    elif [[ "$dst" == '/etc/nginx/sites-available/test.bersoncare.ru' && -f '${state}.backup' ]]; then
      cp -- '${state}.backup' '${state}'
    fi
    ;;
  systemctl)
    printf 'reload reached\\n' >> '${sudoCalls}'
    ;;
esac`,
  );

  const result = run(
    cutoverPath,
    ['--host-map', runtime.mapPath, '--apply'],
    runtime,
    {
      THERAPYSTO_CUTOVER_OWNER_APPROVED: 'yes',
      THERAPYSTO_CUTOVER_OWNER_APPROVED_MAP_SHA256: run(
        cutoverPath,
        ['--host-map', runtime.mapPath, '--approval-digest'],
        runtime,
      ).stdout.trim(),
    },
  );
  assert.notEqual(result.status, 0, 'the injected nginx validation failure must abort apply');
  assert.equal(
    readFileSync(state, 'utf8'),
    'old test.bersoncare.ru seam\n',
    'the failed apply left the rejected candidate in the active vhost path',
  );
  assert.doesNotMatch(readFileSync(sudoCalls, 'utf8'), /reload reached/u);
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
