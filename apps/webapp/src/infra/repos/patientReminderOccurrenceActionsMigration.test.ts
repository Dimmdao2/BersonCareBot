import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoDir = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(
  repoDir,
  "../../../db/drizzle-migrations/0253_patient_reminder_occurrence_actions.sql",
);
const journalPath = join(repoDir, "../../../db/drizzle-migrations/meta/_journal.json");
const deployPath = join(repoDir, "../../../../../deploy/host/deploy-test-saas.sh");
const inviteOwnershipPath = join(
  repoDir,
  "../../../../../deploy/postgres/organization-member-invites-rls.sql",
);

function functionStatement(migration: string, signature: string): string {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
  expect(start).toBeGreaterThan(-1);
  const bodyStart = migration.indexOf("$function$", start);
  const bodyEnd = migration.indexOf("$function$", bodyStart + "$function$".length);
  expect(bodyEnd).toBeGreaterThan(bodyStart);
  return migration.slice(start, bodyEnd + "$function$".length);
}

describe("0253 patient reminder occurrence actions", () => {
  const migration = readFileSync(migrationPath, "utf8");

  it("registers the next custom-SQL migration journal entry", () => {
    const journal = readFileSync(journalPath, "utf8");
    expect(journal).toContain('"idx": 253');
    expect(journal).toContain('"version": "7"');
    expect(journal).toContain('"when": 1793539200050');
    expect(journal).toContain('"tag": "0253_patient_reminder_occurrence_actions"');
  });

  it("pins both narrow definers to app_owner and grants their exact signatures only to app_patient", () => {
    const signatures = [
      "app.patient_snooze_reminder_occurrence(uuid, text, integer)",
      "app.patient_skip_reminder_occurrence(uuid, text, text)",
    ];
    for (const signature of signatures) {
      expect(migration).toContain(`ALTER FUNCTION ${signature} OWNER TO app_owner;`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC;`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO app_patient;`);
    }
    expect(migration).not.toMatch(
      /GRANT\s+(?:SELECT|UPDATE|ALL)[^;]*ON\s+(?:TABLE\s+)?public\.reminder_occurrence_history\s+TO\s+app_patient/i,
    );
  });

  it("re-states the signed patient ownership bridge inside each BYPASSRLS body", () => {
    for (const signature of [
      "app.patient_snooze_reminder_occurrence(",
      "app.patient_skip_reminder_occurrence(",
    ]) {
      const fn = functionStatement(migration, signature);
      expect(fn).toContain("SECURITY DEFINER");
      expect(fn).toContain("SET search_path = pg_catalog");
      expect(fn).toContain("p_platform_user_id = app.current_patient_user_id()");
      expect(fn).toContain("patient.integrator_user_id = occurrence.integrator_user_id");
      expect(fn).toContain("patient.id = app.current_patient_user_id()");
      expect(fn).toContain("patient.id = p_platform_user_id");
    }
  });

  it("pins the two required app_owner table grants and the reviewed definer count", () => {
    const deploy = readFileSync(deployPath, "utf8");
    expect(deploy).toContain("('public.reminder_occurrence_history', 'SELECT')");
    expect(deploy).toContain("('public.reminder_occurrence_history', 'UPDATE')");
    // 106 -> 107: 0267 adds the staff-name directory accessor, 0268 adds the delivery-audit
    // writer, and 0269 removes the superseded signup-slug reservation function.
    expect(deploy).toContain("local expected_secdef_count=110");

    const ownershipOverlay = readFileSync(inviteOwnershipPath, "utf8");
    expect(ownershipOverlay).not.toContain("patient_snooze_reminder_occurrence");
    expect(ownershipOverlay).not.toContain("patient_skip_reminder_occurrence");
  });
});
