/**
 * Opt-in live proof for the two DB-role paths behind Caddy's public on-demand TLS ask route.
 *
 * Fault protected: changing either repository's named root to the other role turns a legitimate
 * absence into a capability/role error, so this public route answers 500 and the clinic hostname
 * cannot receive a certificate. The independent oracle is the public contract: an unknown
 * platform subdomain and an unknown custom domain both finish as 403, never 500.
 *
 * Run from apps/webapp with the canonical DEV env loaded:
 *   USE_REAL_DATABASE=1 RUN_ON_DEMAND_TLS_DB_ROLE_PROOF=1 pnpm exec vitest --run \
 *     src/app/api/public/domains/ask/onDemandTlsDbRoles.devDbProof.test.ts
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const enabled =
  process.env.USE_REAL_DATABASE === '1' && process.env.RUN_ON_DEMAND_TLS_DB_ROLE_PROOF === '1';

function assertNamedDevOrTestDatabase(urlValue: string | undefined, envName: string): void {
  if (!urlValue) throw new Error(`${envName} is required for the live DB-role proof`);
  const database = decodeURIComponent(new URL(urlValue).pathname.replace(/^\//u, ''));
  if (database !== 'bcb_webapp_dev' && database !== 'bersoncarebot_test') {
    throw new Error(
      `refusing to use database '${database}' from ${envName}: only named DEV/TEST are allowed`,
    );
  }
}

if (enabled) {
  assertNamedDevOrTestDatabase(process.env.DATABASE_URL_STAFF, 'DATABASE_URL_STAFF');
  assertNamedDevOrTestDatabase(process.env.DATABASE_URL_PATIENT, 'DATABASE_URL_PATIENT');
  assertNamedDevOrTestDatabase(process.env.DATABASE_URL_GLOBAL_ADMIN, 'DATABASE_URL_GLOBAL_ADMIN');
}

describe.skipIf(!enabled)('public on-demand TLS ask uses both declared DB roles', () => {
  let GET: typeof import('./route').GET;
  let platformBaseHost: string;
  const previousPatientAppOrigin = process.env.PATIENT_APP_ORIGIN;
  const previousPrincipalMode = process.env.DB_PRINCIPAL_CONTEXT_MODE;

  beforeAll(async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = 'port-context';
    // DEV serves on loopback, which cannot have a tenant label. Exercise the production shape
    // without changing the database or starting a second server.
    process.env.PATIENT_APP_ORIGIN = 'https://therapygo.ru';
    const { PATIENT_DEFAULT_SURFACE } = await import('@/config/productSurfaces');
    platformBaseHost = new URL(PATIENT_DEFAULT_SURFACE.origin).hostname;
    ({ GET } = await import('./route'));
  });

  afterAll(() => {
    if (previousPatientAppOrigin === undefined) delete process.env.PATIENT_APP_ORIGIN;
    else process.env.PATIENT_APP_ORIGIN = previousPatientAppOrigin;
    if (previousPrincipalMode === undefined) delete process.env.DB_PRINCIPAL_CONTEXT_MODE;
    else process.env.DB_PRINCIPAL_CONTEXT_MODE = previousPrincipalMode;
  });

  it.each([
    {
      path: 'bootstrap platform-subdomain root',
      hostname: () => `dbproof-${randomUUID().slice(0, 12)}.${platformBaseHost}`,
    },
    {
      path: 'infra custom-domain root',
      hostname: () => `dbproof-${randomUUID()}.invalid`,
    },
  ])(
    '$path returns the public absence verdict instead of a DB-role failure',
    async ({ hostname }) => {
      const domain = hostname();
      const request = new Request(
        `http://caddy.invalid/api/public/domains/ask?domain=${encodeURIComponent(domain)}`,
      );

      const response = await GET(request);
      const body = (await response.json()) as { error?: string; ok?: boolean };

      expect(response.status).toBe(403);
      expect(body).toEqual({ ok: false, error: 'not_authorized' });
    },
  );
});
