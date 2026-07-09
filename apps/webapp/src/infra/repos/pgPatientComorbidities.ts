/**
 * Pg implementation of PatientComorbiditiesPort.
 * Uses Drizzle ORM; all writes are scoped by patientUserId.
 */

import { and, asc, eq } from "drizzle-orm";
import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { runWebappTransaction } from "@/infra/db/runWebappSql";
import type {
  AddComorbidityInput,
  Comorbidity,
  EditComorbidityTextInput,
  PatientComorbiditiesPort,
} from "@/modules/patient-comorbidities/ports";
import { patientComorbidity } from "../../../db/schema/patientComorbidities";

function toComorbidity(r: typeof patientComorbidity.$inferSelect): Comorbidity {
  return {
    id: r.id,
    text: r.text,
    since: r.since ?? null,
    status: r.status as "active" | "removed",
    createdAt: r.createdAt,
    removedAt: r.removedAt ?? null,
  };
}

export function createPgPatientComorbiditiesPort(): PatientComorbiditiesPort {
  return {
    async listByPatient(
      patientUserId: string,
      status: "active" | "removed" | "all",
    ): Promise<Comorbidity[]> {
      const db = getDrizzle();
      const condition =
        status === "all"
          ? eq(patientComorbidity.patientUserId, patientUserId)
          : and(
              eq(patientComorbidity.patientUserId, patientUserId),
              eq(patientComorbidity.status, status),
            );
      const rows = await db
        .select()
        .from(patientComorbidity)
        .where(condition)
        .orderBy(asc(patientComorbidity.createdAt));
      return rows.map(toComorbidity);
    },

    async add(input: AddComorbidityInput): Promise<Comorbidity> {
      const organizationId = getCurrentDbPrincipalOrganizationId() ?? null;
      const inserted = await runWebappTransaction((tx) =>
        tx
          .insert(patientComorbidity)
          .values({
            organizationId,
            patientUserId: input.patientUserId,
            text: input.text,
            since: input.since ?? null,
            status: "active",
            createdBy: input.createdBy,
          })
          .returning(),
      );
      const row = inserted[0];
      if (!row) throw new Error("patient_comorbidity insert failed");
      return toComorbidity(row);
    },

    async editText(input: EditComorbidityTextInput): Promise<boolean> {
      const set: Partial<{ text: string; since: string | null }> = {};
      if (input.text !== undefined) set.text = input.text;
      if (input.since !== undefined) set.since = input.since ?? null;
      if (Object.keys(set).length === 0) return false;
      const updated = await runWebappTransaction((tx) =>
        tx
          .update(patientComorbidity)
          .set(set)
          .where(
            and(
              eq(patientComorbidity.id, input.comorbidityId),
              eq(patientComorbidity.patientUserId, input.patientUserId),
            ),
          )
          .returning({ id: patientComorbidity.id }),
      );
      return updated.length > 0;
    },

    async markRemoved(patientUserId: string, comorbidityId: string): Promise<boolean> {
      const updated = await runWebappTransaction((tx) =>
        tx
          .update(patientComorbidity)
          .set({ status: "removed", removedAt: new Date().toISOString() })
          .where(
            and(
              eq(patientComorbidity.id, comorbidityId),
              eq(patientComorbidity.patientUserId, patientUserId),
              eq(patientComorbidity.status, "active"),
            ),
          )
          .returning({ id: patientComorbidity.id }),
      );
      return updated.length > 0;
    },

    async restore(patientUserId: string, comorbidityId: string): Promise<boolean> {
      const updated = await runWebappTransaction((tx) =>
        tx
          .update(patientComorbidity)
          .set({ status: "active", removedAt: null })
          .where(
            and(
              eq(patientComorbidity.id, comorbidityId),
              eq(patientComorbidity.patientUserId, patientUserId),
              eq(patientComorbidity.status, "removed"),
            ),
          )
          .returning({ id: patientComorbidity.id }),
      );
      return updated.length > 0;
    },
  };
}
