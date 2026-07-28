import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoDir = process.cwd();
const migration = readFileSync(
  join(repoDir, "db/drizzle-migrations/0269_integrator_global_delivery_attempt_audit.sql"),
  "utf8",
);
const journal = readFileSync(
  join(repoDir, "db/drizzle-migrations/meta/_journal.json"),
  "utf8",
);
const runtimeOverlay = readFileSync(
  join(repoDir, "../../deploy/postgres/integrator-server-runtime-config.sql"),
  "utf8",
);

describe("integrator global delivery-attempt audit migration", () => {
  it("uses a narrow app_owner capability instead of a direct API-login table grant", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION app.record_global_email_delivery_attempt(");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = pg_catalog");
    expect(migration).toContain("p_intent_type IS DISTINCT FROM 'message.send'");
    expect(migration).toContain("NULLIF(btrim(p_intent_event_id), '') IS NULL");
    expect(migration).toContain("p_channel IS DISTINCT FROM 'email'");
    expect(migration).toContain("INSERT INTO integrator.delivery_attempt_logs");
    expect(migration).toContain("OWNER TO app_owner");
    expect(migration).toContain("FROM PUBLIC, app_staff, app_patient, app_worker");

    expect(runtimeOverlay).toContain(
      "GRANT EXECUTE ON FUNCTION app.record_global_email_delivery_attempt(",
    );
    expect(runtimeOverlay).toContain(
      "REVOKE INSERT ON TABLE integrator.delivery_attempt_logs",
    );
    expect(runtimeOverlay).toContain(
      "REVOKE USAGE ON SEQUENCE integrator.delivery_attempt_logs_id_seq",
    );
  });

  it("registers the reserved 0269 migration in the ordered journal", () => {
    expect(journal).toContain('"idx": 267');
    expect(journal).toContain('"tag": "0269_integrator_global_delivery_attempt_audit"');
  });
});
