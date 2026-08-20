/**
 * Opt-in REAL-Postgres RLS proof for the D5 direct write, added after an independent audit found (and
 * this fix addresses) a live defect: `upsertReminderRuleDirect` was RLS-DENIED under the real
 * "integrator" principal (`runWithIntegratorPrincipal`) — the exact shape the webapp's
 * `reminder.rule.upserted` write path runs under for an already-known user (organization_id
 * SET, patient_user_id NULL, `SET ROLE app_patient`). Mock-based unit tests cannot catch this: the mock
 * DbPort never applies a real PostgreSQL role/RLS check, so a wrong-principal write silently "succeeds"
 * against the mock regardless. This test talks to a REAL Postgres (the TEST database on this box) via
 * the app's OWN `createDbPort()` + `@bersoncare/db-principal` signed-context mechanism (so principal
 * application at pool-client-checkout is exercised exactly as in production), proving:
 *   1. The BARE integrator login (no principal at all) is denied.
 *   2. The real "integrator" principal (org set, patient NULL) WITHOUT the fix's org-principal re-wrap
 *      is ALSO denied (this is the regression the audit found).
 *   3. The SAME "integrator" principal WITH the fix's org-principal re-wrap (mirrors
 *      `writeDirectPublic` in directPublic/writePort.ts) SUCCEEDS, with the full field set and a
 *      non-NULL organization_id.
 * Verification/cleanup reads also go through `createDbPort()` under an explicit org principal (the
 * `bcb_test_integrator_login` role cannot SELECT a FORCE-RLS public table at all without one — same
 * defect class) rather than a superuser bypass, so the whole test stays inside the real grant/RLS
 * surface the app itself runs under.
 *
 *   USE_REAL_DATABASE=1 RUN_REMINDER_RULES_RLS_TEST=1 DB_PRINCIPAL_CONTEXT_MODE=locked \
 *   DATABASE_URL=<TEST bcb_test_integrator_login connection string> \
 *   DB_PRINCIPAL_SIGNING_SECRET=<TEST DB_PRINCIPAL_SIGNING_SECRET> \
 *   pnpm exec vitest run src/infra/db/directPublic/writeReminderRulesDirect.rls.integration.test.ts
 *
 * DB_PRINCIPAL_CONTEXT_MODE=locked is REQUIRED — without it `@bersoncare/db-principal` never installs
 * the signed context / SET ROLE at all (this repo's vitest.setup.ts sets no default for this var), so
 * every assertion in this file would fail for the WRONG reason (no principal applied at all, not the
 * RLS behavior under a real one).
 *
 * Never run against prod (assertTestDb below refuses any database name that isn't test-shaped).
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
  Boolean((process.env.DATABASE_URL ?? '').trim()) &&
  Boolean((process.env.DB_PRINCIPAL_SIGNING_SECRET ?? '').trim());

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
      if (!/_test$/i.test(n)) {
        throw new Error(`refusing: current_database="${n}" — expected a *_test database`);
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
