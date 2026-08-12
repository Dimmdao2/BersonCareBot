/**
 * PostgreSQL implementation of ReferencesPort (Stage 6 reference_categories / reference_items).
 */
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import { sql } from 'drizzle-orm';
import {
  getWebappSqlDb,
  runWebappNamedRoot,
  runWebappPgText,
  runWebappTransaction,
} from '@/infra/db/runWebappSql';
import type { WebappSqlTransactionExecutor } from '@/infra/db/runWebappSql';
import { toIsoStringSafe } from '@/shared/lib/toIsoStringSafe';
import type { ReferencesPort } from '@/modules/references/ports';
import type { ReferenceCategory, ReferenceItem } from '@/modules/references/types';

function currentPrincipalOrganizationId(): string {
  const principalOrganizationId = getCurrentDbPrincipalOrganizationId();
  if (!principalOrganizationId) {
    throw new Error('organization_principal_required');
  }
  return principalOrganizationId;
}

function currentWriteOrganizationId(...fallbacks: (string | null | undefined)[]): string {
  const principalOrganizationId = currentPrincipalOrganizationId();
  const fallbackOrganizationIds = fallbacks.filter((x): x is string => Boolean(x));
  const fallbackOrganizationId = fallbackOrganizationIds[0] ?? null;
  const hasFallbackMismatch = fallbackOrganizationIds.some((id) => id !== fallbackOrganizationId);
  if (
    hasFallbackMismatch ||
    (fallbackOrganizationId && principalOrganizationId !== fallbackOrganizationId)
  ) {
    throw new Error('organization_principal_mismatch');
  }
  return principalOrganizationId;
}

async function runPrincipalReferenceTransaction<T>(
  fn: (tx: WebappSqlTransactionExecutor, organizationId: string) => Promise<T>,
): Promise<T> {
  const organizationId = currentPrincipalOrganizationId();
  return runWebappTransaction(async (tx) => {
    await runWebappPgText(`SELECT set_config('app.org', $1, true)`, [organizationId], tx);
    return fn(tx, organizationId);
  });
}

type ReferenceCategoryRow = {
  id: string;
  code: string;
  title: string;
  is_user_extensible: boolean;
  organization_id: string | null;
  tenant_id: string | null;
};

function rowCat(row: {
  id: string;
  code: string;
  title: string;
  is_user_extensible: boolean;
  organization_id?: string | null;
  tenant_id: string | null;
}): ReferenceCategory {
  return {
    id: String(row.id),
    code: row.code,
    title: row.title,
    isUserExtensible: row.is_user_extensible,
    tenantId: row.tenant_id ? String(row.tenant_id) : null,
  };
}

function rowItem(row: {
  id: string;
  category_id: string;
  code: string;
  title: string;
  sort_order: number;
  is_active: boolean;
  deleted_at: Date | string | null;
  meta_json: Record<string, unknown>;
}): ReferenceItem {
  const deletedAt = row.deleted_at;
  return {
    id: String(row.id),
    categoryId: String(row.category_id),
    code: row.code,
    title: row.title,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    deletedAt:
      deletedAt == null
        ? null
        : typeof deletedAt === 'string'
          ? deletedAt
          : toIsoStringSafe(deletedAt),
    metaJson: row.meta_json ?? {},
  };
}

