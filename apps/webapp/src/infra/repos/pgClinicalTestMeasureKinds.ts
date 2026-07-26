import { asc, eq } from "drizzle-orm";
import { getCurrentDbPrincipal } from "@bersoncare/db-principal";
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

/**
 * A-6 / #1007 (docs/_TODO/NIGHT_PLAN_2026-07-26.md): this table has no `organization_id` at all —
 * the owner's FINAL scope decision (2026-06-17,
 * docs/_TODO/SAAS_FOUNDATION/scope-derivation/VERIFIED_SCOPE.md) deliberately left it OUT of the
 * 84-table needs-org-id list, i.e. it is a platform-owned catalog, not per-tenant. There is no
 * organization to scope a write to, so this only asserts a real, non-anonymous write principal is
 * active: `staff` (a doctor collaboratively inserting a brand-new label — insert-only, see
 * `upsertMeasureKindByLabel`, which can never edit or overwrite an existing row) or `platform` (the
 * operator managing/relabeling/reordering the shared catalog via
 * `requirePlatformOperationsApiContext`). Never widen this to accept the bootstrap principal.
 */
function assertStaffOrPlatformWritePrincipal(): void {
  const kind = getCurrentDbPrincipal()?.kind;
  if (kind !== "staff" && kind !== "platform") {
    throw new Error("staff_or_platform_principal_required");
  }
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
      assertStaffOrPlatformWritePrincipal();
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
      assertStaffOrPlatformWritePrincipal();
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
