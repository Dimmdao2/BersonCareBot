import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDrizzle, type DrizzleDb } from '@/app-layer/db/drizzle';
import { orgEnrollments } from '../../../db/schema/bookingEngine';
import { leads } from '../../../db/schema/leads';
import { logger, serializeError } from '@/infra/logging/logger';
import { reportEmptyAudience } from '@/modules/operator-alerts/emptyAudienceRuntime';
import { createPgOutboundMessageQueue } from '@/infra/repos/pgOutboundMessageQueue';
import type { LeadsPort } from '@/modules/leads/ports';
import type { Lead } from '@/modules/leads/types';
import { leadRejectionNotification } from '@/modules/leads/rejectionNotification';

/** Короткий стабильный ключ места для операторских сигналов, без персональных данных. */
const LEAD_REJECTED_TOPIC = 'lead.rejected' as const;

type Transaction = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0];
type Executor = DrizzleDb | Transaction;

function mapLead(row: typeof leads.$inferSelect): Lead {
  return row as typeof row & Pick<Lead, 'status' | 'sourceSurface'>;
}

async function readLead(
  db: Executor,
  organizationId: string,
  leadId: string,
): Promise<Lead | null> {
  const rows = await db
    .select()
    .from(leads)
    .where(and(eq(leads.organizationId, organizationId), eq(leads.id, leadId)))
    .limit(1);
  return rows[0] ? mapLead(rows[0]) : null;
}

export function createPgLeadsPort(): LeadsPort {
  return {
    async create(input, now) {
      const rows = await getDrizzle()
        .insert(leads)
        .values({
          organizationId: input.organizationId,
          platformUserId: input.platformUserId,
          submittedFirstName: input.firstName,
          submittedLastName: input.lastName,
          submittedPatronymic: input.patronymic,
          submittedEmail: input.emailNormalized,
          submittedPhone: input.phoneNormalized,
          preferredContact: input.preferredContact,
          messageText: input.messageText,
          sourceSurface: input.sourceSurface,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!rows[0]) throw new Error('lead_create_failed');
      return mapLead(rows[0]);
    },
    async list(input) {
      const filters = [eq(leads.organizationId, input.organizationId)];
      if (!input.includeArchived) filters.push(isNull(leads.archivedAt));
      const rows = await getDrizzle()
        .select()
        .from(leads)
        .where(and(...filters))
        .orderBy(desc(leads.createdAt), desc(leads.id))
        .limit(input.limit);
      return rows.map(mapLead);
    },
    get(organizationId, leadId) {
      return readLead(getDrizzle(), organizationId, leadId);
    },
    async accept(organizationId, leadId, now) {
      return getDrizzle().transaction(async (tx) => {
        const transitioned = await tx
          .update(leads)
          .set({ status: 'accepted_in_progress', acceptedAt: now, updatedAt: now })
          .where(
            and(
              eq(leads.organizationId, organizationId),
              eq(leads.id, leadId),
              eq(leads.status, 'new'),
            ),
          )
          .returning();
        if (!transitioned[0]) {
          const current = await readLead(tx, organizationId, leadId);
          if (!current || current.status === 'accepted_in_progress') return current;
          throw new Error('lead_status_transition_invalid');
        }
        const current = mapLead(transitioned[0]);
        await tx
          .insert(orgEnrollments)
          .values({
            organizationId,
            platformUserId: current.platformUserId,
            status: 'active',
            portalActivatedAt: now,
            portalActivatedVia: 'public_lead_verified_email',
          })
          .onConflictDoUpdate({
            target: [orgEnrollments.organizationId, orgEnrollments.platformUserId],
            set: {
              status: 'active',
            },
          });
        return current;
      });
    },
    async close(organizationId, leadId, now) {
      const rows = await getDrizzle()
        .update(leads)
        .set({ status: 'accepted_closed', closedAt: now, updatedAt: now })
        .where(
          and(
            eq(leads.organizationId, organizationId),
            eq(leads.id, leadId),
            eq(leads.status, 'accepted_in_progress'),
          ),
        )
        .returning();
      if (rows[0]) return mapLead(rows[0]);
      const current = await readLead(getDrizzle(), organizationId, leadId);
      if (!current || current.status === 'accepted_closed') return current;
      throw new Error('lead_status_transition_invalid');
    },
    async reject(input) {
      const current = await readLead(getDrizzle(), input.organizationId, input.leadId);
      if (!current) return null;
      if (current.status !== 'new') throw new Error('lead_status_transition_invalid');
      // Переход и письмо — ДВА отдельных обращения, а не одна транзакция. Принятый контекст порта
      // один на транзакцию (PK `app_ext.accepted_port_contexts` — база+backend+xid), и у корня
      // доставки он именованный: под ним ЛЮБОЕ обращение к `public.leads` отказано гейтом
      // `rev10_context_gate_27` («accepted port context required», проверено живьём на DEV 14.09).
      // Поэтому здесь тот же порядок, что у подтверждения брони: сначала состояние, затем
      // постановка в очередь. Повтор невозможен из-за CAS по `status='new'`, а сама очередь
      // идемпотентна по ключу заявки.
      const transitioned = await getDrizzle()
        .update(leads)
        .set({
          status: 'rejected',
          rejectionComment: input.comment,
          rejectedAt: input.now,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(leads.organizationId, input.organizationId),
            eq(leads.id, input.leadId),
            eq(leads.status, 'new'),
          ),
        )
        .returning();
      if (!transitioned[0]) throw new Error('lead_status_transition_invalid');
      const rejected = mapLead(transitioned[0]);
      const notification = leadRejectionNotification(input.comment);
      try {
        const enqueued = await createPgOutboundMessageQueue().enqueue({
          organizationId: input.organizationId,
          purpose: 'lead.rejected',
          idempotencyKey: input.leadId,
          channel: 'email',
          recipient: current.submittedEmail,
          content: {
            text: notification.text,
            subject: notification.subject,
            senderScope: 'clinic_required',
            audience: 'patient',
          },
        });
        logger.info(
          { event: 'lead.rejection_email.enqueued', leadId: input.leadId, enqueued },
          enqueued ? 'lead rejection email queued' : 'lead rejection email already queued',
        );
      } catch (err) {
        // Отказ по заявке уже зафиксирован, и повторить его нельзя: CAS по `status='new'` закрыл
        // дверь навсегда. Значит отказ ДОСТАВКИ здесь — это «человек никогда не узнает», и молчать
        // о нём нельзя. Уходит тем же портом, что и пустая аудитория у подтверждения брони:
        // итог для человека тот же — он не получил.
        logger.error(
          {
            scope: 'lead_rejection_delivery',
            topic: LEAD_REJECTED_TOPIC,
            organizationId: input.organizationId,
            err: serializeError(err),
          },
          'lead rejection email could not be queued',
        );
        await reportEmptyAudience({
          topic: LEAD_REJECTED_TOPIC,
          severity: 'user_facing',
          channels: ['email'],
          context: { organizationId: input.organizationId, reason: 'enqueue_failed' },
        });
      }
      return rejected;
    },
    async setArchived(organizationId, leadId, archived, now) {
      const rows = await getDrizzle()
        .update(leads)
        .set({ archivedAt: archived ? now : null, updatedAt: now })
        .where(and(eq(leads.organizationId, organizationId), eq(leads.id, leadId)))
        .returning();
      return rows[0] ? mapLead(rows[0]) : null;
    },
  };
}
