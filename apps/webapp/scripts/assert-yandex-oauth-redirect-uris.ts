import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { getPool } from '@/infra/db/client';
import { getConfigValue } from '@/modules/system-settings/configAdapter';

function parseExpected(raw: string): readonly string[] {
  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length !== 2 || new Set(values).size !== 2) {
    throw new Error('expected callback map must contain two distinct entries');
  }
  return values.toSorted();
}

function parseStored(raw: string): readonly string[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === 'string')) {
    throw new Error('stored callback allowlist is not a string list');
  }
  const values = parsed.map((value) => value.trim()).filter(Boolean);
  if (values.length !== 2 || new Set(values).size !== 2) {
    throw new Error('stored callback allowlist must contain two distinct entries');
  }
  return values.toSorted();
}

async function main(): Promise<void> {
  const expectedRaw = process.argv[2] ?? '';
  const expected = parseExpected(expectedRaw);
  stampBootstrapPrincipal('therapysto-domain-cutover-db-preflight');
  const stored = parseStored(await getConfigValue('yandex_oauth_redirect_uri'));
  if (stored[0] !== expected[0] || stored[1] !== expected[1]) {
    throw new Error('stored callback allowlist does not match the approved map');
  }
  console.log('DB-backed Yandex callback allowlist: PASS');
}

try {
  await main();
} catch {
  console.error('DB-backed Yandex callback allowlist: FAIL');
  process.exitCode = 1;
} finally {
  await getPool().end().catch(() => undefined);
}
