import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "db/drizzle-migrations/0217_platform_lfk_ownership.sql"),
  "utf8",
);

describe("0217 platform LFK ownership", () => {
  it("uses an explicit tagged union and never treats NULL alone as platform ownership", () => {
    expect(migration).toContain("owner_kind = 'organization' AND organization_id IS NOT NULL");
    expect(migration).toContain("owner_kind = 'platform' AND organization_id IS NULL");
    expect(migration).toContain("lfk_child_owner_mismatch");
    expect(migration).toContain("lfk_media_owner_mismatch");
    expect(migration).toContain("legacy NULL owner rows require explicit organization reconciliation");
    expect(migration).not.toContain("SET owner_kind = 'platform'");
  });

  it("keeps platform writes fail-closed until the sanctioned U9 principal exists", () => {
    expect(migration).not.toContain("SECURITY DEFINER");
    expect(migration).not.toContain("c4d_platform_lfk_snapshot");
    expect(migration).not.toContain("c4d_platform_lfk_save_");
    expect(migration).not.toContain("c4d_platform_lfk_archive_");
    expect(migration).not.toContain("GRANT EXECUTE");
    expect(migration).toContain("FOR SELECT USING (owner_kind = 'platform'");
  });

  it("allows the same patient and platform template in different organizations only", () => {
    expect(migration).toContain("GROUP BY organization_id, patient_user_id, template_id");
    expect(migration).toContain("duplicate active patient LFK assignment inside one organization");
    expect(migration).toContain(
      "ON public.patient_lfk_assignments (organization_id, patient_user_id, template_id)",
    );
    expect(migration).not.toContain(
      "ON public.patient_lfk_assignments (patient_user_id, template_id)",
    );
  });

  it("leaves the hot media_files owner index to the standalone concurrent operator step", () => {
    expect(migration).toContain("c4d-platform-lfk-media-owner-online-index.sql");
    expect(migration).not.toMatch(/CREATE\s+INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+idx_media_files_owner/i);
  });

  it("does not introduce store packages, grants, purchases or clinic copies", () => {
    expect(migration).not.toContain("exercise_packages");
    expect(migration).not.toContain("content_access_grants");
    expect(migration).not.toContain("purchase");
  });
});
