import { getPool } from "@/infra/db/client";
import { validateContentSectionSlug } from "@/shared/lib/contentSectionSlug";

export type ContentSectionRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  sortOrder: number;
  isVisible: boolean;
  /** Если true — только tier patient (см. `requires_auth` в БД). */
  requiresAuth: boolean;
};

export type ListVisibleContentSectionsOpts = {
  /**
   * Если false — только разделы без `requires_auth` (гость / onboarding).
   * Если true — все с `is_visible` (как раньше по смыслу для tier patient).
   * @default true
   */
  viewAuthOnlySections?: boolean;
};

export type RenameSectionSlugResult =
  | { ok: true; newSlug: string }
  | { ok: false; error: string };

export type ContentSectionsPort = {
  listVisible: (opts?: ListVisibleContentSectionsOpts) => Promise<ContentSectionRow[]>;
  listAll: () => Promise<ContentSectionRow[]>;
  getBySlug: (slug: string) => Promise<ContentSectionRow | null>;
  upsert: (section: Omit<ContentSectionRow, "id"> & { id?: string }) => Promise<string>;
  update: (
    slug: string,
    patch: Partial<
      Pick<ContentSectionRow, "title" | "description" | "sortOrder" | "isVisible" | "requiresAuth">
    >,
  ) => Promise<void>;
  /** Выставить `sort_order` по порядку slug (0..n-1) в одной транзакции. */
  reorderSlugs: (orderedSlugs: string[]) => Promise<void>;
  /** Атомарное переименование slug: `content_pages.section`, опционально `patient_home_block_items`, `content_sections`, история. */
  renameSectionSlug: (oldSlug: string, newSlug: string) => Promise<RenameSectionSlugResult>;
  /** Один шаг цепочки редиректа: куда вести URL с устаревшим slug. */
  getRedirectNewSlugForOldSlug: (oldSlug: string) => Promise<string | null>;
};

const SELECT_COLS = `id, slug, title, description, sort_order, is_visible, requires_auth`;

export function createPgContentSectionsPort(): ContentSectionsPort {
  return {
    async listVisible(opts?: ListVisibleContentSectionsOpts) {
      const viewAuthOnlySections = opts?.viewAuthOnlySections !== false;
      const pool = getPool();
      const authClause = viewAuthOnlySections ? "" : " AND requires_auth = false";
      const res = await pool.query(
        `SELECT ${SELECT_COLS} FROM content_sections
         WHERE is_visible = true${authClause}
         ORDER BY sort_order, title`,
      );
      return res.rows.map(mapRow);
    },
    async listAll() {
      const pool = getPool();
      const res = await pool.query(
        `SELECT ${SELECT_COLS} FROM content_sections ORDER BY sort_order, title`,
      );
      return res.rows.map(mapRow);
    },
    async getBySlug(slug) {
      const pool = getPool();
      const res = await pool.query(`SELECT ${SELECT_COLS} FROM content_sections WHERE slug = $1`, [slug]);
      return res.rows[0] ? mapRow(res.rows[0]) : null;
    },
    async upsert(section) {
      const pool = getPool();
      const res = await pool.query(
        `INSERT INTO content_sections (slug, title, description, sort_order, is_visible, requires_auth)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (slug) DO UPDATE SET
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           sort_order = EXCLUDED.sort_order,
           is_visible = EXCLUDED.is_visible,
           requires_auth = EXCLUDED.requires_auth,
           updated_at = now()
         RETURNING id`,
        [
          section.slug,
          section.title,
          section.description,
          section.sortOrder,
          section.isVisible,
          section.requiresAuth ?? false,
        ],
      );
      return res.rows[0].id as string;
    },
    async update(slug, patch) {
      const pool = getPool();
      const sets: string[] = [];
      const vals: unknown[] = [];
      let n = 1;
      if (patch.title !== undefined) {
        sets.push(`title = $${n++}`);
        vals.push(patch.title);
      }
      if (patch.description !== undefined) {
        sets.push(`description = $${n++}`);
        vals.push(patch.description);
      }
      if (patch.sortOrder !== undefined) {
        sets.push(`sort_order = $${n++}`);
        vals.push(patch.sortOrder);
      }
      if (patch.isVisible !== undefined) {
        sets.push(`is_visible = $${n++}`);
        vals.push(patch.isVisible);
      }
      if (patch.requiresAuth !== undefined) {
        sets.push(`requires_auth = $${n++}`);
        vals.push(patch.requiresAuth);
      }
      if (sets.length === 0) return;
      vals.push(slug);
      await pool.query(
        `UPDATE content_sections SET ${sets.join(", ")}, updated_at = now() WHERE slug = $${n}`,
        vals,
      );
    },
    async reorderSlugs(orderedSlugs) {
      const slugs = orderedSlugs.map((s) => String(s).trim()).filter(Boolean);
      if (slugs.length === 0) return;
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (let i = 0; i < slugs.length; i += 1) {
          await client.query(
            `UPDATE content_sections SET sort_order = $1, updated_at = now() WHERE slug = $2`,
            [i, slugs[i]],
          );
        }
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
    async getRedirectNewSlugForOldSlug(oldSlug) {
      const key = oldSlug.trim();
      if (!key) return null;
      const pool = getPool();
      const res = await pool.query<{ new_slug: string }>(
        `SELECT new_slug FROM content_section_slug_history WHERE old_slug = $1`,
        [key],
      );
      return res.rows[0]?.new_slug ?? null;
    },
    async renameSectionSlug(oldSlug, newSlug) {
      const vOld = validateContentSectionSlug(oldSlug);
      const vNew = validateContentSectionSlug(newSlug);
      if (!vOld.ok) return { ok: false, error: vOld.error };
      if (!vNew.ok) return { ok: false, error: vNew.error };
      const o = vOld.slug;
      const n = vNew.slug;
      if (o === n) return { ok: false, error: "Новый slug совпадает с текущим" };

      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const exists = await client.query(`SELECT 1 FROM content_sections WHERE slug = $1`, [o]);
        if (exists.rowCount === 0) {
          await client.query("ROLLBACK");
          return { ok: false, error: "Раздел с исходным slug не найден" };
        }
        const taken = await client.query(`SELECT 1 FROM content_sections WHERE slug = $1`, [n]);
        if (taken.rowCount !== 0) {
          await client.query("ROLLBACK");
          return { ok: false, error: "Раздел с таким slug уже существует" };
        }

        await client.query(`UPDATE content_pages SET section = $1, updated_at = now() WHERE section = $2`, [n, o]);

        const tab = await client.query<{ e: boolean }>(
          `SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'patient_home_block_items'
          ) AS e`,
        );
        if (tab.rows[0]?.e) {
          await client.query(
            `UPDATE patient_home_block_items SET target_ref = $1
             WHERE target_type = 'content_section' AND target_ref = $2`,
            [n, o],
          );
        }

        const upd = await client.query(`UPDATE content_sections SET slug = $1, updated_at = now() WHERE slug = $2`, [
          n,
          o,
        ]);
        if (upd.rowCount === 0) {
          await client.query("ROLLBACK");
          return { ok: false, error: "Раздел с исходным slug не найден" };
        }

        await client.query(`INSERT INTO content_section_slug_history (old_slug, new_slug) VALUES ($1, $2)`, [o, n]);

        await client.query("COMMIT");
        return { ok: true, newSlug: n };
      } catch (e) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        const code = typeof e === "object" && e !== null ? (e as { code?: string }).code : undefined;
        if (code === "23505") {
          return { ok: false, error: "Раздел с таким slug уже существует" };
        }
        console.error("renameSectionSlug failed:", e);
        return { ok: false, error: "Не удалось переименовать slug. Попробуйте ещё раз." };
      } finally {
        client.release();
      }
    },
  };
}

