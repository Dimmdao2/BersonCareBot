import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import { pgReferencesPort } from '@/infra/repos/pgReferences';
import type {
  ClinicalTestMeasureKindsPort,
  ClinicalTestMeasureKindRow,
} from '@/modules/tests/measureKindsPorts';
import { measureKindLabelToCode } from '@/modules/tests/measureKindCode';

const CATEGORY_CODE = 'clinical_test_measure_kind';

type ReferenceItemRow = Awaited<
  ReturnType<typeof pgReferencesPort.listActiveItemsByCategoryCode>
>[number];

function mapRow(row: ReferenceItemRow): ClinicalTestMeasureKindRow {
  return {
    id: row.id,
    code: row.code,
    label: row.title,
    sortOrder: row.sortOrder,
  };
}

/**
 * Measurement kinds live in the current clinic's reference catalog. Only a resolved staff
 * workspace may mutate that copy; the platform principal deliberately has no clinical access.
 */
function assertStaffWritePrincipal(): void {
  const kind = getCurrentDbPrincipal()?.kind;
  if (kind !== 'staff') {
    throw new Error('staff_principal_required');
  }
}

export function createPgClinicalTestMeasureKindsPort(): ClinicalTestMeasureKindsPort {
  return {
    async listMeasureKinds(): Promise<ClinicalTestMeasureKindRow[]> {
      const rows = await pgReferencesPort.listActiveItemsByCategoryCode(CATEGORY_CODE);
      return rows.map(mapRow);
    },

    async upsertMeasureKindByLabel(
      label: string,
    ): Promise<{ row: ClinicalTestMeasureKindRow; created: boolean }> {
      assertStaffWritePrincipal();
      const code = measureKindLabelToCode(label);
      const current = await pgReferencesPort.listItemsForManagementByCategoryCode(CATEGORY_CODE);
      const existing = current.find((row) => row.code === code);
      if (existing) return { row: mapRow(existing), created: false };
      const row = await pgReferencesPort.insertItemStaff({
        categoryCode: CATEGORY_CODE,
        code,
        title: label.trim(),
      });
      return { row: mapRow(row), created: true };
    },

    async saveMeasureKindsOrderAndLabels(
      updates: { id: string; label: string; sortOrder: number }[],
    ): Promise<ClinicalTestMeasureKindRow[]> {
      assertStaffWritePrincipal();
      const current = await pgReferencesPort.listItemsForManagementByCategoryCode(CATEGORY_CODE);
      const updateById = new Map(updates.map((row) => [row.id, row]));
      await pgReferencesPort.saveCatalog(CATEGORY_CODE, {
        updates: current.map((row) => {
          const update = updateById.get(row.id);
          if (!update) throw new Error('clinical_test_measure_kinds_snapshot_invalid');
          return {
            id: row.id,
            code: row.code,
            title: update.label,
            sortOrder: update.sortOrder,
            isActive: row.isActive,
          };
        }),
        additions: [],
      });
      return (await pgReferencesPort.listActiveItemsByCategoryCode(CATEGORY_CODE)).map(mapRow);
    },
  };
}

export const pgClinicalTestMeasureKindsPort = createPgClinicalTestMeasureKindsPort();
