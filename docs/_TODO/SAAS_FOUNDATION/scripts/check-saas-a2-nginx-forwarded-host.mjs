#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function usage() {
  return [
    'Usage:',
    '  sudo nginx -T 2>/tmp/nginx.dump && node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-a2-nginx-forwarded-host.mjs --nginx-dump=/tmp/nginx.dump',
  ].join('\n');
}

function parseArgs(argv) {
  const options = { nginxDump: null };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg.startsWith('--nginx-dump=')) {
      options.nginxDump = arg.slice('--nginx-dump='.length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
  }
  return options;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return readFileSync(resolve(path), 'utf8');
}

function extractLocationSlash(configText) {
  const locationStart = configText.search(/location\s+\/\s*\{/);
  assert(locationStart >= 0, 'missing effective `location /` block');

  const openBrace = configText.indexOf('{', locationStart);
  assert(openBrace >= 0, 'malformed `location /` block');

  let depth = 0;
  for (let index = openBrace; index < configText.length; index += 1) {
    const char = configText[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return configText.slice(openBrace + 1, index);
      }
    }
  }
  throw new Error('unterminated `location /` block');
}

function extractBalancedBlock(configText, keywordStart) {
  const openBrace = configText.indexOf('{', keywordStart);
  assert(openBrace >= 0, 'malformed block');

  let depth = 0;
  for (let index = openBrace; index < configText.length; index += 1) {
    const char = configText[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return configText.slice(keywordStart, index + 1);
      }
    }
  }
  throw new Error('unterminated block');
}

function extractServerBlocks(configText) {
  const blocks = [];
  const pattern = /(^|\s)server\s*\{/g;
  let match;
  while ((match = pattern.exec(configText)) !== null) {
    const keywordStart = match.index + match[1].length;
    blocks.push(extractBalancedBlock(configText, keywordStart));
  }
  return blocks;
}

function selectWebappServerBlock(nginxDump) {
  const serverBlocks = extractServerBlocks(nginxDump);
  const candidates = serverBlocks.filter(
    (block) =>
      /server_name\s+[^;]*(test\.bersoncare\.ru|bersoncare\.ru|www\.bersoncare\.ru)[^;]*;/i.test(
        block,
      ) && /proxy_pass\s+http:\/\/127\.0\.0\.1:(6200|6300)\s*;/i.test(block),
  );
  assert(candidates.length > 0, '--nginx-dump: missing BersonCareBot webapp server block');
  return (
    candidates.find((block) => /proxy_pass\s+http:\/\/127\.0\.0\.1:6300\s*;/i.test(block)) ??
    candidates[0]
  );
}

function assertProxyHeader(block, headerName, expectedValue) {
  const escapedName = headerName.replaceAll('-', '\\-');
  const escapedValue = expectedValue.replaceAll('$', '\\$');
  const pattern = new RegExp(`proxy_set_header\\s+${escapedName}\\s+${escapedValue}\\s*;`, 'i');
  assert(pattern.test(block), `missing proxy header: ${headerName} ${expectedValue}`);
}

function assertWebappProxyContract(configText, sourceName) {
  const block = extractLocationSlash(configText);
  assertProxyHeader(block, 'Host', '$host');
  assertProxyHeader(block, 'X-Forwarded-Host', '$host');
  assertProxyHeader(block, 'X-Forwarded-Proto', '$scheme');
  assertProxyHeader(block, 'X-Real-IP', '$remote_addr');
  assert(
    /proxy_pass\s+(__UPSTREAM__|http:\/\/127\.0\.0\.1:(6200|6300))\s*;/i.test(block),
    `${sourceName}: missing webapp loopback proxy_pass`,
  );
}

try {
  const options = parseArgs(process.argv.slice(2));
  assert(options.nginxDump, `--nginx-dump is required\n\n${usage()}`);
  const nginxDump = read(options.nginxDump);
  assertWebappProxyContract(selectWebappServerBlock(nginxDump), '--nginx-dump');
  console.log('check-saas-a2-nginx-forwarded-host: OK');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-saas-a2-nginx-forwarded-host: ${message}`);
  process.exit(1);
}
