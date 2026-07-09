import { asc, eq } from "drizzle-orm";
import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { runDrizzleMutationTransaction } from "@/infra/db/drizzleMutationTx";
import { clinicalTestMeasureKinds } from "../../../db/schema/clinicalTests";
import type { ClinicalTestMeasureKindsPort, ClinicalTestMeasureKindRow } from "@/modules/tests/measureKindsPorts";
import { measureKindLabelToCode } from "@/modules/tests/measureKindCode";

function mapRow(row: typeof clinicalTestMeasureKinds.$inferSelect): ClinicalTestMeasureKindRow {
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    sortOrder: row.sortOrder,
  };
}

function currentPrincipalOrganizationId(): string {
  const principalOrganizationId = getCurrentDbPrincipalOrganizationId();
  if (!principalOrganizationId) {
    throw new Error("organization_principal_required");
  }
  return principalOrganizationId;
}

export function createPgClinicalTestMeasureKindsPort(): ClinicalTestMeasureKindsPort {
  return {
    async listMeasureKinds(): Promise<ClinicalTestMeasureKindRow[]> {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(clinicalTestMeasureKinds)
        .orderBy(asc(clinicalTestMeasureKinds.sortOrder), asc(clinicalTestMeasureKinds.label));
      return rows.map(mapRow);
    },

    async upsertMeasureKindByLabel(label: string): Promise<{ row: ClinicalTestMeasureKindRow; created: boolean }> {
      currentPrincipalOrganizationId();
      const db = getDrizzle();
      const code = measureKindLabelToCode(label);
      const existing = await db
        .select()
        .from(clinicalTestMeasureKinds)
        .where(eq(clinicalTestMeasureKinds.code, code))
        .limit(1);
      if (existing[0]) {
        return { row: mapRow(existing[0]), created: false };
      }
      const trimmed = label.trim();
      const rows = await runDrizzleMutationTransaction((tx) =>
        tx
          .insert(clinicalTestMeasureKinds)
          .values({
            code,
            label: trimmed,
            sortOrder: 0,
          })
          .returning(),
      );
      return { row: mapRow(rows[0]), created: true };
    },

    async saveMeasureKindsOrderAndLabels(
      updates: { id: string; label: string; sortOrder: number }[],
    ): Promise<ClinicalTestMeasureKindRow[]> {
      const db = getDrizzle();
      currentPrincipalOrganizationId();
      await runDrizzleMutationTransaction(async (tx) => {
        for (const u of updates) {
          await tx
            .update(clinicalTestMeasureKinds)
            .set({ label: u.label, sortOrder: u.sortOrder })
            .where(eq(clinicalTestMeasureKinds.id, u.id));
        }
      });
      const rows = await db
        .select()
        .from(clinicalTestMeasureKinds)
        .orderBy(asc(clinicalTestMeasureKinds.sortOrder), asc(clinicalTestMeasureKinds.label));
      return rows.map(mapRow);
    },
  };
}

export const pgClinicalTestMeasureKindsPort = createPgClinicalTestMeasureKindsPort();
