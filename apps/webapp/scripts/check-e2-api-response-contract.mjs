#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEBAPP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HELPER = 'src/shared/http/apiResponse.ts';
const ROUTES = [
  'src/app/api/auth/specialist-signup/start/route.ts',
  'src/app/api/auth/specialist-signup/confirm/route.ts',
  'src/app/api/auth/oauth/start/route.ts',
  'src/app/api/clinic/invites/route.ts',
  'src/app/api/clinic/invites/accept/start/route.ts',
  'src/app/api/clinic/invites/accept/confirm/route.ts',
  'src/app/api/booking/create/route.ts',
  'src/app/api/booking/public/create/route.ts',
  'src/app/api/payments/webhook/[provider]/route.ts',
  'src/app/api/payments/patient-acquiring-webhook/[provider]/route.ts',
  'src/app/api/patient/organization-context/route.ts',
];

const PRESERVED_BOUNDARY_IMPORTS = new Map([
  ['src/app/api/booking/public/create/route.ts', new Set(['@/app-layer/db/client'])],
  [
    'src/app/api/clinic/invites/route.ts',
    new Set(['@/infra/integrations/email/integratorEmailAdapter']),
  ],
  [
    'src/app/api/payments/webhook/[provider]/route.ts',
    new Set(['@/infra/payments/paymentProviderRegistry']),
  ],
  [
    'src/app/api/payments/patient-acquiring-webhook/[provider]/route.ts',
    new Set(['@/infra/payments/paymentProviderRegistry']),
  ],
]);

function loadSources() {
  const sources = new Map();
  for (const relativePath of [HELPER, ...ROUTES]) {
    try {
      sources.set(relativePath, readFileSync(path.join(WEBAPP_ROOT, relativePath), 'utf8'));
    } catch {
      // Missing files are reported by analyzeSources with a stable issue code.
    }
  }
  return sources;
}

function importedBoundaries(source) {
  const imports = [];
  const pattern = /from\s+["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    const specifier = match[1];
    if (
      specifier === 'drizzle-orm' ||
      specifier.startsWith('drizzle-orm/') ||
      specifier.startsWith('@/infra/') ||
      specifier.startsWith('@/app-layer/db/') ||
      specifier === 'node:http' ||
      specifier === 'node:https' ||
      specifier === 'node:net' ||
      specifier === 'node:tls'
    ) {
      imports.push(specifier);
    }
  }
  return imports;
}

export function analyzeSources(sources) {
  const issues = [];
  const helper = sources.get(HELPER);
  if (helper == null) {
    issues.push(`missing_file:${HELPER}`);
  } else {
    for (const boundaryImport of importedBoundaries(helper)) {
      issues.push(`helper_boundary_import:${boundaryImport}`);
    }
    if (/\.startsWith\s*\(|\.includes\s*\(|SQLSTATE|\b(?:23|40)\d{3}\b/.test(helper)) {
      issues.push('helper_string_or_pg_sniff');
    }
    if (/buildAppDeps|system_settings|runtimeSetting|\blogger\b|\bfetch\s*\(/.test(helper)) {
      issues.push('helper_runtime_dependency');
    }
  }

  for (const route of ROUTES) {
    const source = sources.get(route);
    if (source == null) {
      issues.push(`missing_route:${route}`);
      continue;
    }
    if (!source.includes('@/shared/http/apiResponse')) {
      issues.push(`missing_helper_import:${route}`);
    }
    if (/\bNextResponse\s*\.\s*json\s*\(/.test(source)) {
      issues.push(`direct_next_response_json:${route}`);
    }
    if (
      /jsonError\s*\(\s*(?:error\s*\.\s*message|message)\b/.test(source) ||
      /error\s*:\s*(?:error\s*\.\s*message|message)\b/.test(source) ||
      /payment_provider_unavailable:\s*\$\{/.test(source)
    ) {
      issues.push(`raw_or_derived_error_message:${route}`);
    }

    const allowedImports = PRESERVED_BOUNDARY_IMPORTS.get(route) ?? new Set();
    for (const boundaryImport of importedBoundaries(source)) {
      if (!allowedImports.has(boundaryImport)) {
        issues.push(`new_boundary_import:${route}:${boundaryImport}`);
      }
    }
  }

  return issues;
}

function assertSelfTestIssue(label, mutate, expectedPrefix) {
  const sources = loadSources();
  mutate(sources);
  const issues = analyzeSources(sources);
  if (!issues.some((issue) => issue.startsWith(expectedPrefix))) {
    throw new Error(`self_test_missed:${label}:${expectedPrefix}:${issues.join(',')}`);
  }
}

function runSelfTest() {
  assertSelfTestIssue(
    'missing-route',
    (sources) => sources.delete(ROUTES[0]),
    `missing_route:${ROUTES[0]}`,
  );
  assertSelfTestIssue(
    'missing-import',
    (sources) =>
      sources.set(
        ROUTES[1],
        sources.get(ROUTES[1]).replace('@/shared/http/apiResponse', '@/shared/http/missing'),
      ),
    `missing_helper_import:${ROUTES[1]}`,
  );
  assertSelfTestIssue(
    'raw-message',
    (sources) =>
      sources.set(
        ROUTES[2],
        `${sources.get(ROUTES[2])}\njsonError(error.message, {}, { status: 500 });\n`,
      ),
    `raw_or_derived_error_message:${ROUTES[2]}`,
  );
  assertSelfTestIssue(
    'boundary-import',
    (sources) =>
      sources.set(
        ROUTES[3],
        `${sources.get(ROUTES[3])}\nimport { getPool } from "@/infra/db/client";\n`,
      ),
    `new_boundary_import:${ROUTES[3]}:@/infra/db/client`,
  );
  assertSelfTestIssue(
    'direct-response',
    (sources) =>
      sources.set(ROUTES[4], `${sources.get(ROUTES[4])}\nNextResponse.json({ ok: false });\n`),
    `direct_next_response_json:${ROUTES[4]}`,
  );
  process.stdout.write('E2 API response contract self-test: PASS (5 adversarial mutations)\n');
}

if (process.argv.includes('--self-test')) runSelfTest();

const issues = analyzeSources(loadSources());
if (issues.length > 0) {
  process.stderr.write(
    `E2 API response contract: FAIL\n${issues.map((issue) => `- ${issue}`).join('\n')}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(`E2 API response contract: PASS (${ROUTES.length} routes)\n`);
}
