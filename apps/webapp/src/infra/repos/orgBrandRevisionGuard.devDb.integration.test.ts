/**
 * Opt-in EXECUTABLE proof for migration 0238's write chokepoint — the two behaviours the pure
 * string-matching migration test cannot see (independent adversarial audit, 2026-07-25, HIGH 2):
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
 * Runs ONLY against a disposable/dev database, never TEST or prod:
 *   USE_REAL_DATABASE=1 RUN_ORG_BRAND_GUARD_DB=1 \
 *   DATABASE_URL=postgres://…/bcb_saas_brand_scratch_… \
 *   pnpm exec vitest run src/infra/repos/orgBrandRevisionGuard.devDb.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const ORG = "7e510000-0000-4000-8000-00000000ba01";
const ACTOR = "7e510000-0000-4000-8000-00000000ba02";
const LOGO_PUBLISHED = "7e510000-0000-4000-8000-00000000ba11";
const LOGO_ARCHIVED = "7e510000-0000-4000-8000-00000000ba12";
const LOGO_DRAFT = "7e510000-0000-4000-8000-00000000ba13";
const LOGO_SPARE = "7e510000-0000-4000-8000-00000000ba14";
const REV_PUBLISHED = "7e510000-0000-4000-8000-00000000ba21";
const REV_ARCHIVED = "7e510000-0000-4000-8000-00000000ba22";
const REV_DRAFT = "7e510000-0000-4000-8000-00000000ba23";

const enabled =
  process.env.RUN_ORG_BRAND_GUARD_DB === "1" &&
  process.env.USE_REAL_DATABASE === "1" &&
  Boolean((process.env.DATABASE_URL ?? "").trim());

/** Refuse anything that is not an obviously disposable scratch/rehearsal DB or the dev DB. */
async function assertDisposableDb(client: pg.PoolClient): Promise<string> {
  const r = await client.query<{ n: string }>("SELECT current_database() AS n");
  const name = r.rows[0]?.n ?? "";
  const ok = /_dev$/i.test(name) || /^bcb_[a-z0-9_]*(scratch|rehearsal)[a-z0-9_]*$/i.test(name);
  if (!ok) {
    throw new Error(`refusing: current_database="${name}" — expected a dev or bcb_*scratch*/rehearsal DB.`);
  }
  // The table is FORCE RLS and the fixture needs table ownership, so this probe must run on a
  // superuser / BYPASSRLS connection. Say so loudly instead of failing as "0 rows affected".
  const priv = await client.query<{ ok: boolean }>(
    "SELECT (rolsuper OR rolbypassrls) AS ok FROM pg_roles WHERE rolname = current_user",
  );
  if (priv.rows[0]?.ok !== true) {
    throw new Error(
      `refusing: current_user is neither superuser nor BYPASSRLS — public.org_brand_revisions is FORCE RLS, so this fixture cannot be created on "${name}".`,
    );
  }
  return name;
}

async function pgErrorCodeOf(fn: () => Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await fn();
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { code: err.code ?? "", message: err.message ?? "" };
  }
  throw new Error("expected the statement to fail, but it succeeded");
}

