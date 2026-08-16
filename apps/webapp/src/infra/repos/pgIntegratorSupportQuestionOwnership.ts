import { and, eq, sql } from 'drizzle-orm';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import {
  supportConversations,
  supportQuestionMessages,
  supportQuestions,
} from '../../../db/schema';
import type { IntegratorSupportQuestionOwnershipPort } from '@/modules/messaging/ports';

function assertOrganizationPrincipal(organizationId: string): void {
  const currentOrganizationId = getCurrentDbPrincipalOrganizationId();
  if (!currentOrganizationId) throw new Error('organization_principal_required');
  if (currentOrganizationId !== organizationId) {
    throw new Error('organization_principal_mismatch');
  }
}

export const pgIntegratorSupportQuestionOwnershipPort: IntegratorSupportQuestionOwnershipPort = {
  async createQuestion(params) {
    assertOrganizationPrincipal(params.organizationId);
    return getDrizzle().transaction(async (tx) => {
      const [conversation] = await tx
        .select({ id: supportConversations.id })
        .from(supportConversations)
        .where(
          and(
            eq(supportConversations.id, params.conversationId),
            eq(supportConversations.organizationId, params.organizationId),
          ),
        )
        .limit(1);
      if (!conversation) throw new Error('support_conversation_not_found');

      const [question] = await tx
        .insert(supportQuestions)
        .values({
          integratorQuestionId: params.integratorQuestionId,
          conversationId: conversation.id,
          organizationId: params.organizationId,
          status: params.status,
          createdAt: params.createdAt,
        })
        .onConflictDoUpdate({
          target: supportQuestions.integratorQuestionId,
          set: {
            conversationId: conversation.id,
            organizationId: params.organizationId,
            status: params.status,
            updatedAt: sql`now()`,
          },
        })
        .returning({ id: supportQuestions.id });
      if (!question) throw new Error('support_question_write_failed');
      return question;
    });
  },

  async appendQuestionMessage(params) {
    assertOrganizationPrincipal(params.organizationId);
    return getDrizzle().transaction(async (tx) => {
      const [question] = await tx
        .select({ id: supportQuestions.id })
        .from(supportQuestions)
        .where(
          and(
            eq(supportQuestions.integratorQuestionId, params.integratorQuestionId),
            eq(supportQuestions.organizationId, params.organizationId),
          ),
        )
        .limit(1);
      if (!question) throw new Error('support_question_not_found');

      const [inserted] = await tx
        .insert(supportQuestionMessages)
        .values({
          organizationId: params.organizationId,
          integratorQuestionMessageId: params.integratorQuestionMessageId,
          questionId: question.id,
          senderRole: params.senderRole,
          text: params.text,
          createdAt: params.createdAt,
        })
        .onConflictDoNothing({ target: supportQuestionMessages.integratorQuestionMessageId })
        .returning({ id: supportQuestionMessages.id });
      if (inserted) return { id: inserted.id, created: true };

      const [existing] = await tx
        .select({ id: supportQuestionMessages.id })
        .from(supportQuestionMessages)
        .where(
          and(
            eq(
              supportQuestionMessages.integratorQuestionMessageId,
              params.integratorQuestionMessageId,
            ),
            eq(supportQuestionMessages.organizationId, params.organizationId),
          ),
        )
        .limit(1);
      if (!existing) throw new Error('support_question_message_conflict');
      return { id: existing.id, created: false };
    });
  },

  async markQuestionAnswered(params) {
    assertOrganizationPrincipal(params.organizationId);
    await getDrizzle().transaction(async (tx) => {
      const rows = await tx
        .update(supportQuestions)
        .set({ status: 'answered', answeredAt: params.answeredAt, updatedAt: sql`now()` })
        .where(
          and(
            eq(supportQuestions.integratorQuestionId, params.integratorQuestionId),
            eq(supportQuestions.organizationId, params.organizationId),
          ),
        )
        .returning({ id: supportQuestions.id });
      if (rows.length === 0) throw new Error('support_question_not_found');
    });
  },

  async recordDeliveryAttempt(params) {
    assertOrganizationPrincipal(params.organizationId);
    const result = await runWebappNamedRoot<{ payload: unknown }>(
      getWebappSqlDb(),
      'app.record_integrator_support_delivery_attempt(uuid,text,text,text,text,integer,text,text,timestamp with time zone)',
      [
        params.organizationId,
        params.integratorIntentEventId,
        params.correlationId,
        params.channelCode,
        params.status,
        params.attempt,
        params.reason,
        JSON.stringify(params.payloadJson),
        params.occurredAt,
      ],
      sql`SELECT app.record_integrator_support_delivery_attempt(
        ${params.organizationId}::uuid,
        ${params.integratorIntentEventId}::text,
        ${params.correlationId}::text,
        ${params.channelCode}::text,
        ${params.status}::text,
        ${params.attempt}::integer,
        ${params.reason}::text,
        ${JSON.stringify(params.payloadJson)}::text,
        ${params.occurredAt}::timestamptz
      ) AS payload`,
    );
    const payload = result.rows[0]?.payload;
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('support_delivery_attempt_write_failed');
    }
    const row = payload as Record<string, unknown>;
    if (row.ok !== true || typeof row.id !== 'string') {
      throw new Error(
        typeof row.code === 'string' ? row.code : 'support_delivery_attempt_write_failed',
      );
    }
    return { id: row.id, created: row.created === true };
  },
};
