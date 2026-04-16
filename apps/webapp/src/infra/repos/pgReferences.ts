/**
 * PostgreSQL implementation of ReferencesPort (Stage 6 reference_categories / reference_items).
 */
import { getPool } from "@/infra/db/client";
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
  meta_json: Record<string, unknown>;
}): ReferenceItem {
  return {
    id: String(row.id),
    categoryId: String(row.category_id),
    code: row.code,
    title: row.title,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    metaJson: row.meta_json ?? {},
  };
}

export const pgReferencesPort: ReferencesPort = {
  async listCategories() {
    const pool = getPool();
    const res = await pool.query(
      `SELECT id, code, title, is_user_extensible, tenant_id
       FROM reference_categories
       ORDER BY title ASC`
    );
    return res.rows.map(rowCat);
  },

  async findCategoryByCode(categoryCode) {
    const pool = getPool();
    const res = await pool.query(
      `SELECT id, code, title, is_user_extensible, tenant_id
       FROM reference_categories WHERE code = $1`,
      [categoryCode]
    );
    return res.rows[0] ? rowCat(res.rows[0]) : null;
  },

  async listActiveItemsByCategoryCode(categoryCode) {
    const pool = getPool();
    const res = await pool.query(
      `SELECT i.id, i.category_id, i.code, i.title, i.sort_order, i.is_active, i.meta_json
       FROM reference_items i
       JOIN reference_categories c ON c.id = i.category_id
       WHERE c.code = $1 AND i.is_active = true
       ORDER BY i.sort_order ASC, i.title ASC`,
      [categoryCode]
    );
    return res.rows.map(rowItem);
  },

  async listItemsForManagementByCategoryCode(categoryCode) {
    const pool = getPool();
    const res = await pool.query(
      `SELECT i.id, i.category_id, i.code, i.title, i.sort_order, i.is_active, i.meta_json
       FROM reference_items i
       JOIN reference_categories c ON c.id = i.category_id
       WHERE c.code = $1
       ORDER BY i.sort_order ASC, i.title ASC`,
      [categoryCode]
    );
    return res.rows.map(rowItem);
  },

  async insertItem(params) {
    const pool = getPool();
    const cat = await pgReferencesPort.findCategoryByCode(params.categoryCode);
    if (!cat) {
      throw new Error("category_not_found");
    }
    if (!cat.isUserExtensible) {
      throw new Error("category_not_extensible");
    }
    const meta = params.metaJson ?? {};
    const result = await pool.query(
      `INSERT INTO reference_items (category_id, code, title, sort_order, is_active, meta_json)
       VALUES ($1, $2, $3, 999, true, $4::jsonb)
       RETURNING id, category_id, code, title, sort_order, is_active, meta_json`,
      [cat.id, params.code, params.title, JSON.stringify(meta)]
    );
    return rowItem(result.rows[0]);
  },

  async insertItemStaff(params) {
    const pool = getPool();
    const cat = await pgReferencesPort.findCategoryByCode(params.categoryCode);
    if (!cat) {
      throw new Error("category_not_found");
    }
    const meta = params.metaJson ?? {};
    const result = await pool.query(
      `INSERT INTO reference_items (category_id, code, title, sort_order, is_active, meta_json)
       VALUES ($1, $2, $3, $4, true, $5::jsonb)
       RETURNING id, category_id, code, title, sort_order, is_active, meta_json`,
      [cat.id, params.code, params.title, params.sortOrder ?? 999, JSON.stringify(meta)]
    );
    return rowItem(result.rows[0]);
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
    const pool = getPool();
    const res = await pool.query(
      `UPDATE reference_items
       SET ${updates.join(", ")}
       WHERE id = $${idx}
       RETURNING id, category_id, code, title, sort_order, is_active, meta_json`,
      values
    );
    if (!res.rows[0]) throw new Error("item_not_found");
    return rowItem(res.rows[0]);
  },

  async archiveItem(itemId) {
    const pool = getPool();
    await pool.query(`UPDATE reference_items SET is_active = false WHERE id = $1`, [itemId]);
  },

  async findItemById(itemId) {
    const pool = getPool();
    const res = await pool.query(
      `SELECT id, category_id, code, title, sort_order, is_active, meta_json
       FROM reference_items WHERE id = $1`,
      [itemId]
    );
    return res.rows[0] ? rowItem(res.rows[0]) : null;
  },
};