export const pgReferencesPort: ReferencesPort = {
  async listPublicBaselineItemsByCategoryCode(categoryCode) {
    const res = await runWebappNamedRoot<{
      id: string;
      category_id: string;
      code: string;
      title: string;
      sort_order: number;
      is_active: boolean;
      deleted_at: Date | string | null;
      meta_json: Record<string, unknown>;
    }>(
      getWebappSqlDb(),
      'app.get_public_reference_baseline(text)',
      [categoryCode],
      sql`SELECT id, category_id, code, title, sort_order, is_active, deleted_at, meta_json
          FROM app.get_public_reference_baseline(${categoryCode}::text)`,
    );
    return res.rows.map(rowItem);
  },

  async listCategories() {
    const organizationId = currentPrincipalOrganizationId();
    const res = await runWebappPgText<ReferenceCategoryRow>(
      `SELECT id, code, title, is_user_extensible, organization_id, tenant_id
       FROM reference_categories
       WHERE organization_id = $1::uuid
       ORDER BY title ASC`,
      [organizationId],
    );
    return res.rows.map(rowCat);
  },

  async findCategoryByCode(categoryCode) {
    const organizationId = currentPrincipalOrganizationId();
    const res = await runWebappPgText<ReferenceCategoryRow>(
      `SELECT id, code, title, is_user_extensible, organization_id, tenant_id
       FROM reference_categories WHERE code = $1 AND organization_id = $2::uuid`,
      [categoryCode, organizationId],
    );
    return res.rows[0] ? rowCat(res.rows[0]) : null;
  },

  async listActiveItemsByCategoryCode(categoryCode) {
    const organizationId = currentPrincipalOrganizationId();
    const res = await runWebappPgText<{
      id: string;
      category_id: string;
      code: string;
      title: string;
      sort_order: number;
      is_active: boolean;
      deleted_at: Date | string | null;
      meta_json: Record<string, unknown>;
    }>(
      `SELECT i.id, i.category_id, i.code, i.title, i.sort_order, i.is_active, i.deleted_at, i.meta_json
       FROM reference_items i
       JOIN reference_categories c ON c.id = i.category_id
       WHERE c.code = $1 AND c.organization_id = $2::uuid
         AND i.organization_id = $2::uuid AND i.is_active = true AND i.deleted_at IS NULL
       ORDER BY i.sort_order ASC, i.title ASC`,
      [categoryCode, organizationId],
    );
    return res.rows.map(rowItem);
  },

  async listItemsForManagementByCategoryCode(categoryCode) {
    const organizationId = currentPrincipalOrganizationId();
    const res = await runWebappPgText<{
      id: string;
      category_id: string;
      code: string;
      title: string;
      sort_order: number;
      is_active: boolean;
      deleted_at: Date | string | null;
      meta_json: Record<string, unknown>;
    }>(
      `SELECT i.id, i.category_id, i.code, i.title, i.sort_order, i.is_active, i.deleted_at, i.meta_json
       FROM reference_items i
       JOIN reference_categories c ON c.id = i.category_id
       WHERE c.code = $1 AND c.organization_id = $2::uuid
         AND i.organization_id = $2::uuid AND i.deleted_at IS NULL
       ORDER BY i.sort_order ASC, i.title ASC`,
      [categoryCode, organizationId],
    );
    return res.rows.map(rowItem);
  },

  async insertItem(params) {
    const meta = params.metaJson ?? {};
    const row = await runPrincipalReferenceTransaction(async (tx, organizationId) => {
      const catRes = await runWebappPgText<ReferenceCategoryRow>(
        `SELECT id, code, title, is_user_extensible, organization_id, tenant_id
         FROM reference_categories WHERE code = $1 AND organization_id = $2::uuid`,
        [params.categoryCode, organizationId],
        tx,
      );
      const cat = catRes.rows[0];
      if (!cat) throw new Error('category_not_found');
      if (!cat.is_user_extensible) throw new Error('category_not_extensible');
      currentWriteOrganizationId(cat.organization_id);
      const result = await runWebappPgText<{
        id: string;
        category_id: string;
        code: string;
        title: string;
        sort_order: number;
        is_active: boolean;
        deleted_at: Date | string | null;
        meta_json: Record<string, unknown>;
      }>(
        `INSERT INTO reference_items (organization_id, category_id, code, title, sort_order, is_active, meta_json)
         VALUES ($1, $2, $3, $4, 999, true, $5::jsonb)
         RETURNING id, category_id, code, title, sort_order, is_active, deleted_at, meta_json`,
        [organizationId, cat.id, params.code, params.title, JSON.stringify(meta)],
        tx,
      );
      return result.rows[0]!;
    });
    return rowItem(row);
  },

  async insertItemStaff(params) {
    const meta = params.metaJson ?? {};
    const row = await runPrincipalReferenceTransaction(async (tx, organizationId) => {
      const catRes = await runWebappPgText<ReferenceCategoryRow>(
        `SELECT id, code, title, is_user_extensible, organization_id, tenant_id
         FROM reference_categories WHERE code = $1 AND organization_id = $2::uuid`,
        [params.categoryCode, organizationId],
        tx,
      );
      const cat = catRes.rows[0];
      if (!cat) throw new Error('category_not_found');
      currentWriteOrganizationId(cat.organization_id);
      const result = await runWebappPgText<{
        id: string;
        category_id: string;
        code: string;
        title: string;
        sort_order: number;
        is_active: boolean;
        deleted_at: Date | string | null;
        meta_json: Record<string, unknown>;
      }>(
        `INSERT INTO reference_items (organization_id, category_id, code, title, sort_order, is_active, meta_json)
         VALUES ($1, $2, $3, $4, $5, true, $6::jsonb)
         RETURNING id, category_id, code, title, sort_order, is_active, deleted_at, meta_json`,
        [
          organizationId,
          cat.id,
          params.code,
          params.title,
          params.sortOrder ?? 999,
          JSON.stringify(meta),
        ],
        tx,
      );
      return result.rows[0]!;
    });
    return rowItem(row);
  },

  async updateItem(itemId, input) {
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (input.title !== undefined) {
      updates.push(`title = $${idx++}`);
      values.push(input.title);
    }
    if (input.sortOrder !== undefined) {
      updates.push(`sort_order = $${idx++}`);
      values.push(input.sortOrder);
    }
    if (input.isActive !== undefined) {
      updates.push(`is_active = $${idx++}`);
      values.push(input.isActive);
    }
    if (updates.length === 0) {
      throw new Error('empty_update');
    }
    const row = await runPrincipalReferenceTransaction(async (tx, organizationId) => {
      const current = await runWebappPgText<{
        item_org: string | null;
        category_org: string | null;
      }>(
        `SELECT i.organization_id AS item_org, c.organization_id AS category_org
         FROM reference_items i
         JOIN reference_categories c ON c.id = i.category_id
         WHERE i.id = $1 AND i.organization_id = $2::uuid AND i.deleted_at IS NULL`,
        [itemId, organizationId],
        tx,
      );
      const currentRow = current.rows[0];
      if (!currentRow) throw new Error('item_not_found');
      currentWriteOrganizationId(currentRow.item_org, currentRow.category_org);

      const writeValues = [...values, organizationId, itemId];
      const res = await runWebappPgText<{
        id: string;
        category_id: string;
        code: string;
        title: string;
        sort_order: number;
        is_active: boolean;
        deleted_at: Date | string | null;
        meta_json: Record<string, unknown>;
      }>(
        `UPDATE reference_items
         SET ${updates.join(', ')}, organization_id = $${idx}
         WHERE id = $${idx + 1} AND organization_id = $${idx}::uuid AND deleted_at IS NULL
         RETURNING id, category_id, code, title, sort_order, is_active, deleted_at, meta_json`,
        writeValues,
        tx,
      );
      if (!res.rows[0]) throw new Error('item_not_found');
      return res.rows[0];
    });
    return rowItem(row);
  },

  async saveCatalog(categoryCode, input) {
    await runPrincipalReferenceTransaction(async (tx, organizationId) => {
      const catRes = await runWebappPgText<ReferenceCategoryRow>(
        `SELECT id, code, title, is_user_extensible, organization_id, tenant_id
         FROM reference_categories WHERE code = $1 AND organization_id = $2::uuid`,
        [categoryCode, organizationId],
        tx,
      );
      const cat = catRes.rows[0];
      if (!cat) throw new Error('category_not_found');
      currentWriteOrganizationId(cat.organization_id);
      const updateNormCodes = input.updates.map((u) => u.code.trim().toLowerCase());
      const additionNormCodes = input.additions.map((a) => a.code.trim().toLowerCase());
      const allNormCodes = [...updateNormCodes, ...additionNormCodes];
      const batchCounts = new Map<string, number>();
      for (const c of allNormCodes) {
        batchCounts.set(c, (batchCounts.get(c) ?? 0) + 1);
      }
      const duplicateInBatch = [...batchCounts.entries()].filter(([, n]) => n > 1).map(([c]) => c);
      if (duplicateInBatch.length > 0) {
        const err = new Error('duplicate_code') as Error & { conflictingCodes: string[] };
        err.conflictingCodes = duplicateInBatch;
        throw err;
      }
      const currentRes = await runWebappPgText<{
        id: string;
        code: string;
        organization_id: string | null;
      }>(
        `SELECT id, code, organization_id FROM reference_items
         WHERE category_id = $1 AND organization_id = $2::uuid AND deleted_at IS NULL`,
        [cat.id, organizationId],
        tx,
      );
      for (const row of currentRes.rows) {
        currentWriteOrganizationId(row.organization_id, cat.organization_id);
      }
      const idToNewCode = new Map(input.updates.map((u) => [u.id, u.code.trim().toLowerCase()]));
      const idsNeedingTemp: string[] = [];
      for (const row of currentRes.rows) {
        const next = idToNewCode.get(String(row.id));
        if (next === undefined) continue;
        if (row.code.trim().toLowerCase() !== next) {
          idsNeedingTemp.push(String(row.id));
        }
      }
      if (idsNeedingTemp.length > 0) {
        await runWebappPgText(
          `UPDATE reference_items AS ri
           SET code = '__tmpref' || replace(ri.id::text, '-', ''),
               organization_id = $2::uuid
           WHERE ri.category_id = $1 AND ri.organization_id = $2::uuid
             AND ri.deleted_at IS NULL AND ri.id = ANY($3::uuid[])`,
          [cat.id, organizationId, idsNeedingTemp],
          tx,
        );
      }
      for (const update of input.updates) {
        const res = await runWebappPgText(
          `UPDATE reference_items
           SET title = $1, sort_order = $2, is_active = $3, code = $4, organization_id = $7::uuid
           WHERE id = $5::uuid AND category_id = $6 AND organization_id = $7::uuid AND deleted_at IS NULL`,
          [
            update.title,
            update.sortOrder,
            update.isActive,
            update.code.trim().toLowerCase(),
            update.id,
            cat.id,
            organizationId,
          ],
          tx,
        );
        if ((res.rowCount ?? 0) !== 1) {
          throw new Error('item_not_found');
        }
      }
      for (const addition of input.additions) {
        await runWebappPgText(
          `INSERT INTO reference_items (organization_id, category_id, code, title, sort_order, is_active, meta_json)
           VALUES ($1, $2, $3, $4, $5, true, '{}'::jsonb)`,
          [
            organizationId,
            cat.id,
            addition.code.trim().toLowerCase(),
            addition.title,
            addition.sortOrder,
          ],
          tx,
        );
      }
    });
  },

  async archiveItem(itemId) {
    await runPrincipalReferenceTransaction(async (tx, organizationId) => {
      const current = await runWebappPgText<{
        item_org: string | null;
        category_org: string | null;
      }>(
        `SELECT i.organization_id AS item_org, c.organization_id AS category_org
         FROM reference_items i
         JOIN reference_categories c ON c.id = i.category_id
         WHERE i.id = $1 AND i.organization_id = $2::uuid AND i.deleted_at IS NULL`,
        [itemId, organizationId],
        tx,
      );
      const row = current.rows[0];
      if (!row) return;
      currentWriteOrganizationId(row.item_org, row.category_org);
      await runWebappPgText(
        `UPDATE reference_items SET is_active = false, organization_id = $2::uuid
         WHERE id = $1 AND organization_id = $2::uuid AND deleted_at IS NULL`,
        [itemId, organizationId],
        tx,
      );
    });
  },

  async softDeleteItem(itemId) {
    await runPrincipalReferenceTransaction(async (tx, organizationId) => {
      const current = await runWebappPgText<{
        item_org: string | null;
        category_org: string | null;
      }>(
        `SELECT i.organization_id AS item_org, c.organization_id AS category_org
         FROM reference_items i
         JOIN reference_categories c ON c.id = i.category_id
         WHERE i.id = $1 AND i.organization_id = $2::uuid AND i.deleted_at IS NULL`,
        [itemId, organizationId],
        tx,
      );
      const row = current.rows[0];
      if (!row) return;
      currentWriteOrganizationId(row.item_org, row.category_org);
      await runWebappPgText(
        `UPDATE reference_items SET deleted_at = now(), organization_id = $2::uuid
         WHERE id = $1 AND organization_id = $2::uuid AND deleted_at IS NULL`,
        [itemId, organizationId],
        tx,
      );
    });
  },

  async findItemById(itemId) {
    const principalOrganizationId = currentPrincipalOrganizationId();
    const res = await runWebappPgText<{
      id: string;
      category_id: string;
      code: string;
      title: string;
      sort_order: number;
      is_active: boolean;
      deleted_at: Date | string | null;
      meta_json: Record<string, unknown>;
    }>(
      `SELECT id, category_id, code, title, sort_order, is_active, deleted_at, meta_json
       FROM reference_items i WHERE id = $1 AND i.organization_id = $2::uuid`,
      [itemId, principalOrganizationId],
    );
    return res.rows[0] ? rowItem(res.rows[0]) : null;
  },
};
