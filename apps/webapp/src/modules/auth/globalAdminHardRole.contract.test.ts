import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webappRoot = resolve(import.meta.dirname, '../../..');
const repoRoot = resolve(webappRoot, '../..');
const readRepo = (relativePath: string) => readFileSync(resolve(repoRoot, relativePath), 'utf8');

// Owner ruling 2026-07-25: the global admin (dimmdao@gmail.com) is a HARD, persisted
// platform_users.role='admin' — NOT a session-only admin_emails elevation. This contract pins
// the corrected identity canon end-to-end: the pre-migration data-fix sets the hard role, and the
// migration slot 0233 (previously the session-only demotion) now ASSERTS the same hard role, so the
// admin is never yanked back and forth.
describe("global admin is a hard persisted role='admin'", () => {
  const dataFix = readRepo('deploy/postgres/p0-data-fix-doctor-admin-split.sql');
  const promote = readRepo('apps/webapp/db/drizzle-migrations/0233_global_admin_hard_role.sql');
  const journal = readRepo('apps/webapp/db/drizzle-migrations/meta/_journal.json');
  const service = readRepo('apps/webapp/src/modules/auth/service.ts');

  it("p0 data-fix hard-sets the gmail account to role='admin', separate from the doctor", () => {
    expect(dataFix).toContain('c_admin_email');
    expect(dataFix).toContain('dimmdao@gmail.com');
    expect(dataFix).toMatch(/SET\s+role\s*=\s*'admin'/);
    // Must fail loudly on a duplicate live gmail row and never collapse admin into the doctor row.
    expect(dataFix).toContain('must be separate accounts');
    // The retired session-only language must be gone.
    expect(dataFix).not.toContain('owner email remains session-only');
    expect(dataFix).not.toContain("never persisted as platform_users.role='admin'");
  });

  it('migration 0233 asserts the gmail admin hard role (no demote, no back-and-forth)', () => {
    expect(journal).toContain('"tag": "0233_global_admin_hard_role"');
    expect(journal).not.toContain('demote_legacy_email_admin_artifact');
    expect(promote).toMatch(/SET\s+role\s*=\s*'admin'/);
    expect(promote).not.toMatch(/SET\s+role\s*=\s*'client'/);
    expect(promote).toContain("email_normalized = 'dimmdao@gmail.com'");
    expect(promote).toContain('merged_into_id IS NULL');
    // Never the doctor row.
    expect(promote).toContain("phone_normalized IS DISTINCT FROM '+79643805480'");
  });

  it("the app maps a persisted role='admin' to adminMode (so the hard role actually takes effect)", () => {
    expect(service).toMatch(
      /role\s*===\s*"admin"\s*\?\s*\{\s*\.\.\.base,\s*adminMode:\s*true\s*\}/,
    );
  });
});
