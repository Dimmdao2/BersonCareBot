#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const appSourceRoot = 'apps/webapp/src';
const routeRoot = `${appSourceRoot}/app/api`;
const moduleRoot = `${appSourceRoot}/modules`;
const deliveryRouteRoot = `${routeRoot}/media/[id]/`;
const mediaModuleRoot = `${moduleRoot}/media/`;
const authorizationDoor = `${appSourceRoot}/app-layer/media/authorizeMediaDelivery.ts`;
const mediaStoragePort = `${appSourceRoot}/app-layer/media/s3MediaStorage.ts`;
const storagePort = `${appSourceRoot}/app-layer/media/s3Client.ts`;
const infraS3Client = `${appSourceRoot}/infra/s3/client`;
const aclImports = new Set([
  'getMediaAccessRow',
  'resolvePlatformLfkMediaAccess',
  'assertMediaPlaybackAccess',
]);
const rawS3Packages = new Set(['@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner']);

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

function normalizePath(path) {
  return posix.normalize(path.replaceAll('\\', '/')).replace(/^\.\//, '');
}

function importEntries(source) {
  const entries = [];
  const importPattern = /^\s*(?:import|export)\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]\s*;?/gm;

  for (const match of source.matchAll(importPattern)) {
    const bindings = new Map();
    const named = match[1].match(/\{([\s\S]*?)\}/);
    if (named) {
      for (const binding of named[1].split(',')) {
        const [imported, local = imported] = binding
          .trim()
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/);
        if (imported) bindings.set(imported, local);
      }
    }
    entries.push({ module: match[2], bindings, dynamic: false });
  }

  for (const match of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    entries.push({ module: match[1], bindings: new Map(), dynamic: true });
  }
  return entries;
}

