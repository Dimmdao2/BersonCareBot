#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function usage() {
  return [
    'Usage:',
    '  sudo nginx -T 2>/tmp/nginx.dump && node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-a2-nginx-forwarded-host.mjs --nginx-dump=/tmp/nginx.dump',
    '  node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-a2-nginx-forwarded-host.mjs --self-test',
  ].join('\n');
}

function parseArgs(argv) {
  const options = { nginxDump: null, selfTest: false };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg.startsWith('--nginx-dump=')) {
      options.nginxDump = arg.slice('--nginx-dump='.length);
      continue;
    }
    if (arg === '--self-test') {
      options.selfTest = true;
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

function extractLocationBlocks(configText) {
  const blocks = [];
  const pattern = /(^|\s)location\s+[^\{]+\{/g;
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

const TEST_PRIVATE_NETWORKS = ['10.9.0.0/24', '172.17.0.0/16', '151.241.228.122', '127.0.0.1'];
const YOOKASSA_NETWORKS = [
  '185.71.76.0/27',
  '185.71.77.0/27',
  '77.75.153.0/25',
  '77.75.156.11/32',
  '77.75.156.35/32',
  '77.75.154.128/25',
  '2a02:5180::/32',
];
const YOOKASSA_LOCATION =
  'location ~ ^/api/payments/(?:saas-webhook|webhook|patient-acquiring-webhook)/yookassa$ {';

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertAllow(block, network) {
  assert(
    new RegExp(`\\ballow\\s+${escapeRegex(network)}\\s*;`, 'i').test(block),
    `missing allow ${network} in YooKassa callback location`,
  );
}

function assertYooKassaWebhookIngress(serverBlock) {
  const locations = extractLocationBlocks(serverBlock);
  const yookassaLocations = locations.filter((block) => /\/yookassa\$?\s*\{/.test(block));
  assert(yookassaLocations.length === 1, 'expected exactly one YooKassa callback location');

  const callbackLocation = yookassaLocations[0];
  assert(
    callbackLocation.startsWith(YOOKASSA_LOCATION),
    'YooKassa callback location must match only the three approved payment webhook paths',
  );
  [...TEST_PRIVATE_NETWORKS, ...YOOKASSA_NETWORKS].forEach((network) => assertAllow(callbackLocation, network));
  assert(/deny\s+all\s*;/.test(callbackLocation), 'YooKassa callback location must deny all other sources');
  const generalVhost = serverBlock.replace(callbackLocation, '');
  TEST_PRIVATE_NETWORKS.forEach((network) => assertAllow(generalVhost, network));
  assert(/deny\s+all\s*;/.test(generalVhost), 'general TEST vhost must retain deny all');
  assert(/proxy_pass\s+http:\/\/127\.0\.0\.1:6300\s*;/i.test(callbackLocation), 'YooKassa callback location must proxy to TEST webapp');
  assertProxyHeader(callbackLocation, 'Host', '$host');
  assertProxyHeader(callbackLocation, 'X-Forwarded-Host', '$host');
  assertProxyHeader(callbackLocation, 'X-Forwarded-Proto', '$scheme');
  assertProxyHeader(callbackLocation, 'X-Real-IP', '$remote_addr');
  assertProxyHeader(callbackLocation, 'X-Forwarded-For', '$proxy_add_x_forwarded_for');
}

function runSelfTest() {
  const validConfig = `server {
    server_name test.bersoncare.ru;
    ${TEST_PRIVATE_NETWORKS.map((network) => `allow ${network};`).join('\n    ')}
    deny all;
    ${YOOKASSA_LOCATION}
        ${[...TEST_PRIVATE_NETWORKS, ...YOOKASSA_NETWORKS].map((network) => `allow ${network};`).join('\n        ')}
        deny all;
        proxy_pass http://127.0.0.1:6300;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}`;
  assertYooKassaWebhookIngress(validConfig);

  let rejectedCount = 0;
  const assertRejected = (config, label) => {
    let rejected = false;
    try {
      assertYooKassaWebhookIngress(config);
    } catch {
      rejected = true;
    }
    assert(rejected, `self-test: ${label} was accepted`);
    rejectedCount += 1;
  };
  assertRejected(validConfig.replace('allow 2a02:5180::/32;', ''), 'missing YooKassa network');
  assertRejected(
    validConfig.replace(YOOKASSA_LOCATION, 'location ~ ^/api/payments/ {'),
    'broad payments location',
  );
  assertRejected(
    validConfig.replace(
      'proxy_set_header X-Real-IP $remote_addr;',
      'proxy_set_header X-Real-IP $http_x_real_ip;',
    ),
    'client-controlled real IP header',
  );
  assertRejected(validConfig.replace('    deny all;\n    location ~', '    location ~'), 'missing vhost deny all');
  return rejectedCount;
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) {
    assert(!options.nginxDump, '--self-test cannot be combined with --nginx-dump');
    const rejectedCount = runSelfTest();
    console.log(`check-saas-a2-nginx-forwarded-host: self-test OK (${rejectedCount}/4 faults rejected)`);
    process.exit(0);
  }
  assert(options.nginxDump, `--nginx-dump is required\n\n${usage()}`);
  const nginxDump = read(options.nginxDump);
  const webappServerBlock = selectWebappServerBlock(nginxDump);
  assertWebappProxyContract(webappServerBlock, '--nginx-dump');
  assertYooKassaWebhookIngress(webappServerBlock);
  console.log('check-saas-a2-nginx-forwarded-host: OK');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-saas-a2-nginx-forwarded-host: ${message}`);
  process.exit(1);
}
