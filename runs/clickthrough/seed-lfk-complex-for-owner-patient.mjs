#!/usr/bin/env node
/**
 * Seeds ONE real LFK complex for the owner's own patient account (Дмитрий Берсон), by replaying
 * the exact INSERTs that apps/webapp/src/infra/repos/pgLfkAssignments.ts
 * (assignPublishedTemplateToPatient) performs when a doctor assigns a published LFK template —
 * there is currently no product route wired to call that function, so this script drives the same
 * SQL directly via `sudo -u postgres psql` (bypasses RLS as a seed-only convenience; the RLS path
 * itself is exercised for real when the diary journal is opened AS THE PATIENT afterwards — see
 * runs/clickthrough/flows/lfkDiary.mjs).
 *
 * Why this exists: taskdb #1032 (pgLfkDiary.ts listComplexes INNER JOINs lfk_exercise_media,
 * which app_patient has never had SELECT on) can only throw once a patient actually owns a
 * complex whose exercises have media. The owner's test patient started with zero complexes — the
 * G4 walk got a false-clean 200 for exactly that reason. This script closes that gap once,
 * idempotently (safe to re-run: does nothing if the complex already exists).
 *
 * TEST only, owner's own patient only — hardcoded ids below, no CLI args that could redirect this
 * at a different patient/org/database. Read-only preconditions are re-verified before any write.
 */
import { execFileSync } from "node:child_process";

const ALLOWED_DB = "bersoncarebot_test";
// Owner's own accounts only (see docs/_TODO/SAAS_FOUNDATION/scripts/regenerate-saas-smoke-fixture.mjs
// for the same-class convention). Never parameterize these from argv/env.
const PATIENT_USER_ID = "1c312a64-fab8-4b75-b24e-88a1d6ebe4e0"; // Дмитрий Берсон
const DOCTOR_USER_ID = "b0021a38-fb86-45e9-9aec-d85014e932d4"; // owner's clinic account
const ORG_ID = "a0000000-0000-4000-8000-000000000001"; // Точка Здоровья
const TEMPLATE_ID = "0b26db48-2e8f-406d-8bbf-a01cb2ec4225"; // "Стабилизация поясницы - острый период", published, org-owned, exercises carry media

function psql(sql, { db = ALLOWED_DB } = {}) {
  return execFileSync("sudo", ["-u", "postgres", "psql", "-d", db, "-X", "-A", "-t", "-c", sql], {
    encoding: "utf8",
  });
}

function assertTestDb(db) {
  if (db !== ALLOWED_DB) {
    throw new Error(`refusing: this script only ever targets "${ALLOWED_DB}", got ${JSON.stringify(db)}`);
  }
  const actual = psql("SELECT current_database();").trim();
  if (actual !== ALLOWED_DB) {
    throw new Error(`refusing: current_database()=${JSON.stringify(actual)}, expected ${ALLOWED_DB}`);
  }
}

function main() {
  assertTestDb(ALLOWED_DB);

  const existing = psql(
    `SELECT id FROM lfk_complexes WHERE platform_user_id = '${PATIENT_USER_ID}'::uuid AND organization_id = '${ORG_ID}'::uuid AND is_active = true;`,
  ).trim();
  if (existing) {
    console.log(`already seeded: lfk_complexes.id=${existing} (no write performed)`);
    return;
  }

  const tpl = psql(
    `SELECT status FROM lfk_complex_templates WHERE id = '${TEMPLATE_ID}'::uuid AND organization_id = '${ORG_ID}'::uuid;`,
  ).trim();
  if (tpl !== "published") {
    throw new Error(`refusing: template ${TEMPLATE_ID} is not published for org ${ORG_ID} (status=${JSON.stringify(tpl)})`);
  }

  const sql = `
BEGIN;
WITH tpl AS (
  SELECT id, title FROM lfk_complex_templates WHERE id = '${TEMPLATE_ID}'::uuid AND status = 'published'
),
complex_ins AS (
  INSERT INTO lfk_complexes (organization_id, user_id, platform_user_id, title, origin, is_active, updated_at)
  SELECT '${ORG_ID}'::uuid, '${PATIENT_USER_ID}'::text, '${PATIENT_USER_ID}'::uuid, tpl.title, 'assigned_by_specialist', true, now()
  FROM tpl
  RETURNING id
)
SELECT id FROM complex_ins \\gset complex_

INSERT INTO lfk_complex_exercises
  (organization_id, complex_id, exercise_id, sort_order, reps, sets, side, max_pain_0_10, comment, local_comment)
SELECT '${ORG_ID}'::uuid, :'complex_id', lcte.exercise_id, lcte.sort_order, lcte.reps, lcte.sets, lcte.side, lcte.max_pain_0_10, lcte.comment, NULL
FROM lfk_complex_template_exercises lcte
WHERE lcte.template_id = '${TEMPLATE_ID}'::uuid
ORDER BY lcte.sort_order ASC, lcte.id ASC;

INSERT INTO patient_lfk_assignments (patient_user_id, template_id, complex_id, assigned_by, assigned_at, is_active, organization_id)
VALUES ('${PATIENT_USER_ID}'::uuid, '${TEMPLATE_ID}'::uuid, :'complex_id', '${DOCTOR_USER_ID}'::uuid, now(), true, '${ORG_ID}'::uuid);

SELECT :'complex_id' AS created_complex_id;
COMMIT;
`;
  const out = execFileSync("sudo", ["-u", "postgres", "psql", "-d", ALLOWED_DB, "-X", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
    input: sql,
    encoding: "utf8",
  });
  console.log(out);
  console.log("seeded ok");
}

main();
