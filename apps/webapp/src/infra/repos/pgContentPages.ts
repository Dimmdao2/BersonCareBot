import { getPool } from "@/infra/db/client";

export type ContentPageRow = {
  id: string;
  section: string;
  slug: string;
  title: string;
  summary: string;
  /** Primary stored content (Markdown). */
  bodyMd: string;
  /** Legacy HTML; used when `bodyMd` is empty. */
  bodyHtml: string;
  sortOrder: number;
  isPublished: boolean;
  videoUrl: string | null;
  videoType: string | null;
  imageUrl: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
};

export type ContentPageLifecyclePatch = {
  isPublished?: boolean;
  archivedAt?: string | null;
  deletedAt?: string | null;
};

export type ContentPagesPort = {
  listBySection: (section: string) => Promise<ContentPageRow[]>;
  getBySlug: (slug: string) => Promise<ContentPageRow | null>;
  getById: (id: string) => Promise<ContentPageRow | null>;
  listAll: () => Promise<ContentPageRow[]>;
  upsert: (page: Omit<ContentPageRow, "id" | "archivedAt" | "deletedAt"> & { id?: string }) => Promise<string>;
  updateLifecycle: (id: string, patch: ContentPageLifecyclePatch) => Promise<void>;
};

const SELECT_COLS = `id, section, slug, title, summary, body_md, body_html, sort_order, is_published,
  video_url, video_type, image_url, archived_at, deleted_at`;

const PATIENT_VISIBLE = `is_published = true AND archived_at IS NULL AND deleted_at IS NULL`;

export function createPgContentPagesPort(): ContentPagesPort {
  return {
    async listBySection(section) {
      const pool = getPool();
      const res = await pool.query(
        `SELECT ${SELECT_COLS}
         FROM content_pages WHERE section = $1 AND ${PATIENT_VISIBLE} ORDER BY sort_order, title`,
        [section]
      );
      return res.rows.map(mapRow);
    },
    async getBySlug(slug) {
      const pool = getPool();
      const res = await pool.query(
        `SELECT ${SELECT_COLS}
         FROM content_pages WHERE slug = $1 AND ${PATIENT_VISIBLE}
         ORDER BY section LIMIT 1`,
        [slug]
      );
      return res.rows[0] ? mapRow(res.rows[0]) : null;
    },
    async getById(id) {
      const pool = getPool();
      const res = await pool.query(`SELECT ${SELECT_COLS} FROM content_pages WHERE id = $1`, [id]);
      return res.rows[0] ? mapRow(res.rows[0]) : null;
    },
    async listAll() {
      const pool = getPool();
      const res = await pool.query(
        `SELECT ${SELECT_COLS} FROM content_pages ORDER BY section, sort_order, title`
      );
      return res.rows.map(mapRow);
    },
    async upsert(page) {
      const pool = getPool();
      const res = await pool.query(
        `INSERT INTO content_pages (section, slug, title, summary, body_md, body_html, sort_order, is_published, video_url, video_type, image_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (section, slug) DO UPDATE SET
           title = EXCLUDED.title, summary = EXCLUDED.summary, body_md = EXCLUDED.body_md, body_html = EXCLUDED.body_html,
           sort_order = EXCLUDED.sort_order, is_published = EXCLUDED.is_published,
           video_url = EXCLUDED.video_url, video_type = EXCLUDED.video_type,
           image_url = EXCLUDED.image_url, updated_at = now()
         RETURNING id`,
        [page.section, page.slug, page.title, page.summary, page.bodyMd, page.bodyHtml,
         page.sortOrder, page.isPublished, page.videoUrl, page.videoType, page.imageUrl]
      );
      return res.rows[0].id;
    },
    async updateLifecycle(id, patch) {
      const pool = getPool();
      const sets: string[] = [];
      const vals: unknown[] = [];
      let n = 1;
      if (patch.isPublished !== undefined) {
        sets.push(`is_published = $${n++}`);
        vals.push(patch.isPublished);
      }
      if (patch.archivedAt !== undefined) {
        sets.push(`archived_at = $${n++}`);
        vals.push(patch.archivedAt);
      }
      if (patch.deletedAt !== undefined) {
        sets.push(`deleted_at = $${n++}`);
        vals.push(patch.deletedAt);
      }
      if (sets.length === 0) return;
      vals.push(id);
      await pool.query(
        `UPDATE content_pages SET ${sets.join(", ")}, updated_at = now() WHERE id = $${n}::uuid`,
        vals
      );
    },
  };
}

function mapRow(row: Record<string, unknown>): ContentPageRow {
  const ar = row.archived_at;
  const del = row.deleted_at;
  return {
    id: row.id as string,
    section: row.section as string,
    slug: row.slug as string,
    title: row.title as string,
    summary: (row.summary as string) ?? "",
    bodyMd: (row.body_md as string) ?? "",
    bodyHtml: (row.body_html as string) ?? "",
    sortOrder: row.sort_order as number,
    isPublished: row.is_published as boolean,
    videoUrl: (row.video_url as string) ?? null,
    videoType: (row.video_type as string) ?? null,
    imageUrl: (row.image_url as string) ?? null,
    archivedAt: ar instanceof Date ? ar.toISOString() : ar ? String(ar) : null,
    deletedAt: del instanceof Date ? del.toISOString() : del ? String(del) : null,
  };
}

export const inMemoryContentPagesPort: ContentPagesPort = {
  listBySection: async () => [],
  getBySlug: async () => null,
  getById: async () => null,
  listAll: async () => [],
  upsert: async () => "",
  updateLifecycle: async () => {},
};
