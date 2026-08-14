/**
 * Disposable-Postgres proof (Б1/Б3, #1081): support communication via `createPgSupportCommunicationPort`
 * exercising real SQL, not a mock (only an in-memory fake backs route tests otherwise).
 *
 * Migrated off the shared dev DB (was `.devDb.integration.test.ts`, opt-in env flags never set
 * anywhere — never ran in CI). Note: `countUnreadUserMessagesForAdmin`'s type signature marks
 * `organizationId` optional, but the implementation throws `organization_id_required` without it —
 * the one real caller (`doctorSupportMessagingService.ts`) always supplies it from an authenticated
 * org principal, so this is a type-accuracy looseness, not a reachable crash; not chased further
 * here, out of this migration's scope.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool } from '@/infra/db/client';
import { runWebappPgText } from '@/infra/db/runWebappSql';
import { createPgSupportCommunicationPort } from '@/infra/repos/pgSupportCommunication';

const ORG_ID = '40000000-0000-4000-8000-000000000001';
const SPECIALIST_ID = '40000000-0000-4000-8000-000000000002';
const OTHER_SPECIALIST_ID = '40000000-0000-4000-8000-000000000003';
const VISIBILITY_ACTOR = {
  membershipRole: 'owner' as const,
  specialistId: null,
  canManageAllSpecialists: true,
};
let patientId: string;
let conversationId: string;

describe('pgSupportCommunication (disposable Postgres)', () => {
  beforeAll(async () => {
    await runWebappPgText(
      `ALTER TABLE be_organizations DISABLE ROW LEVEL SECURITY;
       ALTER TABLE be_organizations DISABLE TRIGGER be_organizations_reference_catalog_snapshot;
       ALTER TABLE platform_users DISABLE ROW LEVEL SECURITY;
       ALTER TABLE be_specialists DISABLE ROW LEVEL SECURITY;
       ALTER TABLE patient_specialist_links DISABLE ROW LEVEL SECURITY;
       ALTER TABLE support_conversations DISABLE ROW LEVEL SECURITY;
       ALTER TABLE support_conversation_messages DISABLE ROW LEVEL SECURITY;`,
    );
    await runWebappPgText(`INSERT INTO be_organizations (id, title) VALUES ($1, 'B3 support')`, [
      ORG_ID,
    ]);
    await runWebappPgText(
      `INSERT INTO be_specialists (id, organization_id, full_name, is_active)
       VALUES ($1::uuid, $3::uuid, 'Assigned specialist', true),
              ($2::uuid, $3::uuid, 'Other specialist', true)`,
      [SPECIALIST_ID, OTHER_SPECIALIST_ID, ORG_ID],
    );
    const patient = await runWebappPgText<{ id: string }>(
      `INSERT INTO platform_users (display_name, role) VALUES ($1, 'client') RETURNING id`,
      ['B3 support fixture patient'],
    );
    patientId = patient.rows[0]!.id;
    const conversation = await runWebappPgText<{ id: string }>(
      `INSERT INTO support_conversations
         (organization_id, platform_user_id, integrator_conversation_id, source, admin_scope, status, opened_at, last_message_at)
       VALUES ($1::uuid, $2::uuid, $3, 'telegram', 'support', 'open', now(), now())
       RETURNING id`,
      [ORG_ID, patientId, `b3-support-${patientId}`],
    );
    conversationId = conversation.rows[0]!.id;
    await runWebappPgText(
      `INSERT INTO patient_specialist_links
         (organization_id, patient_user_id, specialist_id, status, created_via)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'active', 'manual_assign')`,
      [ORG_ID, patientId, SPECIALIST_ID],
    );
    await runWebappPgText(
      `INSERT INTO support_conversation_messages
         (integrator_message_id, conversation_id, sender_role, message_type, text, source, created_at)
       VALUES ($1, $2::uuid, 'user', 'text', 'unread fixture message', 'telegram', now())`,
      [`b3-support-msg-${conversationId}`, conversationId],
    );
  });

  afterAll(async () => {
    await getPool().end();
  });

  it('listOpenConversationsForAdmin returns an array via runWebappPgText executor', async () => {
    const port = createPgSupportCommunicationPort();
    const list = await port.listOpenConversationsForAdmin({
      limit: 5,
      organizationId: ORG_ID,
      visibilityActor: VISIBILITY_ACTOR,
    });
    expect(Array.isArray(list)).toBe(true);
  });

  it('conversationExists is false for unknown uuid', async () => {
    const port = createPgSupportCommunicationPort();
    const exists = await port.conversationExists('00000000-0000-4000-8000-00000000ffff');
    expect(exists).toBe(false);
  });

  it('conversationExists is true for a real conversation', async () => {
    const port = createPgSupportCommunicationPort();
    const exists = await port.conversationExists(conversationId);
    expect(exists).toBe(true);
  });

  it('countUnreadUserMessagesForAdmin counts the real unread fixture message', async () => {
    const port = createPgSupportCommunicationPort();
    const n = await port.countUnreadUserMessagesForAdmin({
      organizationId: ORG_ID,
      visibilityActor: VISIBILITY_ACTOR,
    });
    expect(n).toBe(1);
  });

  it('limits conversation list and unread count to patients assigned to the specialist', async () => {
    const port = createPgSupportCommunicationPort();
    const assignedActor = {
      membershipRole: 'doctor' as const,
      specialistId: SPECIALIST_ID,
      canManageAllSpecialists: false,
    };
    const otherActor = {
      membershipRole: 'doctor' as const,
      specialistId: OTHER_SPECIALIST_ID,
      canManageAllSpecialists: false,
    };

    await expect(
      port.listOpenConversationsForAdmin({
        limit: 5,
        organizationId: ORG_ID,
        visibilityActor: assignedActor,
      }),
    ).resolves.toEqual([expect.objectContaining({ conversationId })]);
    await expect(
      port.listOpenConversationsForAdmin({
        limit: 5,
        organizationId: ORG_ID,
        visibilityActor: otherActor,
      }),
    ).resolves.toEqual([]);
    await expect(
      port.countUnreadUserMessagesForAdmin({
        organizationId: ORG_ID,
        visibilityActor: assignedActor,
      }),
    ).resolves.toBe(1);
    await expect(
      port.countUnreadUserMessagesForAdmin({
        organizationId: ORG_ID,
        visibilityActor: otherActor,
      }),
    ).resolves.toBe(0);
  });
});
