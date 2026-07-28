import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SYSTEM_SETTING_REGISTRY } from "./registry";

const migration = readFileSync(
  new URL(
    "../../../db/drizzle-migrations/0272_google_calendar_clinic_connection.sql",
    import.meta.url,
  ),
  "utf8",
);
const journal = readFileSync(
  new URL("../../../db/drizzle-migrations/meta/_journal.json", import.meta.url), "utf8");

describe("Google Calendar clinic connection migration", () => {
  it("moves only the clinic-owned connection rows and keeps OAuth application identity global", () => {
    for (const key of [
      "google_refresh_token",
      "google_calendar_id",
      "google_calendar_enabled",
      "google_connected_email",
    ] as const) {
      expect(SYSTEM_SETTING_REGISTRY[key].ownership).toBe("per_org");
      expect(migration).toContain(`'${key}'`);
    }
    for (const key of ["google_client_id", "google_client_secret", "google_redirect_uri"] as const) {
      expect(SYSTEM_SETTING_REGISTRY[key].ownership).toBe("global");
      expect(migration).not.toContain(`'${key}'`);
    }
  });

  it("copies the old connection only for a single clinic and mirrors the exact org identity", () => {
    expect(migration).toContain("HAVING count(*) = 1");
    expect(migration).toContain("INSERT INTO integrator.system_settings");
    expect(migration).toContain("ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL");
    expect(migration).not.toMatch(/^\s*(?:CREATE|ALTER)\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/im);
    expect(migration).not.toMatch(/^\s*GRANT\b/im);
    expect(journal).toContain('"tag": "0272_google_calendar_clinic_connection"');
  });
});