function mapRow(row: Record<string, unknown>): ContentSectionRow {
  return {
    id: row.id as string,
    slug: row.slug as string,
    title: row.title as string,
    description: (row.description as string) ?? "",
    sortOrder: row.sort_order as number,
    isVisible: row.is_visible as boolean,
    requiresAuth: Boolean(row.requires_auth),
  };
}

/** Пустой порт без БД (как `inMemoryContentPagesPort`). */
export const inMemoryContentSectionsPort: ContentSectionsPort = {
  listVisible: async () => [],
  listAll: async () => [],
  getBySlug: async () => null,
  upsert: async () => "",
  update: async () => {},
  reorderSlugs: async () => {},
  renameSectionSlug: async () => ({
    ok: false,
    error: "Переименование slug недоступно в режиме без БД",
  }),
  getRedirectNewSlugForOldSlug: async () => null,
};

/** Изолированный in-memory порт для unit-тестов. */
export function createInMemoryContentSectionsPort(): ContentSectionsPort {
  const memory = new Map<string, ContentSectionRow>();
  const slugRedirects = new Map<string, string>();
  return {
    async listVisible(opts?: ListVisibleContentSectionsOpts) {
      const viewAuthOnlySections = opts?.viewAuthOnlySections !== false;
      return [...memory.values()]
        .filter((r) => r.isVisible && (viewAuthOnlySections || !r.requiresAuth))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    },
    async listAll() {
      return [...memory.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    },
    async getBySlug(slug) {
      return memory.get(slug) ?? null;
    },
    async upsert(section) {
      const id = section.id ?? `mem-${section.slug}`;
      const row: ContentSectionRow = {
        id,
        slug: section.slug,
        title: section.title,
        description: section.description,
        sortOrder: section.sortOrder,
        isVisible: section.isVisible,
        requiresAuth: section.requiresAuth ?? false,
      };
      memory.set(section.slug, row);
      return id;
    },
    async update(slug, patch) {
      const cur = memory.get(slug);
      if (!cur) return;
      memory.set(slug, {
        ...cur,
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
        ...(patch.isVisible !== undefined ? { isVisible: patch.isVisible } : {}),
        ...(patch.requiresAuth !== undefined ? { requiresAuth: patch.requiresAuth } : {}),
      });
    },
    async reorderSlugs(orderedSlugs) {
      const slugs = orderedSlugs.map((s) => String(s).trim()).filter(Boolean);
      for (let i = 0; i < slugs.length; i += 1) {
        const slug = slugs[i]!;
        const cur = memory.get(slug);
        if (cur) memory.set(slug, { ...cur, sortOrder: i });
      }
    },
    async getRedirectNewSlugForOldSlug(oldSlug) {
      return slugRedirects.get(oldSlug.trim()) ?? null;
    },
    async renameSectionSlug(oldSlug, newSlug) {
      const vOld = validateContentSectionSlug(oldSlug);
      const vNew = validateContentSectionSlug(newSlug);
      if (!vOld.ok) return { ok: false, error: vOld.error };
      if (!vNew.ok) return { ok: false, error: vNew.error };
      const o = vOld.slug;
      const n = vNew.slug;
      if (o === n) return { ok: false, error: "Новый slug совпадает с текущим" };
      const cur = memory.get(o);
      if (!cur) return { ok: false, error: "Раздел с исходным slug не найден" };
      if (memory.has(n)) return { ok: false, error: "Раздел с таким slug уже существует" };
      memory.delete(o);
      const next: ContentSectionRow = { ...cur, slug: n };
      memory.set(n, next);
      slugRedirects.set(o, n);
      return { ok: true, newSlug: n };
    },
  };
}
