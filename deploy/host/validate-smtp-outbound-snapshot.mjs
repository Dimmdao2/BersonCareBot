#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export function validateSmtpOutboundEnvelope(valueJson) {
  if (valueJson === null || typeof valueJson !== 'object' || Array.isArray(valueJson)) return false;
  const value = valueJson.value;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const nonEmpty = (candidate) => typeof candidate === 'string' && candidate.trim().length > 0;
  return nonEmpty(value.host)
    && !/\s/u.test(value.host)
    && Number.isInteger(value.port)
    && value.port >= 1
    && value.port <= 65535
    && typeof value.secure === 'boolean'
    && nonEmpty(value.user)
    && nonEmpty(value.password)
    && typeof value.from === 'string'
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.from.trim());
}

function selfTest() {
  const valid = {
    value: {
      host: 'smtp.test.invalid',
      port: 587,
      secure: false,
      user: 'test-user',
      password: 'not-printed',
      from: 'robot@test.invalid',
    },
  };
  assert.equal(validateSmtpOutboundEnvelope(valid), true);
  for (const key of ['host', 'port', 'secure', 'user', 'password', 'from']) {
    const invalid = structuredClone(valid);
    delete invalid.value[key];
    assert.equal(validateSmtpOutboundEnvelope(invalid), false, `missing ${key}`);
  }
  assert.equal(validateSmtpOutboundEnvelope({ value: null }), false);
  assert.equal(validateSmtpOutboundEnvelope({ value: { ...valid.value, port: 0 } }), false);
  assert.equal(validateSmtpOutboundEnvelope({ value: { ...valid.value, from: 'not-an-email' } }), false);
  console.log('smtp_outbound shape self-test: PASS');
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  if (process.argv[2] === '--self-test' && process.argv.length === 3) {
    selfTest();
  } else if (process.argv[2] === '--stdin' && process.argv.length === 3) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(0, 'utf8'));
    } catch {
      console.error('FATAL: smtp_outbound snapshot is not valid JSON');
      process.exit(1);
    }
    if (!validateSmtpOutboundEnvelope(parsed)) {
      console.error('FATAL: smtp_outbound snapshot is missing required configuration fields');
      process.exit(1);
    }
    console.log('smtp_outbound shape: PASS');
  } else {
    console.error('usage: validate-smtp-outbound-snapshot.mjs --stdin | --self-test');
    process.exit(2);
  }
}
