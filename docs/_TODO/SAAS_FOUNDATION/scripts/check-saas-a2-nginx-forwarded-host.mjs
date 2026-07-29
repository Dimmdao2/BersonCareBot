#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const templatePath = 'deploy/nginx/bersoncarebot-webapp.vhost.template.conf';
const testApplyScriptPath = 'deploy/host/apply-test-nginx-webapp.sh';
const roadmapPath = 'docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md';
const smokeDocPath = 'docs/archive/2026-07-plans/SAAS_FOUNDATION/SAAS_PRODUCT_SMOKE_A1.md';
const smokeContractPath = 'docs/_TODO/SAAS_FOUNDATION/saas-product-smoke-contract.json';

function usage() {
  return [
    'Usage:',
    '  node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-a2-nginx-forwarded-host.mjs',
    '  node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-a2-nginx-forwarded-host.mjs --self-test',
    '  sudo nginx -T 2>/tmp/nginx.dump && node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-a2-nginx-forwarded-host.mjs --nginx-dump=/tmp/nginx.dump',
  ].join('\n');
}

function parseArgs(argv) {
  const options = { selfTest: false, nginxDump: null };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--self-test') {
      options.selfTest = true;
      continue;
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

function assertTestApplyScript(scriptText) {
  assert(
    scriptText.includes('SERVER_NAME="test.bersoncare.ru"'),
    'TEST nginx apply script must pin test.bersoncare.ru',
  );
  assert(
    scriptText.includes('TARGET_AVAILABLE="/etc/nginx/sites-available/test.bersoncare.ru"'),
    'TEST nginx apply script must pin TEST sites-available path',
  );
  assert(
    scriptText.includes('PROJECT_ROOT="/opt/projects/bersoncarebot-test"'),
    'TEST nginx apply script must pin TEST project root',
  );
  assert(
    scriptText.includes('WEBAPP_UPSTREAM="http://127.0.0.1:6300"'),
    'TEST nginx apply script must pin TEST webapp upstream',
  );
  assert(
    scriptText.includes('INTEGRATOR_UPSTREAM="http://127.0.0.1:3300"'),
    'TEST nginx apply script must pin TEST integrator upstream',
  );
  assert(
    scriptText.includes('ACTION="dry-run"'),
    'TEST nginx apply script must default to dry-run',
  );
  assert(scriptText.includes('--apply'), 'TEST nginx apply script must require explicit --apply');
  assert(
    scriptText.includes('refusing production-looking nginx target or upstream'),
    'TEST nginx apply script must refuse production-looking targets',
  );
  assert(
    scriptText.includes('sudo cp -p -- "$TARGET_AVAILABLE" "$backup"'),
    'TEST nginx apply script must backup active TEST nginx config',
  );
  assert(scriptText.includes('sudo nginx -t'), 'TEST nginx apply script must run nginx -t');
  assert(
    scriptText.includes('sudo systemctl reload nginx'),
    'TEST nginx apply script must reload nginx only through the repo script',
  );
  assert(
    scriptText.includes('check-saas-a2-nginx-forwarded-host.mjs'),
    'TEST nginx apply script must run the A2 checker',
  );
  assertWebappProxyContract(scriptText, testApplyScriptPath);
}

function runChecks({ template, nginxDump }) {
  assertWebappProxyContract(template, templatePath);
  assertTestApplyScript(read(testApplyScriptPath));

  const roadmap = read(roadmapPath);
  assert(
    roadmap.includes('proxy_set_header X-Forwarded-Host'),
    'roadmap must keep A2 forwarded-host requirement',
  );

  const smokeDoc = read(smokeDocPath);
  assert(smokeDoc.includes('smoke:saas-product'), 'A1 smoke doc must include real smoke command');

  const smokeContract = JSON.parse(read(smokeContractPath));
  const mutationIds = new Set(smokeContract.mutationScenarios.map((scenario) => scenario.id));
  assert(
    mutationIds.has('server-action.forwarded-host.sentinel'),
    'smoke contract missing A2 Server Action sentinel slot',
  );

  if (nginxDump) {
    assertWebappProxyContract(selectWebappServerBlock(nginxDump), '--nginx-dump');
  }
}

function runSelfTest(template) {
  const broken = template.replace(/^\s*proxy_set_header X-Forwarded-Host \$host;\n/m, '');
  try {
    runChecks({ template: broken, nginxDump: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes('X-Forwarded-Host'), `self-test failed for wrong reason: ${message}`);
    console.log('check-saas-a2-nginx-forwarded-host self-test: OK');
    return;
  }
  throw new Error('self-test did not detect missing X-Forwarded-Host');
}

try {
  const options = parseArgs(process.argv.slice(2));
  const template = read(templatePath);
  if (options.selfTest) {
    runSelfTest(template);
  } else {
    const nginxDump = options.nginxDump ? read(options.nginxDump) : null;
    runChecks({ template, nginxDump });
    console.log('check-saas-a2-nginx-forwarded-host: OK');
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-saas-a2-nginx-forwarded-host: ${message}`);
  process.exit(1);
}
