import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const query = `COPY (
  SELECT json_agg(json_build_object(
    'owner', pg_get_userbyid(p.proowner),
    'identity', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
    'definition', pg_get_functiondef(p.oid)
  ) ORDER BY n.nspname, p.proname)
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('app', 'public')
    AND p.prosrc ~* 'platform_users'
    AND p.prosrc ~* '(phone_normalized|email_normalized|email_verified_at|patient_phone_trust_at)'
) TO STDOUT`;
const json = execFileSync('sudo', [
  '-n', '-u', 'postgres', 'psql', '-X', '-h', '/var/run/postgresql', '-p', '5432',
  '-d', 'bcb_webapp_dev', '-v', 'ON_ERROR_STOP=1', '-Atc', query,
], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const functions = JSON.parse(json);
const header = `-- BCB-MIGRATION-VERIFY: SELECT count(*) = 0 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'platform_users' AND column_name IN ('phone_normalized', 'email', 'email_normalized', 'email_verified_at', 'patient_phone_trust_at')
--
-- D15b/6: user_contacts is the sole physical phone/e-mail authority.  Function bodies below are
-- copied from the current schema-B roots and converted in this forward migration; privileges stay
-- declaration-owned and are reconciled outside the migration.

`;
const blocks = functions.map(({ owner, identity, definition }) =>
  `-- BCB-MIGRATION-OWNER: ${owner}\n-- D15b/6 root: ${identity}\n${definition.replaceAll('\\n', '\n').trim()}\n;`,
);
writeFileSync(
  'apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql',
  header + blocks.join('\n--> statement-breakpoint\n') + '\n',
);
