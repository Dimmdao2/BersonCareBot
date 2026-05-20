import type { Pool } from "pg";

/** Slugs CMS-разделов кластера warmups (`system_parent_code = warmups`). */
export async function loadWarmupsSectionSlugs(pool: Pool): Promise<Set<string>> {
  const r = await pool.query<{ slug: string }>(
    `SELECT slug FROM content_sections
     WHERE system_parent_code = 'warmups' AND slug IS NOT NULL AND trim(slug) <> ''`,
  );
  const slugs = new Set<string>();
  for (const row of r.rows) {
    const s = row.slug?.trim();
    if (s) slugs.add(s);
  }
  return slugs;
}
