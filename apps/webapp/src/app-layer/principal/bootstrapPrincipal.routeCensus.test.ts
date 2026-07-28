import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function routeFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...routeFiles(fullPath));
    else if (entry.name === 'route.ts') files.push(fullPath);
  }
  return files;
}

const API_ROOT = path.resolve(process.cwd(), 'src/app/api');

describe('request-bound bootstrap correlation census', () => {
  it('requires every bootstrap route call to pass its Request', () => {
    const failures: string[] = [];
    for (const file of routeFiles(API_ROOT)) {
      const source = readFileSync(file, 'utf8');
      if (!source.includes('stampBootstrapPrincipal(')) continue;
      const calls = source.match(/stampBootstrapPrincipal\([\s\S]*?\);/g) ?? [];
      if (calls.length === 0 || calls.some((call) => !/[,\s]request\s*,?\s*\)/.test(call))) {
        failures.push(path.relative(API_ROOT, file));
      }
    }
    expect(failures).toEqual([]);
  });

  it('keeps integrator POST ingress on the request-aware app-layer verifier', () => {
    const integratorRoot = path.join(API_ROOT, 'integrator');
    const failures: string[] = [];
    for (const file of routeFiles(integratorRoot)) {
      const source = readFileSync(file, 'utf8');
      if (!source.includes('verifyIntegratorSignature(')) continue;
      if (
        source.includes('from "@/infra/webhooks/verifyIntegratorSignature"') ||
        !source.includes('verifyIntegratorSignature(timestamp, rawBody, signature, request)')
      ) {
        failures.push(path.relative(integratorRoot, file));
      }
    }
    expect(failures).toEqual([]);
  });
});
