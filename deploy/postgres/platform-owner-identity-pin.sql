\set ON_ERROR_STOP on

-- C-4 (2026-07-26, docs/ARCHITECTURE/ADMIN_ACCESS_MODEL.md): the idempotent, env-sourced
-- successor to migration 0233_global_admin_hard_role.sql's one-time UPDATE, which hardcoded the
-- owner's address as a literal string in git. This script does the SAME thing — assert
-- `platform_users.role='admin'` for exactly the one identity the platform owner is pinned to — but
-- reads that identity from a psql variable sourced from the environment
-- (`PLATFORM_OWNER_IDENTITY`, apps/webapp/src/config/env.ts) instead of a literal, so the address
-- never needs to appear in a committed file again.
--
-- 0233 stays in place, unreplaced — TEST is rebuilt from a fresh prod dump and the drizzle
-- migration ledger is replayed after that restore, so 0233's literal-address UPDATE already runs
-- again on every such rebuild. This script is the same idempotent idea, additive: not wired into
-- the deploy pipeline yet (that is a follow-up, not part of this change — see the C-4 report), but
-- ready to be invoked the same way as this file's sibling overlays
-- (`sudo -u postgres psql -d "$DB" -v platform_owner_identity="$PLATFORM_OWNER_IDENTITY" -f
-- deploy/postgres/platform-owner-identity-pin.sql`) once it is.
--
-- Idempotent and safe to run any number of times: the WHERE clause only touches a row that is not
-- already exactly right, so running it against an already-correct owner row (the common case) is a
-- true no-op — zero rows updated, nothing to roll back.
--
-- SAFETY, same anchors as 0233: only ever targets the one live, non-merged account matching the
-- pinned identity; never touches an archived or merged row; never seeds a clinic membership (the
-- staff seed at 0143 is doctor-only, `WHERE role = 'doctor'`).
\if :{?platform_owner_identity}
\else
  \echo 'platform-owner-identity-pin.sql: -v platform_owner_identity=... is required; skipping (no-op) if empty.'
  \set platform_owner_identity ''
\endif

UPDATE public.platform_users AS platform_user
SET role = 'admin',
    is_archived = FALSE,
    updated_at = now()
WHERE :'platform_owner_identity' <> ''
  AND platform_user.email_normalized = lower(btrim(:'platform_owner_identity'))
  AND platform_user.merged_into_id IS NULL
  AND (platform_user.role IS DISTINCT FROM 'admin' OR platform_user.is_archived IS DISTINCT FROM FALSE);
