/**
 * Opt-in proof against named DEV. It exercises the real Drizzle port under the runtime staff
 * principal; setup and cleanup use the local admin socket and leave no persistent fixture.
 *
 * Oracle: LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md §11.2 and §12.3. Accept creates one
 * clinic enrollment; reject creates none, queues exactly one durable email, and a queue failure
 * rolls the status transition back instead of losing the mail after commit.
 *
 * RUN_LEADS_DEV_DB=1 USE_REAL_DATABASE=1 pnpm exec vitest run --project unit \
 *   src/infra/repos/pgLeads.devDbProof.test.ts
 */
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ENABLED = process.env.RUN_LEADS_DEV_DB === '1' && process.env.USE_REAL_DATABASE === '1';
const DATABASE = process.env.LEADS_DEV_DB ?? 'bcb_webapp_dev';
if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) throw new Error(`unsafe database '${DATABASE}'`);

const APPLICANT_ID = '1ead0000-0000-4000-8000-000000000001';
const ACCEPT_LEAD_ID = '1ead0000-0000-4000-8000-000000000011';
const REJECT_LEAD_ID = '1ead0000-0000-4000-8000-000000000012';
const FAILED_REJECT_LEAD_ID = '1ead0000-0000-4000-8000-000000000013';

function psql(sqlText: string): string {
  return execFileSync(
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
      DATABASE,
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      '-',
    ],
    { input: sqlText, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  ).trim();
}

type Staff = { platformUserId: string; organizationId: string };

function findDevStaff(): Staff {
  const row = psql(`
    SELECT platform_user_id || '|' || organization_id
      FROM public.be_organization_members
     WHERE status = 'active'
     ORDER BY created_at
     LIMIT 1;
  `);
  const [platformUserId, organizationId] = row.split('|');
  if (!platformUserId || !organizationId) throw new Error('DEV requires an active staff member');
  return { platformUserId, organizationId };
}

function cleanup(): void {
  psql(`
    DELETE FROM public.outgoing_delivery_queue
     WHERE event_id IN ('lead.rejected:${REJECT_LEAD_ID}', 'lead.rejected:${FAILED_REJECT_LEAD_ID}');
    DELETE FROM public.org_enrollments
     WHERE platform_user_id = '${APPLICANT_ID}'::uuid;
    DELETE FROM public.leads
     WHERE id IN ('${ACCEPT_LEAD_ID}'::uuid, '${REJECT_LEAD_ID}'::uuid, '${FAILED_REJECT_LEAD_ID}'::uuid);
    DELETE FROM public.platform_users WHERE id = '${APPLICANT_ID}'::uuid;
  `);
}

describe.skipIf(!ENABLED)('leads lifecycle on named DEV', () => {
  let staff: Staff;
  let port: ReturnType<typeof import('./pgLeads').createPgLeadsPort>;
  let runWithDbStaffPrincipal: typeof import('@bersoncare/db-principal').runWithDbStaffPrincipal;

  beforeAll(async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = 'port-context';
    ({ runWithDbStaffPrincipal } = await import('@bersoncare/db-principal'));
    const { createPgLeadsPort } = await import('./pgLeads');
    port = createPgLeadsPort();
    staff = findDevStaff();
    cleanup();
    psql(`
      INSERT INTO public.platform_users (id, display_name, role)
      VALUES ('${APPLICANT_ID}'::uuid, 'LEADS DEV proof applicant', 'client');
      INSERT INTO public.leads
        (id, organization_id, platform_user_id, submitted_email, message_text, source_surface)
      VALUES
        ('${ACCEPT_LEAD_ID}'::uuid, '${staff.organizationId}'::uuid, '${APPLICANT_ID}'::uuid,
         'accept@example.test', 'accept proof', 'public_page'),
        ('${REJECT_LEAD_ID}'::uuid, '${staff.organizationId}'::uuid, '${APPLICANT_ID}'::uuid,
         'reject@example.test', 'reject proof', 'public_page'),
        ('${FAILED_REJECT_LEAD_ID}'::uuid, '${staff.organizationId}'::uuid, '${APPLICANT_ID}'::uuid,
         repeat('x', 321), 'failed reject proof', 'public_page');
    `);
  });

  afterAll(() => cleanup());

  it('accept creates exactly one enrollment while reject creates none and queues only one email', async () => {
    const asStaff = <T>(work: () => Promise<T>) =>
      runWithDbStaffPrincipal(
        {
          organizationId: staff.organizationId,
          platformUserId: staff.platformUserId,
          source: 'doctor.leads.change',
        },
        work,
      );

    await expect(
      asStaff(() => port.accept(staff.organizationId, ACCEPT_LEAD_ID, new Date().toISOString())),
    ).resolves.toMatchObject({ status: 'accepted_in_progress' });
    await expect(
      asStaff(() =>
        port.reject({
          organizationId: staff.organizationId,
          leadId: REJECT_LEAD_ID,
          comment: 'Не подходим по профилю',
          now: new Date().toISOString(),
        }),
      ),
    ).resolves.toMatchObject({ status: 'rejected' });
    await expect(
      asStaff(() =>
        port.reject({
          organizationId: staff.organizationId,
          leadId: REJECT_LEAD_ID,
          comment: null,
          now: new Date().toISOString(),
        }),
      ),
    ).rejects.toThrow('lead_status_transition_invalid');

    expect(
      psql(`
        SELECT
          (SELECT count(*) FROM public.org_enrollments
            WHERE organization_id = '${staff.organizationId}'::uuid
              AND platform_user_id = '${APPLICANT_ID}'::uuid),
          (SELECT count(*) FROM public.outgoing_delivery_queue
            WHERE event_id = 'lead.rejected:${REJECT_LEAD_ID}');
      `),
    ).toBe('1|1');
  });

  it('a queue failure rolls rejection back, so a later automatic retry can still claim it', async () => {
    await expect(
      runWithDbStaffPrincipal(
        {
          organizationId: staff.organizationId,
          platformUserId: staff.platformUserId,
          source: 'doctor.leads.change',
        },
        () =>
          port.reject({
            organizationId: staff.organizationId,
            leadId: FAILED_REJECT_LEAD_ID,
            comment: null,
            now: new Date().toISOString(),
          }),
      ),
    ).rejects.toThrow('outbound_message_recipient_invalid');

    expect(
      psql(`
        SELECT
          (SELECT status FROM public.leads WHERE id = '${FAILED_REJECT_LEAD_ID}'::uuid),
          (SELECT count(*) FROM public.outgoing_delivery_queue
            WHERE event_id = 'lead.rejected:${FAILED_REJECT_LEAD_ID}');
      `),
    ).toBe('new|0');
  });
});