describe.skipIf(!enabled)("0238 app.guard_org_brand_revision (real DB, opt-in)", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  let client: pg.PoolClient;

  async function cleanup(): Promise<void> {
    await client.query("DELETE FROM public.org_brand_revisions WHERE organization_id = $1::uuid", [ORG]);
    await client.query("DELETE FROM public.media_files WHERE organization_id = $1::uuid", [ORG]);
    await client.query("DELETE FROM public.org_enrollments WHERE organization_id = $1::uuid", [ORG]);
    await client.query("DELETE FROM public.be_organizations WHERE id = $1::uuid", [ORG]);
    await client.query("DELETE FROM public.platform_users WHERE id = $1::uuid", [ACTOR]);
  }

  beforeAll(async () => {
    client = await pool.connect();
    await assertDisposableDb(client);
    await cleanup();
    // The organization insert trigger seeds a reference catalog a bare scratch DB may not have. The
    // ALTERs need table ownership, which the connection may not hold — best effort, and the INSERT
    // below is the real assertion either way.
    const tryQuery = async (sql: string): Promise<void> => {
      try {
        await client.query(sql);
      } catch {
        /* not the table owner (or no such trigger): continue */
      }
    };
    await tryQuery("ALTER TABLE public.be_organizations DISABLE TRIGGER USER");
    await client.query(
      "INSERT INTO public.be_organizations (id, title, is_active) VALUES ($1::uuid, 'guard probe org', true)",
      [ORG],
    );
    await tryQuery("ALTER TABLE public.be_organizations ENABLE TRIGGER USER");
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
      await cleanup();
      client.release();
    }
    await pool.end();
  });

  it("lets the media purge delete a logo referenced by a PUBLISHED revision (FK SET NULL)", async () => {
    const before = await client.query<{ updated_at: string; display_name: string }>(
      "SELECT updated_at::text, display_name FROM public.org_brand_revisions WHERE id = $1::uuid",
      [REV_PUBLISHED],
    );
    // Exactly the purge worker's statement shape (s3MediaStorage.purgePendingMediaDeleteBatch).
    const deleted = await client.query("DELETE FROM public.media_files WHERE id = $1::uuid", [
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
    expect(after.rows[0]?.status).toBe("published");
    expect(after.rows[0]?.logo_media_id).toBeNull();
    expect(after.rows[0]?.display_name).toBe(before.rows[0]?.display_name);
    expect(after.rows[0]?.has_publisher).toBe(true);
    // Nothing but logo_media_id changed — the tolerance does not re-stamp updated_at.
    expect(after.rows[0]?.updated_at).toBe(before.rows[0]?.updated_at);
  });

  it("lets the media purge delete a logo referenced by an ARCHIVED revision", async () => {
    const deleted = await client.query("DELETE FROM public.media_files WHERE id = $1::uuid", [
      LOGO_ARCHIVED,
    ]);
    expect(deleted.rowCount).toBe(1);
    const after = await client.query<{ status: string; logo_media_id: string | null }>(
      "SELECT status, logo_media_id::text FROM public.org_brand_revisions WHERE id = $1::uuid",
      [REV_ARCHIVED],
    );
    expect(after.rows[0]?.status).toBe("archived");
    expect(after.rows[0]?.logo_media_id).toBeNull();
  });

  it("lets the media purge delete a logo referenced by a DRAFT revision", async () => {
    const deleted = await client.query("DELETE FROM public.media_files WHERE id = $1::uuid", [LOGO_DRAFT]);
    expect(deleted.rowCount).toBe(1);
    const after = await client.query<{ logo_media_id: string | null }>(
      "SELECT logo_media_id::text FROM public.org_brand_revisions WHERE id = $1::uuid",
      [REV_DRAFT],
    );
    expect(after.rows[0]?.logo_media_id).toBeNull();
  });

  it("still rejects every other edit of a published or archived revision", async () => {
    // Re-publish a revision WITH a logo so the "set a new logo" cases are meaningful again.
    await client.query(
      `UPDATE public.org_brand_revisions SET logo_media_id = $2::uuid WHERE id = $1::uuid`,
      [REV_DRAFT, LOGO_SPARE],
    );

    const cases: Array<{ label: string; sql: string; params: unknown[]; failure: RegExp }> = [
      {
        label: "published: rename in place",
        sql: "UPDATE public.org_brand_revisions SET display_name = 'rebranded' WHERE id = $1::uuid",
        params: [REV_PUBLISHED],
        failure: /org_brand_revision_published_only_archives|org_brand_revision_published_content_is_immutable/,
      },
      {
        label: "published: set a NEW logo",
        sql: "UPDATE public.org_brand_revisions SET logo_media_id = $2::uuid WHERE id = $1::uuid",
        params: [REV_PUBLISHED, LOGO_SPARE],
        failure: /org_brand_revision_published_only_archives|org_brand_revision_published_content_is_immutable/,
      },
      {
        label: "published: clear the logo TOGETHER with another edit",
        sql: "UPDATE public.org_brand_revisions SET logo_media_id = NULL, display_name = 'sneaky' WHERE id = $1::uuid",
        params: [REV_PUBLISHED],
        failure: /org_brand_revision_published_only_archives|org_brand_revision_published_content_is_immutable/,
      },
      {
        label: "published: illegal transition back to draft",
        sql: "UPDATE public.org_brand_revisions SET status = 'draft' WHERE id = $1::uuid",
        params: [REV_PUBLISHED],
        failure: /org_brand_revision_published_only_archives/,
      },
      {
        label: "archived: rewrite history",
        sql: "UPDATE public.org_brand_revisions SET display_name = 'rewritten' WHERE id = $1::uuid",
        params: [REV_ARCHIVED],
        failure: /org_brand_revision_archived_is_immutable/,
      },
      {
        label: "archived: set a NEW logo",
        sql: "UPDATE public.org_brand_revisions SET logo_media_id = $2::uuid WHERE id = $1::uuid",
        params: [REV_ARCHIVED, LOGO_SPARE],
        failure: /org_brand_revision_archived_is_immutable/,
      },
    ];

    for (const testCase of cases) {
      const failure = await pgErrorCodeOf(() => client.query(testCase.sql, testCase.params));
      expect(failure.code, testCase.label).toBe("P0001");
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

  it("keeps the enrolled-patient read policy free of any other table (no caller-privilege coupling)", async () => {
    const policy = await client.query<{ qual: string }>(
      `SELECT pg_get_expr(polqual, polrelid) AS qual
         FROM pg_policy
        WHERE polrelid = 'public.org_brand_revisions'::regclass
          AND polname = 'org_brand_revisions_enrolled_patient_published_read'`,
    );
    const qual = policy.rows[0]?.qual ?? "";
    expect(qual).toContain("app.current_patient_has_active_org_enrollment(organization_id)");
    expect(qual).not.toMatch(/org_enrollments|be_organizations/);

    const accessors = await client.query<{
      proname: string;
      owner: string;
      prosecdef: boolean;
      proconfig: string | null;
      acl: string | null;
    }>(
      `SELECT p.proname, pg_get_userbyid(p.proowner) AS owner, p.prosecdef,
              p.proconfig::text AS proconfig, p.proacl::text AS acl
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'app'
          AND p.proname IN ('current_patient_has_active_org_enrollment', 'read_org_brand_core_context')
        ORDER BY p.proname`,
    );
    expect(accessors.rows).toHaveLength(2);
    for (const row of accessors.rows) {
      expect(row.prosecdef, row.proname).toBe(true);
      expect(row.owner, row.proname).toBe("app_owner");
      expect(row.proconfig ?? "", row.proname).toContain("search_path=pg_catalog");
      // No PUBLIC (=X/) grant; only the two runtime roles plus the owner.
      expect(row.acl ?? "", row.proname).not.toMatch(/(^|,)=X\//);
      expect(row.acl ?? "", row.proname).toContain("app_patient=X/");
      expect(row.acl ?? "", row.proname).toContain("app_staff=X/");
    }
  });
});
