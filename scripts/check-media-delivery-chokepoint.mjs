#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const routeRoot = 'apps/webapp/src/app/api';
const moduleRoot = 'apps/webapp/src/modules';
const aclImports = new Set([
  'getMediaAccessRow',
  'resolvePlatformLfkMediaAccess',
  'assertMediaPlaybackAccess',
]);

function listSourceFiles(abs) {
  return readdirSync(abs).flatMap((name) => {
    const entry = join(abs, name);
    const stat = statSync(entry);
    if (stat.isDirectory()) return listSourceFiles(entry);
    return /\.(?:[cm]?ts|tsx)$/.test(name) && !name.includes('.test.') && !name.includes('.spec.')
      ? [entry]
      : [];
  });
}

function importedNames(source) {
  const imports = [];
  const importPattern = /^\s*import\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]\s*;?/gm;
  for (const match of source.matchAll(importPattern)) {
    const names = new Set();
    const named = match[1].match(/\{([\s\S]*?)\}/);
    if (named) {
      for (const binding of named[1].split(',')) {
        const name = binding
          .trim()
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)[0];
        if (name) names.add(name);
      }
    }
    imports.push({ module: match[2], names });
  }
  return imports;
}

function inspectFile(rel, source) {
  const imports = importedNames(source);
  const violations = [];

  if (rel.startsWith(`${routeRoot}/`) && rel.endsWith('/route.ts')) {
    for (const entry of imports) {
      const names = [...entry.names].filter((name) => aclImports.has(name));
      if (names.length > 0) {
        violations.push(`${rel}: route imports delivery ACL primitive(s): ${names.join(', ')}`);
      }
    }
  }

  if (rel.startsWith(`${moduleRoot}/`) || rel.startsWith(`${routeRoot}/`)) {
    for (const entry of imports) {
      if (entry.module === '@/infra/s3/client') {
        violations.push(`${rel}: product layer imports @/infra/s3/client directly`);
      }
    }
  }
  return violations;
}

function inspectSources(sources) {
  return sources.flatMap(({ rel, source }) => inspectFile(rel, source));
}

function productionSources() {
  return [
    ...listSourceFiles(join(repoRoot, routeRoot)),
    ...listSourceFiles(join(repoRoot, moduleRoot)),
  ].map((abs) => ({
    rel: relative(repoRoot, abs).replaceAll('\\', '/'),
    source: readFileSync(abs, 'utf8'),
  }));
}

function report(violations) {
  if (violations.length === 0) return;
  console.error('check-media-delivery-chokepoint: delivery bypass detected.');
  for (const violation of violations) console.error(`  - ${violation}`);
  console.error(
    'HTTP media routes must use authorizeMediaDelivery; modules and routes must use app-layer S3 ports.',
  );
}

function exitCodeFor(violations) {
  return violations.length === 0 ? 0 : 1;
}

function runSelfTest() {
  const green = inspectSources([
    {
      rel: 'apps/webapp/src/app/api/media/[id]/playback/route.ts',
      source:
        "import { authorizeMediaDelivery } from '@/app-layer/media/authorizeMediaDelivery';\n",
    },
  ]);
  const plantedSixthRoute = inspectSources([
    {
      rel: 'apps/webapp/src/app/api/media/[id]/download/route.ts',
      source: "import { getMediaAccessRow } from '@/app-layer/media/s3MediaStorage';\n",
    },
  ]);
  const plantedModuleS3 = inspectSources([
    {
      rel: 'apps/webapp/src/modules/online-intake/newDelivery.ts',
      source: "import { s3PublicUrl } from '@/infra/s3/client';\n",
    },
  ]);

  if (
    exitCodeFor(green) !== 0 ||
    exitCodeFor(plantedSixthRoute) !== 1 ||
    exitCodeFor(plantedModuleS3) !== 1
  ) {
    throw new Error('check-media-delivery-chokepoint self-test failed');
  }
  console.log('check-media-delivery-chokepoint self-test: green route accepted');
  console.log(
    'check-media-delivery-chokepoint self-test: planted sixth-route bypass exits nonzero',
  );
  console.log('check-media-delivery-chokepoint self-test: planted module S3 import exits nonzero');
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
} else {
  const violations = inspectSources(productionSources());
  report(violations);
  process.exitCode = exitCodeFor(violations);
}
