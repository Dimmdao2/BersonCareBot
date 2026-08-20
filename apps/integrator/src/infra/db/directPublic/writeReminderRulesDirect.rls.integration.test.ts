/**
 * Opt-in REAL-Postgres RLS proof for the D5 direct write, added after an independent audit found (and
 * this fix addresses) a live defect: `upsertReminderRuleDirect` was RLS-DENIED under the real
 * "integrator" principal (`runWithIntegratorPrincipal`) — the exact shape the webapp's
 * `reminder.rule.upserted` write path runs under for an already-known user. Mock-based unit tests cannot catch this: the mock
 * DbPort never applies a real PostgreSQL role/RLS check, so a wrong-principal write silently "succeeds"
 * against the mock regardless. This test talks to a REAL named DEV/TEST Postgres through the app's OWN
 * `createDbPort()` port-context path, so every query runs inside a transaction opened by
 * `app.begin_port_context`, proving:
 *   1. A call with no declared principal is denied before any unscoped SQL can run.
 *   2. The real `app_integrator_request` principal WITHOUT the fix's org-principal re-wrap is ALSO
 *      denied (this is the regression the audit found).
 *   3. The SAME "integrator" principal WITH the fix's org-principal re-wrap (mirrors
 *      `writeDirectPublic` in directPublic/writePort.ts) enters `app_tenant_service` and SUCCEEDS,
 *      with the full field set and a non-NULL organization_id.
 * Verification/cleanup reads also go through `createDbPort()` under the same explicit organization
 * principal rather than a superuser bypass, so the whole test stays inside the real grant/RLS surface.
 *
 *   set -a
 *   source /home/dev/dev-projects/BersonCareBot/.env
 *   set +a
 *   USE_REAL_DATABASE=1 RUN_REMINDER_RULES_RLS_TEST=1 \
 *     pnpm --dir apps/integrator exec vitest run \
 *     src/infra/db/directPublic/writeReminderRulesDirect.rls.integration.test.ts
 *
 * Never run against prod (assertTestDb below permits only bcb_webapp_dev or a *_test database).
 * Cleans up every row it writes; nothing is committed permanently.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { createDbPort } from '../client.js';
import { upsertReminderRuleDirect } from './writeReminderRulesDirect.js';
import { writeDirectPublic } from './writePort.js';
import {
  runWithIntegratorPrincipal,
  runWithOrganizationPrincipal,
} from '../../principal/organizationPrincipal.js';

const enabled =
  process.env.RUN_REMINDER_RULES_RLS_TEST === '1' &&
  process.env.USE_REAL_DATABASE === '1' &&
  process.env.DB_PRINCIPAL_CONTEXT_MODE === 'port-context' &&
  Boolean((process.env.INTEGRATOR_DB_URL ?? '').trim());

describe.skipIf(!enabled)(
  'upsertReminderRuleDirect RLS under the real integrator principal (opt-in, real Postgres)',
  () => {
    // Real TEST fixture: a platform user with exactly one active org_enrollments row. See D5 report
    // (commit 384e7ca29) for provenance — same fixture used for the live manual audit re-verification.
    const ORG_A = 'a0000000-0000-4000-8000-000000000001';
    const FIXTURE_INTEGRATOR_USER_ID = '126';
    const writtenRuleIds: string[] = [];

    async function assertTestDb(): Promise<void> {
      const r = await runWithOrganizationPrincipal(ORG_A, () =>
        createDbPort().query<{ n: string }>('SELECT current_database() AS n', []),
      );
      const n = r.rows[0]?.n ?? '';
      if (n !== 'bcb_webapp_dev' && !/_test$/i.test(n)) {
        throw new Error(
          `refusing: current_database="${n}" — expected bcb_webapp_dev or a *_test database`,
        );
      }
    }

    function ruleInput(id: string) {
      writtenRuleIds.push(id);
      return {
        integratorUserId: FIXTURE_INTEGRATOR_USER_ID,
        integratorRuleId: id,
        category: 'lfk' as const,
        isEnabled: true,
        scheduleType: 'interval_window',
        timezone: 'Europe/Moscow',
        intervalMinutes: 60,
        windowStartMinute: 480,
        windowEndMinute: 1320,
        daysMask: '1111111',
        contentMode: 'none' as const,
        linkedObjectType: null,
        linkedObjectId: null,
        customTitle: null,
        customText: null,
        scheduleData: undefined,
        reminderIntent: null,
        quietHoursStartMinute: null,
        quietHoursEndMinute: null,
        notificationTopicCode: undefined,
      };
    }

    afterAll(async () => {
      await assertTestDb();
      if (writtenRuleIds.length > 0) {
        await runWithOrganizationPrincipal(ORG_A, () =>
          createDbPort().query(
            'DELETE FROM public.reminder_rules WHERE integrator_rule_id = ANY($1)',
            [writtenRuleIds],
          ),
        );
      }
    });

    it('bare login (no principal at all) is denied', async () => {
      await assertTestDb();
      const id = `rls-it-bare-${Date.now()}`;
      await expect(upsertReminderRuleDirect(createDbPort(), ruleInput(id))).rejects.toThrow();
    });

    it('REGRESSION GUARD: the real integrator principal (org set, patient NULL) WITHOUT the org-principal re-wrap is denied', async () => {
      const id = `rls-it-unfixed-${Date.now()}`;
      await expect(
        runWithIntegratorPrincipal(
          {
            organizationId: ORG_A,
            integratorUserId: FIXTURE_INTEGRATOR_USER_ID,
            source: 'rls-integration-test',
          },
          () => upsertReminderRuleDirect(createDbPort(), ruleInput(id)),
        ),
      ).rejects.toThrow();
    });

    it('FIX PROOF: the real integrator principal WITH the org-principal re-wrap succeeds, full field set + non-NULL org', async () => {
      const id = `rls-it-fixed-${Date.now()}`;
      const result = await runWithIntegratorPrincipal(
        {
          organizationId: ORG_A,
          integratorUserId: FIXTURE_INTEGRATOR_USER_ID,
          source: 'rls-integration-test',
        },
        () =>
          writeDirectPublic('reminder-rule-upsert', () =>
            upsertReminderRuleDirect(createDbPort(), {
              ...ruleInput(id),
              linkedObjectType: 'lfk_complex',
              linkedObjectId: 'complex-rls-it',
              reminderIntent: 'exercises',
              notificationTopicCode: 'training_reminders',
            }),
          ),
      );
      expect(result.organizationId).toBe(ORG_A);
      expect(result.platformUserId).toBeTruthy();

      const row = await runWithOrganizationPrincipal(ORG_A, () =>
        createDbPort().query<{
          organization_id: string;
          platform_user_id: string;
          linked_object_type: string;
          notification_topic_code: string;
        }>(
          'SELECT organization_id, platform_user_id, linked_object_type, notification_topic_code FROM public.reminder_rules WHERE integrator_rule_id = $1',
          [id],
        ),
      );
      expect(row.rows[0]).toMatchObject({
        organization_id: ORG_A,
        platform_user_id: result.platformUserId,
        linked_object_type: 'lfk_complex',
        notification_topic_code: 'training_reminders',
      });
    });
  },
);
