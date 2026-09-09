/**
 * Opt-in live DEV proof for the ordinary custom-domain settings write path.
 *
 * Oracle: TPB-14/B2/B8 require a clinic to save its own custom-domain intent,
 * while the organization binding is immutable and cannot be claimed across
 * tenants. The proof uses the actual staff port-context login and the real
 * `createPgCustomDomainBindingPort()` Drizzle path; it creates neither a user
 * nor a persistent binding because the successful call is force-rolled back.
 *
 * Run from `apps/webapp` with the canonical DEV env loaded:
 *   USE_REAL_DATABASE=1 RUN_CUSTOM_DOMAIN_BINDING_DB=1 \
 *     pnpm exec vitest run src/infra/repos/pgCustomDomainBinding.devDbProof.test.ts
 */
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { runWithDbStaffPrincipal } from '@bersoncare/db-principal';
import { runInDrizzleMutationTransaction } from '@/infra/db/drizzleMutationTx';
import { createPgCustomDomainBindingPort } from './pgCustomDomainBinding';

const enabled =
  process.env.USE_REAL_DATABASE === '1' &&
  process.env.RUN_CUSTOM_DOMAIN_BINDING_DB === '1';

type StaffFixture = {
  platformUserId: string;
  ownOrganizationId: string;
  foreignOrganizationId: string;
};

class ExpectedRollback extends Error {}

function devFixture(): StaffFixture {
  const output = execFileSync(
    'sudo',
    [
      '-n',
      '-u',
      'postgres',
      'psql',
      '-X',
      '-A',
      '-t',
      '-q',
      '-h',
      '/var/run/postgresql',
      '-p',
      '5432',
      '-d',
      'bcb_webapp_dev',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `SELECT member.platform_user_id || '|' || member.organization_id || '|' || foreign_org.organization_id
         FROM public.be_organization_members AS member
         JOIN LATERAL (
           SELECT candidate.id AS organization_id
             FROM public.be_organizations AS candidate
            WHERE NOT EXISTS (
              SELECT 1
                FROM public.be_organization_members AS own_membership
               WHERE own_membership.platform_user_id = member.platform_user_id
                 AND own_membership.organization_id = candidate.id
                 AND own_membership.status = 'active'
            )
            LIMIT 1
         ) AS foreign_org ON TRUE
        WHERE member.status = 'active'
        LIMIT 1`,
    ],
    { encoding: 'utf8' },
  ).trim();
  const [platformUserId, ownOrganizationId, foreignOrganizationId] = output.split('|');
  if (!platformUserId || !ownOrganizationId || !foreignOrganizationId) {
    throw new Error('DEV requires an active staff membership and an organization without that membership');
  }
  return { platformUserId, ownOrganizationId, foreignOrganizationId };
}

function uniqueBaseDomain(): string {
  return `audit-${randomUUID().replaceAll('-', '')}.example.test`;
}

function pgCause(error: unknown): { code?: string; message?: string } {
  const value = error as { cause?: unknown; code?: string; message?: string };
  return (value.cause ?? value) as { code?: string; message?: string };
}

async function captureRejection(action: () => Promise<unknown>): Promise<{ code?: string; message?: string }> {
  try {
    await action();
  } catch (error) {
    return pgCause(error);
  }
  throw new Error('expected cross-organization custom-domain save to be refused');
}

describe.skipIf(!enabled)('custom-domain ordinary staff save against named DEV', () => {
  it('accepts the member organization through the real Drizzle port and leaves no binding behind', async () => {
    const fixture = devFixture();
    const port = createPgCustomDomainBindingPort();
    let result: Awaited<ReturnType<typeof port.setCustomDomainIntent>> | undefined;

    try {
      await runWithDbStaffPrincipal(
        {
          organizationId: fixture.ownOrganizationId,
          platformUserId: fixture.platformUserId,
          source: 'custom-domain-dev-db-proof',
        },
        () =>
          runInDrizzleMutationTransaction(async () => {
            result = await port.setCustomDomainIntent({
              organizationId: fixture.ownOrganizationId,
              baseDomain: uniqueBaseDomain(),
              placement: 'apex',
            });
            throw new ExpectedRollback();
          }),
      );
    } catch (error) {
      if (!(error instanceof ExpectedRollback)) throw error;
    }

    expect(result).toMatchObject({ ok: true, state: { status: 'pending', placement: 'apex' } });
  });

  it('refuses the same staff actor when it claims an organization without membership', async () => {
    const fixture = devFixture();
    const port = createPgCustomDomainBindingPort();
    const refusal = await captureRejection(() =>
      runWithDbStaffPrincipal(
        {
          organizationId: fixture.foreignOrganizationId,
          platformUserId: fixture.platformUserId,
          source: 'custom-domain-dev-db-proof',
        },
        () =>
          runInDrizzleMutationTransaction(() =>
            port.setCustomDomainIntent({
              organizationId: fixture.foreignOrganizationId,
              baseDomain: uniqueBaseDomain(),
              placement: 'apex',
            }),
          ),
      ),
    );

    expect(refusal.code).toBe('42501');
  });
});
