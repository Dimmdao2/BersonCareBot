import { getPool } from "@/infra/db/client";

export type ContentPageRow = {
  id: string;
  section: string;
  slug: string;
  title: string;
  summary: string;
  bodyHtml: string;
  sortOrder: number;
  isPublished: boolean;
  videoUrl: string | null;
  videoType: string | null;
  imageUrl: string | null;
};

export type ContentPagesPort = {
  listBySection: (section: string) => Promise<ContentPageRow[]>;
  getBySlug: (slug: string) => Promise<ContentPageRow | null>;
  getById: (id: string) => Promise<ContentPageRow | null>;
  listAll: () => Promise<ContentPageRow[]>;
  upsert: (page: Omit<ContentPageRow, "id"> & { id?: string }) => Promise<string>;
};

export function createPgContentPagesPort(): ContentPagesPort {
  return {
    async listBySection(section) {
      const pool = getPool();
      const res = await pool.query(
        `SELECT id, section, slug, title, summary, body_html, sort_order, is_published, video_url, video_type, image_url
         FROM content_pages WHERE section = $1 AND is_published = true ORDER BY sort_order, title`,
        [section]
      );
      return res.rows.map(mapRow);
    },
    async getBySlug(slug) {
      const pool = getPool();
      const res = await pool.query(
        `SELECT id, section, slug, title, summary, body_html, sort_order, is_published, video_url, video_type, image_url
         FROM content_pages WHERE slug = $1 AND is_published = true`,
        [slug]
      );
      return res.rows[0] ? mapRow(res.rows[0]) : null;
    },
    async getById(id) {
      const pool = getPool();
      const res = await pool.query(
        `SELECT id, section, slug, title, summary, body_html, sort_order, is_published, video_url, video_type, image_url
         FROM content_pages WHERE id = $1`,
        [id]
      );
      return res.rows[0] ? mapRow(res.rows[0]) : null;
    },
    async listAll() {
      const pool = getPool();
      const res = await pool.query(
        `SELECT id, section, slug, title, summary, body_html, sort_order, is_published, video_url, video_type, image_url
         FROM content_pages ORDER BY section, sort_order, title`
      );
      return res.rows.map(mapRow);
    },
    async upsert(page) {
      const pool = getPool();
      const res = await pool.query(
        `INSERT INTO content_pages (section, slug, title, summary, body_html, sort_order, is_published, video_url, video_type, image_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (section, slug) DO UPDATE SET
           title = EXCLUDED.title, summary = EXCLUDED.summary, body_html = EXCLUDED.body_html,
           sort_order = EXCLUDED.sort_order, is_published = EXCLUDED.is_published,
           video_url = EXCLUDED.video_url, video_type = EXCLUDED.video_type,
           image_url = EXCLUDED.image_url, updated_at = now()
         RETURNING id`,
        [page.section, page.slug, page.title, page.summary, page.bodyHtml,
         page.sortOrder, page.isPublished, page.videoUrl, page.videoType, page.imageUrl]
      );
      return res.rows[0].id;
    },
  };
}

function mapRow(row: Record<string, unknown>): ContentPageRow {
  return {
    id: row.id as string,
    section: row.section as string,
    slug: row.slug as string,
    title: row.title as string,
    summary: (row.summary as string) ?? "",
    bodyHtml: (row.body_html as string) ?? "",
    sortOrder: row.sort_order as number,
    isPublished: row.is_published as boolean,
    videoUrl: (row.video_url as string) ?? null,
    videoType: (row.video_type as string) ?? null,
    imageUrl: (row.image_url as string) ?? null,
  };
}

export const inMemoryContentPagesPort: ContentPagesPort = {
  listBySection: async () => [],
  getBySlug: async () => null,
  getById: async () => null,
  listAll: async () => [],
  upsert: async () => "",
};