function resolveImport(from, specifier, sources) {
  let base;
  if (specifier.startsWith('@/')) {
    base = `${appSourceRoot}/${specifier.slice(2)}`;
  } else if (specifier.startsWith('.')) {
    base = normalizePath(posix.join(posix.dirname(from), specifier));
  } else {
    return null;
  }

  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`];
  return candidates.find((candidate) => sources.has(candidate)) ?? normalizePath(base);
}

function isInfraS3Client(path) {
  return path === infraS3Client || path === `${infraS3Client}.ts` || path === `${infraS3Client}.tsx`;
}

function usesAclPrimitive(source, entries) {
  for (const entry of entries) {
    if ([...entry.bindings.keys()].some((name) => aclImports.has(name))) return true;
    if (
      entry.dynamic &&
      [...aclImports].some((name) => new RegExp(`(?:\\.\\s*|\\b)${name}\\b`).test(source))
    ) {
      return true;
    }
    if (
      /\*\s+as\s+\w+/.test(source) &&
      [...aclImports].some((name) => new RegExp(`\\.\\s*${name}\\b`).test(source))
    ) {
      return true;
    }
  }
  return false;
}

function isDeliveryRoute(rel) {
  return rel.startsWith(deliveryRouteRoot) && rel.endsWith('/route.ts');
}

function isMediaModule(rel) {
  return rel.startsWith(mediaModuleRoot);
}

function authorizerIsCalled(source, entries) {
  const localName = entries
    .flatMap((entry) => {
      const local = entry.bindings.get('authorizeMediaDelivery');
      return local ? [local] : [];
    })
    .find((local) => new RegExp(`\\b${local}\\s*\\(`).test(source));
  return Boolean(localName);
}

function inspectNode(rel, source, sources, violations) {
  if (rel === authorizationDoor) return [];
  const entries = importEntries(source);

  if (rel !== mediaStoragePort && usesAclPrimitive(source, entries)) {
    violations.add(`${rel}: bypasses authorizeMediaDelivery with a delivery ACL primitive`);
  }

  for (const entry of entries) {
    const resolved = resolveImport(rel, entry.module, sources);
    if (
      isInfraS3Client(resolved) &&
      rel !== storagePort &&
      (isDeliveryRoute(rel) || isMediaModule(rel) || rel.startsWith(`${appSourceRoot}/app-layer/`))
    ) {
      violations.add(`${rel}: imports infra S3 client outside the media storage port`);
    }
    if (
      rawS3Packages.has(entry.module) &&
      (isDeliveryRoute(rel) || isMediaModule(rel) || rel.startsWith(`${appSourceRoot}/app-layer/`))
    ) {
      violations.add(`${rel}: imports raw AWS S3 SDK delivery primitives`);
    }
  }
  return entries;
}

function inspectGraph(root, sources, violations) {
  const queue = [root];
  const seen = new Set();

  while (queue.length > 0) {
    const rel = queue.shift();
    if (!rel || seen.has(rel)) continue;
    seen.add(rel);
    if (rel === authorizationDoor) continue;
    const source = sources.get(rel);
    if (!source) continue;

    const entries = inspectNode(rel, source, sources, violations);
    for (const entry of entries) {
      const resolved = resolveImport(rel, entry.module, sources);
      if (resolved && sources.has(resolved)) queue.push(resolved);
    }
  }
}

function inspectSources(sourceFiles) {
  const sources = new Map(sourceFiles.map(({ rel, source }) => [normalizePath(rel), source]));
  const violations = new Set();

  for (const [rel, source] of sources) {
    const entries = importEntries(source);
    if (isDeliveryRoute(rel) && !authorizerIsCalled(source, entries)) {
      violations.add(`${rel}: media delivery route does not call authorizeMediaDelivery`);
    }
    if (isDeliveryRoute(rel) || isMediaModule(rel)) inspectGraph(rel, sources, violations);
  }
  return [...violations].sort();
}

function productionSources() {
  return listSourceFiles(join(repoRoot, appSourceRoot)).map((abs) => ({
    rel: relative(repoRoot, abs).replaceAll('\\', '/'),
    source: readFileSync(abs, 'utf8'),
  }));
}

function report(violations) {
  if (violations.length === 0) return;
  console.error('check-media-delivery-chokepoint: delivery bypass detected.');
  for (const violation of violations) console.error(`  - ${violation}`);
  console.error(
    'HTTP media routes must call authorizeMediaDelivery; route/module delivery paths must not reach ACL or raw S3 bypasses.',
  );
}

function exitCodeFor(violations) {
  return violations.length === 0 ? 0 : 1;
}

function runSelfTest() {
  const route = `${deliveryRouteRoot}download/route.ts`;
  const green = [
    {
      rel: route,
      source:
        "import { authorizeMediaDelivery } from '@/app-layer/media/authorizeMediaDelivery';\nexport async function GET() { return authorizeMediaDelivery('id', {}); }\n",
    },
  ];
  const bypasses = [
    [
      'dynamic ACL import',
      [
        {
          rel: route,
          source:
            "export async function GET() { return (await import('@/app-layer/media/s3MediaStorage')).getMediaAccessRow('id'); }\n",
        },
      ],
    ],
    [
      'namespace ACL import',
      [
        {
          rel: route,
          source:
            "import * as storage from '@/app-layer/media/s3MediaStorage';\nexport async function GET() { return storage.getMediaAccessRow('id'); }\n",
        },
      ],
    ],
    [
      're-export shim',
      [
        {
          rel: `${deliveryRouteRoot}download/shim.ts`,
          source: "export { getMediaAccessRow as lookup } from '@/app-layer/media/s3MediaStorage';\n",
        },
        {
          rel: route,
          source: "import { lookup } from './shim';\nexport async function GET() { return lookup('id'); }\n",
        },
      ],
    ],
    [
      'relative infra S3 import',
      [
        {
          rel: route,
          source:
            "import { s3PublicUrl } from '../../../../../infra/s3/client';\nexport function GET() { return s3PublicUrl('foreign'); }\n",
        },
      ],
    ],
    [
      'raw S3 SDK route',
      [
        {
          rel: route,
          source:
            "import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';\nexport function GET() { return new S3Client({}).send(new GetObjectCommand({})); }\n",
        },
      ],
    ],
    [
      'raw S3 SDK module',
      [
        {
          rel: `${mediaModuleRoot}newDelivery.ts`,
          source:
            "import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';\nexport function deliver() { return new S3Client({}).send(new GetObjectCommand({})); }\n",
        },
      ],
    ],
    [
      'renamed app-layer helper',
      [
        {
          rel: `${appSourceRoot}/app-layer/media/newDelivery.ts`,
          source:
            "import { getMediaAccessRow } from '@/app-layer/media/s3MediaStorage';\nexport const deliverWithoutSubmissionAcl = getMediaAccessRow;\n",
        },
        {
          rel: route,
          source:
            "import { deliverWithoutSubmissionAcl } from '@/app-layer/media/newDelivery';\nexport async function GET() { return deliverWithoutSubmissionAcl('id'); }\n",
        },
      ],
    ],
  ];
  const missed = bypasses.filter(([, files]) => exitCodeFor(inspectSources(files)) === 0);
  const negativeControl = inspectSources([
    {
      rel: `${routeRoot}/media/multipart/complete/route.ts`,
      source: "import { s3CompleteMultipartUpload } from '@/app-layer/media/s3Client';\nvoid s3CompleteMultipartUpload;\n",
    },
    {
      rel: `${appSourceRoot}/app-layer/media/backgroundDelete.ts`,
      source: "import { s3DeleteObject } from '@/infra/s3/client';\nvoid s3DeleteObject;\n",
    },
  ]);

  if (exitCodeFor(inspectSources(green)) !== 0 || missed.length > 0 || exitCodeFor(negativeControl) !== 0) {
    throw new Error(`check-media-delivery-chokepoint self-test failed: ${missed.map(([name]) => name).join(', ')}`);
  }
  console.log('check-media-delivery-chokepoint self-test: green route accepted');
  console.log(`check-media-delivery-chokepoint self-test: ${bypasses.length} reachable bypass forms exit nonzero`);
  console.log('check-media-delivery-chokepoint self-test: upload and background-delete controls accepted');
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
} else {
  const violations = inspectSources(productionSources());
  report(violations);
  process.exitCode = exitCodeFor(violations);
}
