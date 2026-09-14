import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDrizzle, type DrizzleDb } from '@/app-layer/db/drizzle';
import { orgEnrollments } from '../../../db/schema/bookingEngine';
import { leadBlocks, leads } from '../../../db/schema/leads';
import type { LeadsPort } from '@/modules/leads/ports';
import type { Lead } from '@/modules/leads/types';

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
      return getDrizzle().transaction(async (tx) => {
        const blocked = await tx
          .select({ id: leadBlocks.id })
          .from(leadBlocks)
          .where(
            and(
              eq(leadBlocks.organizationId, input.organizationId),
              eq(leadBlocks.platformUserId, input.platformUserId),
            ),
          )
          .limit(1);
        if (blocked[0]) return null;
        const rows = await tx
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
        return rows[0] ? mapLead(rows[0]) : null;
      });
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
      return getDrizzle().transaction(async (tx) => {
        const transitioned = await tx
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
        const current = transitioned[0]
          ? mapLead(transitioned[0])
          : await readLead(tx, input.organizationId, input.leadId);
        if (!current) return null;
        if (current.status !== 'rejected') throw new Error('lead_status_transition_invalid');
        if (input.blockApplicant) {
          await tx
            .insert(leadBlocks)
            .values({
              organizationId: input.organizationId,
              platformUserId: current.platformUserId,
              sourceLeadId: current.id,
              createdAt: input.now,
            })
            .onConflictDoNothing({
              target: [leadBlocks.organizationId, leadBlocks.platformUserId],
            });
        }
        return current;
      });
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
