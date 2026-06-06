/**
 * PostgreSQL implementation of ReferencesPort (Stage 6 reference_categories / reference_items).
 */
import { runWebappPgText, runWebappTransaction } from "@/infra/db/runWebappSql";
import { toIsoStringSafe } from "@/shared/lib/toIsoStringSafe";
import type { ReferencesPort } from "@/modules/references/ports";
import type { ReferenceCategory, ReferenceItem } from "@/modules/references/types";

function rowCat(row: {
  id: string;
  code: string;
  title: string;
  is_user_extensible: boolean;
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
        : typeof deletedAt === "string"
          ? deletedAt
          : toIsoStringSafe(deletedAt),
    metaJson: row.meta_json ?? {},
  };
}

export const pgReferencesPort: ReferencesPort = {
  async listCategories() {
    const res = await runWebappPgText<{
      id: string;
      code: string;
      title: string;
      is_user_extensible: boolean;
      tenant_id: string | null;
    }>(
      `SELECT id, code, title, is_user_extensible, tenant_id
       FROM reference_categories
       ORDER BY title ASC`,
    );
    return res.rows.map(rowCat);
  },

  async findCategoryByCode(categoryCode) {
    const res = await runWebappPgText<{
      id: string;
      code: string;
      title: string;
      is_user_extensible: boolean;
      tenant_id: string | null;
    }>(
      `SELECT id, code, title, is_user_extensible, tenant_id
       FROM reference_categories WHERE code = $1`,
      [categoryCode],
    );
    return res.rows[0] ? rowCat(res.rows[0]) : null;
  },

  async listActiveItemsByCategoryCode(categoryCode) {
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
       WHERE c.code = $1 AND i.is_active = true AND i.deleted_at IS NULL
       ORDER BY i.sort_order ASC, i.title ASC`,
      [categoryCode],
    );
    return res.rows.map(rowItem);
  },

  async listItemsForManagementByCategoryCode(categoryCode) {
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
       WHERE c.code = $1 AND i.deleted_at IS NULL
       ORDER BY i.sort_order ASC, i.title ASC`,
      [categoryCode],
    );
    return res.rows.map(rowItem);
  },

  async insertItem(params) {
    const cat = await pgReferencesPort.findCategoryByCode(params.categoryCode);
    if (!cat) {
      throw new Error("category_not_found");
    }
    if (!cat.isUserExtensible) {
      throw new Error("category_not_extensible");
    }
    const meta = params.metaJson ?? {};
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
      `INSERT INTO reference_items (category_id, code, title, sort_order, is_active, meta_json)
       VALUES ($1, $2, $3, 999, true, $4::jsonb)
       RETURNING id, category_id, code, title, sort_order, is_active, deleted_at, meta_json`,
      [cat.id, params.code, params.title, JSON.stringify(meta)],
    );
    return rowItem(result.rows[0]!);
  },

  async insertItemStaff(params) {
    const cat = await pgReferencesPort.findCategoryByCode(params.categoryCode);
    if (!cat) {
      throw new Error("category_not_found");
    }
    const meta = params.metaJson ?? {};
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
      `INSERT INTO reference_items (category_id, code, title, sort_order, is_active, meta_json)
       VALUES ($1, $2, $3, $4, true, $5::jsonb)
       RETURNING id, category_id, code, title, sort_order, is_active, deleted_at, meta_json`,
      [cat.id, params.code, params.title, params.sortOrder ?? 999, JSON.stringify(meta)],
    );
    return rowItem(result.rows[0]!);
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
      throw new Error("empty_update");
    }
    values.push(itemId);
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
       SET ${updates.join(", ")}
       WHERE id = $${idx} AND deleted_at IS NULL
       RETURNING id, category_id, code, title, sort_order, is_active, deleted_at, meta_json`,
      values,
    );
    if (!res.rows[0]) throw new Error("item_not_found");
    return rowItem(res.rows[0]);
  },

  async saveCatalog(categoryCode, input) {
    const cat = await pgReferencesPort.findCategoryByCode(categoryCode);
    if (!cat) throw new Error("category_not_found");
    const updateNormCodes = input.updates.map((u) => u.code.trim().toLowerCase());
    const additionNormCodes = input.additions.map((a) => a.code.trim().toLowerCase());
    const allNormCodes = [...updateNormCodes, ...additionNormCodes];
    const batchCounts = new Map<string, number>();
    for (const c of allNormCodes) {
      batchCounts.set(c, (batchCounts.get(c) ?? 0) + 1);
    }
    const duplicateInBatch = [...batchCounts.entries()].filter(([, n]) => n > 1).map(([c]) => c);
    if (duplicateInBatch.length > 0) {
      const err = new Error("duplicate_code") as Error & { conflictingCodes: string[] };
      err.conflictingCodes = duplicateInBatch;
      throw err;
    }
    await runWebappTransaction(async (tx) => {
      const currentRes = await runWebappPgText<{ id: string; code: string }>(
        `SELECT id, code FROM reference_items WHERE category_id = $1 AND deleted_at IS NULL`,
        [cat.id],
        tx,
      );
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
           SET code = '__tmpref' || replace(ri.id::text, '-', '')
           WHERE ri.category_id = $1 AND ri.deleted_at IS NULL AND ri.id = ANY($2::uuid[])`,
          [cat.id, idsNeedingTemp],
          tx,
        );
      }
      for (const update of input.updates) {
        const res = await runWebappPgText(
          `UPDATE reference_items
           SET title = $1, sort_order = $2, is_active = $3, code = $4
           WHERE id = $5::uuid AND category_id = $6 AND deleted_at IS NULL`,
          [
            update.title,
            update.sortOrder,
            update.isActive,
            update.code.trim().toLowerCase(),
            update.id,
            cat.id,
          ],
          tx,
        );
        if ((res.rowCount ?? 0) !== 1) {
          throw new Error("item_not_found");
        }
      }
      for (const addition of input.additions) {
        await runWebappPgText(
          `INSERT INTO reference_items (category_id, code, title, sort_order, is_active, meta_json)
           VALUES ($1, $2, $3, $4, true, '{}'::jsonb)`,
          [cat.id, addition.code.trim().toLowerCase(), addition.title, addition.sortOrder],
          tx,
        );
      }
    });
  },

  async archiveItem(itemId) {
    await runWebappPgText(
      `UPDATE reference_items SET is_active = false WHERE id = $1 AND deleted_at IS NULL`,
      [itemId],
    );
  },

  async softDeleteItem(itemId) {
    await runWebappPgText(
      `UPDATE reference_items SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`,
      [itemId],
    );
  },

  async findItemById(itemId) {
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
       FROM reference_items WHERE id = $1`,
      [itemId],
    );
    return res.rows[0] ? rowItem(res.rows[0]) : null;
  },
};
