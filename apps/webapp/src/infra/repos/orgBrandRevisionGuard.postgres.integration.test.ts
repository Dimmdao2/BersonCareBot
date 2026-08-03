/**
 * Disposable-Postgres EXECUTABLE proof (Б1/Б3, #1081) for migration 0238's write chokepoint — the
 * two behaviours the pure string-matching migration test cannot see (independent adversarial
 * audit, 2026-07-25, HIGH 2):
 *
 *   1. deleting a `public.media_files` row referenced by a PUBLISHED or ARCHIVED brand revision must
 *      succeed. The FK's `ON DELETE SET NULL` issues
 *      `UPDATE ONLY public.org_brand_revisions SET logo_media_id = NULL`, which fires
 *      `app.guard_org_brand_revision()`. Before the fix that raised SQLSTATE P0001
 *      (org_brand_revision_published_only_archives / …_archived_is_immutable), and
 *      s3MediaStorage.purgePendingMediaDeleteBatch tolerates ONLY SQLSTATE class 23 — so a single
 *      branded organization would have killed an entire purge batch with the S3 objects already gone.
 *   2. the tolerance must stay exactly that narrow: any other edit of a published/archived row —
 *      including setting a NEW logo, or clearing the logo together with something else — still fails.
 *
 * Migrated off the shared dev DB (was `.devDb.integration.test.ts`, opt-in env flags never set
 * anywhere — never ran in CI, and it demanded a superuser/BYPASSRLS connection dev rarely offered).
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ORG = '7e510000-0000-4000-8000-00000000ba01';
const ACTOR = '7e510000-0000-4000-8000-00000000ba02';
const LOGO_PUBLISHED = '7e510000-0000-4000-8000-00000000ba11';
const LOGO_ARCHIVED = '7e510000-0000-4000-8000-00000000ba12';
const LOGO_DRAFT = '7e510000-0000-4000-8000-00000000ba13';
const LOGO_SPARE = '7e510000-0000-4000-8000-00000000ba14';
const REV_PUBLISHED = '7e510000-0000-4000-8000-00000000ba21';
const REV_ARCHIVED = '7e510000-0000-4000-8000-00000000ba22';
const REV_DRAFT = '7e510000-0000-4000-8000-00000000ba23';

async function pgErrorCodeOf(
  fn: () => Promise<unknown>,
): Promise<{ code: string; message: string }> {
  try {
    await fn();
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { code: err.code ?? '', message: err.message ?? '' };
  }
  throw new Error('expected the statement to fail, but it succeeded');
}

describe('0238 app.guard_org_brand_revision (disposable Postgres)', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  let client: pg.PoolClient;

  beforeAll(async () => {
    client = await pool.connect();
    await client.query(
      `ALTER TABLE public.be_organizations DISABLE ROW LEVEL SECURITY;
       ALTER TABLE public.platform_users DISABLE ROW LEVEL SECURITY;
       ALTER TABLE public.media_files DISABLE ROW LEVEL SECURITY;
       ALTER TABLE public.org_brand_revisions DISABLE ROW LEVEL SECURITY;`,
    );
    const tryQuery = async (sql: string): Promise<void> => {
      try {
        await client.query(sql);
      } catch {
        /* not the table owner (or no such trigger): continue */
      }
    };
    await tryQuery('ALTER TABLE public.be_organizations DISABLE TRIGGER USER');
    await client.query(
      "INSERT INTO public.be_organizations (id, title, is_active) VALUES ($1::uuid, 'guard probe org', true)",
      [ORG],
    );
    await tryQuery('ALTER TABLE public.be_organizations ENABLE TRIGGER USER');
    await client.query(
      "INSERT INTO public.platform_users (id, display_name, role) VALUES ($1::uuid, 'guard probe actor', 'doctor')",
      [ACTOR],
    );
    for (const media of [LOGO_PUBLISHED, LOGO_ARCHIVED, LOGO_DRAFT, LOGO_SPARE]) {
      await client.query(
        `INSERT INTO public.media_files
           (id, original_name, stored_path, mime_type, size_bytes, status, owner_kind, organization_id)
         VALUES ($1::uuid, 'logo.png', 'guard/probe/' || $1::text, 'image/png', 10, 'ready', 'organization', $2::uuid)`,
        [media, ORG],
      );
    }
    // Every revision starts as a draft (the guard forbids anything else) and reaches its state
    // through the same transitions the service performs.
    for (const [id, logo] of [
      [REV_ARCHIVED, LOGO_ARCHIVED],
      [REV_PUBLISHED, LOGO_PUBLISHED],
      [REV_DRAFT, LOGO_DRAFT],
    ] as const) {
      await client.query(
        `INSERT INTO public.org_brand_revisions
           (id, organization_id, status, display_name, logo_media_id, created_by_platform_user_id)
         VALUES ($1::uuid, $2::uuid, 'draft', 'probe ' || $1::text, $3::uuid, $4::uuid)`,
        [id, ORG, logo, ACTOR],
      );
      if (id === REV_DRAFT) continue;
      await client.query(
        `UPDATE public.org_brand_revisions
            SET status = 'published', published_at = now(), published_by_platform_user_id = $2::uuid
          WHERE id = $1::uuid`,
        [id, ACTOR],
      );
      if (id === REV_ARCHIVED) {
        await client.query(
          `UPDATE public.org_brand_revisions
              SET status = 'archived', archived_at = now(), archived_by_platform_user_id = $2::uuid
            WHERE id = $1::uuid`,
          [id, ACTOR],
        );
      }
    }
  });

  afterAll(async () => {
    if (client) {
      await client.query(
        `ALTER TABLE public.be_organizations ENABLE ROW LEVEL SECURITY;
         ALTER TABLE public.platform_users ENABLE ROW LEVEL SECURITY;
         ALTER TABLE public.media_files ENABLE ROW LEVEL SECURITY;
         ALTER TABLE public.org_brand_revisions ENABLE ROW LEVEL SECURITY;`,
      );
      client.release();
    }
    await pool.end();
  });

  /**
   * Re-audit M-1 (2026-07-25): the HIGH-2 tolerance originally accepted ANY single-column
   * logo_media_id -> NULL write, so a plain `UPDATE … SET logo_media_id = NULL WHERE id = …` issued
   * directly by app_staff silently blanked the LIVE branded surface and rewrote an ARCHIVED
   * (append-only) row — with no trace at all, because the branch deliberately does not re-stamp
   * updated_at. Only the referential action may take that path (it runs inside the RI trigger of the
   * media_files DELETE, i.e. pg_trigger_depth() >= 2; a direct statement is depth 1).
   * MUST run before the FK-purge cases below, which are what clear these logos.
   */
  it('rejects a DIRECT logo-clearing UPDATE on published and archived revisions (M-1)', async () => {
    for (const [label, id, failure] of [
      ['published', REV_PUBLISHED, /org_brand_revision_published_only_archives/],
      ['archived', REV_ARCHIVED, /org_brand_revision_archived_is_immutable/],
    ] as const) {
      const before = await client.query<{ logo: string | null; updated_at: string }>(
        'SELECT logo_media_id AS logo, updated_at FROM public.org_brand_revisions WHERE id = $1::uuid',
        [id],
      );
      // Guards the premise: a NULL logo here would make the case vacuous.
      expect(before.rows[0]?.logo, `${label}: fixture must still carry a logo`).not.toBeNull();

      const error = await pgErrorCodeOf(() =>
        client.query(
          'UPDATE public.org_brand_revisions SET logo_media_id = NULL WHERE id = $1::uuid',
          [id],
        ),
      );
      expect(error.code, label).toBe('P0001');
      expect(error.message, label).toMatch(failure);

      const after = await client.query<{ logo: string | null; updated_at: string }>(
        'SELECT logo_media_id AS logo, updated_at FROM public.org_brand_revisions WHERE id = $1::uuid',
        [id],
      );
      expect(after.rows[0]?.logo, `${label}: logo must survive`).toBe(before.rows[0]?.logo);
      expect(after.rows[0]?.updated_at, `${label}: row must be untouched`).toEqual(
        before.rows[0]?.updated_at,
      );
    }
  });

  it('lets the media purge delete a logo referenced by a PUBLISHED revision (FK SET NULL)', async () => {
    const before = await client.query<{ updated_at: string; display_name: string }>(
      'SELECT updated_at::text, display_name FROM public.org_brand_revisions WHERE id = $1::uuid',
      [REV_PUBLISHED],
    );
    // Exactly the purge worker's statement shape (s3MediaStorage.purgePendingMediaDeleteBatch).
    const deleted = await client.query('DELETE FROM public.media_files WHERE id = $1::uuid', [
      LOGO_PUBLISHED,
    ]);
    expect(deleted.rowCount).toBe(1);
    const after = await client.query<{
      status: string;
      logo_media_id: string | null;
      display_name: string;
      updated_at: string;
      has_publisher: boolean;
    }>(
      `SELECT status, logo_media_id::text, display_name, updated_at::text,
              (published_by_platform_user_id IS NOT NULL) AS has_publisher
         FROM public.org_brand_revisions WHERE id = $1::uuid`,
      [REV_PUBLISHED],
    );
    // Degraded, not deleted: §10 platform fallback + safe org text, audit trail intact.
    expect(after.rows[0]?.status).toBe('published');
    expect(after.rows[0]?.logo_media_id).toBeNull();
    expect(after.rows[0]?.display_name).toBe(before.rows[0]?.display_name);
    expect(after.rows[0]?.has_publisher).toBe(true);
    // Nothing but logo_media_id changed — the tolerance does not re-stamp updated_at.
    expect(after.rows[0]?.updated_at).toBe(before.rows[0]?.updated_at);
  });

  it('lets the media purge delete a logo referenced by an ARCHIVED revision', async () => {
    const deleted = await client.query('DELETE FROM public.media_files WHERE id = $1::uuid', [
      LOGO_ARCHIVED,
    ]);
    expect(deleted.rowCount).toBe(1);
    const after = await client.query<{ status: string; logo_media_id: string | null }>(
      'SELECT status, logo_media_id::text FROM public.org_brand_revisions WHERE id = $1::uuid',
      [REV_ARCHIVED],
    );
    expect(after.rows[0]?.status).toBe('archived');
    expect(after.rows[0]?.logo_media_id).toBeNull();
  });

  it('lets the media purge delete a logo referenced by a DRAFT revision', async () => {
    const deleted = await client.query('DELETE FROM public.media_files WHERE id = $1::uuid', [
      LOGO_DRAFT,
    ]);
    expect(deleted.rowCount).toBe(1);
    const after = await client.query<{ logo_media_id: string | null }>(
      'SELECT logo_media_id::text FROM public.org_brand_revisions WHERE id = $1::uuid',
      [REV_DRAFT],
    );
    expect(after.rows[0]?.logo_media_id).toBeNull();
  });

  it('still rejects every other edit of a published or archived revision', async () => {
    // Re-publish a revision WITH a logo so the "set a new logo" cases are meaningful again.
    await client.query(
      `UPDATE public.org_brand_revisions SET logo_media_id = $2::uuid WHERE id = $1::uuid`,
      [REV_DRAFT, LOGO_SPARE],
    );

    const cases: Array<{ label: string; sql: string; params: unknown[]; failure: RegExp }> = [
      {
        label: 'published: rename in place',
        sql: "UPDATE public.org_brand_revisions SET display_name = 'rebranded' WHERE id = $1::uuid",
        params: [REV_PUBLISHED],
        failure:
          /org_brand_revision_published_only_archives|org_brand_revision_published_content_is_immutable/,
      },
      {
        label: 'published: set a NEW logo',
        sql: 'UPDATE public.org_brand_revisions SET logo_media_id = $2::uuid WHERE id = $1::uuid',
        params: [REV_PUBLISHED, LOGO_SPARE],
        failure:
          /org_brand_revision_published_only_archives|org_brand_revision_published_content_is_immutable/,
      },
      {
        label: 'published: clear the logo TOGETHER with another edit',
        sql: "UPDATE public.org_brand_revisions SET logo_media_id = NULL, display_name = 'sneaky' WHERE id = $1::uuid",
        params: [REV_PUBLISHED],
        failure:
          /org_brand_revision_published_only_archives|org_brand_revision_published_content_is_immutable/,
      },
      {
        label: 'published: illegal transition back to draft',
        sql: "UPDATE public.org_brand_revisions SET status = 'draft' WHERE id = $1::uuid",
        params: [REV_PUBLISHED],
        failure: /org_brand_revision_published_only_archives/,
      },
      {
        label: 'archived: rewrite history',
        sql: "UPDATE public.org_brand_revisions SET display_name = 'rewritten' WHERE id = $1::uuid",
        params: [REV_ARCHIVED],
        failure: /org_brand_revision_archived_is_immutable/,
      },
      {
        label: 'archived: set a NEW logo',
        sql: 'UPDATE public.org_brand_revisions SET logo_media_id = $2::uuid WHERE id = $1::uuid',
        params: [REV_ARCHIVED, LOGO_SPARE],
        failure: /org_brand_revision_archived_is_immutable/,
      },
    ];

    for (const testCase of cases) {
      const failure = await pgErrorCodeOf(() => client.query(testCase.sql, testCase.params));
      expect(failure.code, testCase.label).toBe('P0001');
      expect(failure.message, testCase.label).toMatch(testCase.failure);
    }

    // …and the legal publish -> archive transition still works.
    const archived = await client.query(
      `UPDATE public.org_brand_revisions
          SET status = 'archived', archived_at = now(), archived_by_platform_user_id = $2::uuid
        WHERE id = $1::uuid`,
      [REV_PUBLISHED, ACTOR],
    );
    expect(archived.rowCount).toBe(1);
  });

  // The original file's sixth `it` ("keeps the enrolled-patient read policy free of any other
  // table") is NOT ported here: it asserts `proacl` GRANTs (`app_patient=X/`, `app_staff=X/`) on
  // the two SECURITY DEFINER accessors. Those grants come from `deploy/postgres/*.sql`
  // role-provisioning, which only real dev/test/prod ever run -- the disposable-Postgres harness
  // replays the Drizzle migration chain only, so `proacl` is empty here regardless of whether the
  // real deploy script is correct. Confirmed empirically: it fails with `proacl` = '' on this
  // harness. Weakening the assertion to pass here would hide a real gap instead of proving one;
  // this check keeps its meaning only where the deploy pipeline actually ran.
});
