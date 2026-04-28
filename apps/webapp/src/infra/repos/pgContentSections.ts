import { getPool } from "@/infra/db/client";

export type ContentSectionRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  sortOrder: number;
  isVisible: boolean;
  /** Если true — только tier patient (см. `requires_auth` в БД). */
  requiresAuth: boolean;
  coverImageUrl: string | null;
  iconImageUrl: string | null;
};

export type ListVisibleContentSectionsOpts = {
  /**
   * Если false — только разделы без `requires_auth` (гость / onboarding).
   * Если true — все с `is_visible` (как раньше по смыслу для tier patient).
   * @default true
   */
  viewAuthOnlySections?: boolean;
};

export type ContentSectionsPort = {
  listVisible: (opts?: ListVisibleContentSectionsOpts) => Promise<ContentSectionRow[]>;
  listAll: () => Promise<ContentSectionRow[]>;
  getBySlug: (slug: string) => Promise<ContentSectionRow | null>;
  upsert: (section: Omit<ContentSectionRow, "id"> & { id?: string }) => Promise<string>;
  update: (
    slug: string,
    patch: Partial<
      Pick<
        ContentSectionRow,
        "title" | "description" | "sortOrder" | "isVisible" | "requiresAuth" | "coverImageUrl" | "iconImageUrl"
      >
    >,
  ) => Promise<void>;
  /** Выставить `sort_order` по порядку slug (0..n-1) в одной транзакции. */
  reorderSlugs: (orderedSlugs: string[]) => Promise<void>;
};

const SELECT_COLS = `id, slug, title, description, sort_order, is_visible, requires_auth, cover_image_url, icon_image_url`;

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
        `INSERT INTO content_sections (slug, title, description, sort_order, is_visible, requires_auth, cover_image_url, icon_image_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (slug) DO UPDATE SET
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           sort_order = EXCLUDED.sort_order,
           is_visible = EXCLUDED.is_visible,
           requires_auth = EXCLUDED.requires_auth,
           cover_image_url = EXCLUDED.cover_image_url,
           icon_image_url = EXCLUDED.icon_image_url,
           updated_at = now()
         RETURNING id`,
        [
          section.slug,
          section.title,
          section.description,
          section.sortOrder,
          section.isVisible,
          section.requiresAuth ?? false,
          section.coverImageUrl ?? null,
          section.iconImageUrl ?? null,
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
      if (patch.coverImageUrl !== undefined) {
        sets.push(`cover_image_url = $${n++}`);
        vals.push(patch.coverImageUrl);
      }
      if (patch.iconImageUrl !== undefined) {
        sets.push(`icon_image_url = $${n++}`);
        vals.push(patch.iconImageUrl);
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
    coverImageUrl: (row.cover_image_url as string) ?? null,
    iconImageUrl: (row.icon_image_url as string) ?? null,
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
};

/** Изолированный in-memory порт для unit-тестов. */
export function createInMemoryContentSectionsPort(): ContentSectionsPort {
  const memory = new Map<string, ContentSectionRow>();
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
        coverImageUrl: section.coverImageUrl ?? null,
        iconImageUrl: section.iconImageUrl ?? null,
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
        ...(patch.coverImageUrl !== undefined ? { coverImageUrl: patch.coverImageUrl } : {}),
        ...(patch.iconImageUrl !== undefined ? { iconImageUrl: patch.iconImageUrl } : {}),
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
  };
}
