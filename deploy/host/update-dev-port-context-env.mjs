#!/usr/bin/env node

import {
  chmodSync,
  closeSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openCanonicalRegularFile } from './stream-canonical-sql.mjs';
import { declaration } from '../postgres/privileges/declaration.ts';
import { renderPortContextRuntimeEnv } from '../postgres/privileges/generate.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..', '..');

function shellQuote(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function upsertExactEnvValue(text, key, value) {
  if (!/^[A-Z][A-Z0-9_]*$/u.test(key)) throw new Error('unsafe env key');
  let seen = 0;
  const replacement = `${key}=${shellQuote(value)}`;
  const lines = text.replace(/\r\n/gu, '\n').split('\n').map((line) => {
    if (!new RegExp(`^${key}=`).test(line)) return line;
    seen += 1;
    return replacement;
  });
  if (seen > 1) throw new Error(`duplicate ${key}`);
  while (lines.at(-1) === '') lines.pop();
  if (seen === 0) lines.push('', '# Declaration-owned exact port-context capabilities.', replacement);
  return `${lines.join('\n')}\n`;
}

function replaceCanonicalEnv(path, key, value) {
  const expected = resolve(path);
  const descriptor = openCanonicalRegularFile(expected, expected);
  let original;
  let metadata;
  try {
    original = readFileSync(descriptor, 'utf8');
    metadata = lstatSync(expected);
  } finally {
    closeSync(descriptor);
  }
  const updated = upsertExactEnvValue(original, key, value);
  if (updated === original) return false;

  const temporary = `${expected}.tmp-${process.pid}`;
  let temporaryCreated = false;
  try {
    const temporaryDescriptor = openSync(temporary, 'wx', metadata.mode & 0o777);
    temporaryCreated = true;
    try {
      writeFileSync(temporaryDescriptor, updated, 'utf8');
    } finally {
      closeSync(temporaryDescriptor);
    }
    chmodSync(temporary, metadata.mode & 0o777);
    renameSync(temporary, expected);
    temporaryCreated = false;
  } finally {
    if (temporaryCreated) unlinkSync(temporary);
  }
  return true;
}

export function updateDevPortContextEnv() {
  const targets = [
    {
      path: resolve(repoRoot, 'apps/webapp/.env.dev'),
      port: 'webapp',
    },
    {
      path: resolve(repoRoot, '.env'),
      port: 'integrator',
    },
  ];
  for (const target of targets) {
    const rendered = renderPortContextRuntimeEnv(
      declaration,
      'dev',
      'bcb_webapp_dev',
      target.port,
    );
    replaceCanonicalEnv(target.path, rendered.key, rendered.value);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  if (process.argv.length !== 2) throw new Error('update-dev-port-context-env takes no arguments');
  updateDevPortContextEnv();
  console.log('DEV port-context runtime env synchronized with declaration');
}
