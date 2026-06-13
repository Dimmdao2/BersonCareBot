import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * F1b: migration 0119 adds `be_appointments.deleted_at` and recreates the specialist
 * no-overlap exclusion constraint with `deleted_at IS NULL`, so soft-deleted rows no
 * longer reserve their slot (a new appointment can be created on the same slot).
 */
const repoDir = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(
  repoDir,
  "../../../db/drizzle-migrations/0119_be_appointments_soft_delete.sql",
);
const journalPath = join(repoDir, "../../../db/drizzle-migrations/meta/_journal.json");

describe("0119 be_appointments soft-delete migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("adds the deleted_at column", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz NULL/);
  });

  it("recreates the no-overlap constraint with deleted_at IS NULL and full status whitelist", () => {
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS "be_appointments_specialist_no_overlap"');
    expect(sql).toContain('ADD CONSTRAINT "be_appointments_specialist_no_overlap"');
    expect(sql).toContain("deleted_at IS NULL");
    for (const status of [
      "cancelled_by_patient",
      "cancelled_by_specialist",
      "late_cancellation",
      "no_show",
      "completed",
      "visit_confirmed",
    ]) {
      expect(sql).toContain(status);
    }
  });

  it("is registered in the drizzle journal", () => {
    const journal = readFileSync(journalPath, "utf8");
    expect(journal).toContain('"tag": "0119_be_appointments_soft_delete"');
  });
});
