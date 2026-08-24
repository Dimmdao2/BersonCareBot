import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const helperPath = fileURLToPath(new URL('./webapp-health-host.mjs', import.meta.url));

const deriveHost = (appBaseUrl) =>
  spawnSync(process.execPath, [helperPath], {
    encoding: 'utf8',
    env: { ...process.env, APP_BASE_URL: appBaseUrl },
  });

test('prints the Host for an exact HTTP(S) application origin', () => {
  const https = deriveHost('https://test.bersoncare.ru');
  assert.equal(https.status, 0);
  assert.equal(https.stdout, 'test.bersoncare.ru');

  const localPort = deriveHost('http://localhost:6200/');
  assert.equal(localPort.status, 0);
  assert.equal(localPort.stdout, 'localhost:6200');
});

test('rejects values that could inject or disguise a health Host header', () => {
  const invalidOrigins = [
    '',
    'ftp://test.bersoncare.ru',
    'https://user:test@test.bersoncare.ru',
    'https://test.bersoncare.ru/path',
    'https://test.bersoncare.ru?surface=staff',
    'https://test.bersoncare.ru#staff',
    ' https://test.bersoncare.ru',
    'https://test.bersoncare.ru\r\nX-BCB-Audit: injected@test.bersoncare.ru',
  ];

  for (const origin of invalidOrigins) {
    const result = deriveHost(origin);
    assert.notEqual(result.status, 0, `accepted unsafe APP_BASE_URL: ${JSON.stringify(origin)}`);
    assert.equal(result.stdout, '');
  }
});
