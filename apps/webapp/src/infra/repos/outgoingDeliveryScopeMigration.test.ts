import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = new URL(
  "../../../db/drizzle-migrations/0260_outgoing_delivery_scope_text_ids.sql",
  import.meta.url,
);
const journalPath = new URL(
  "../../../db/drizzle-migrations/meta/_journal.json",
  import.meta.url,
);
const runtimeOverlayPath = new URL(
  "../../../../../deploy/postgres/c4-operational-runtime.sql",
  import.meta.url,
);
const deployHostPath = new URL(
  "../../../../../deploy/host/deploy-test-saas.sh",
  import.meta.url,
);

describe("0260 outgoing delivery scope text identifier fix", () => {
  const migration = readFileSync(migrationPath, "utf8");
  const runtimeOverlay = readFileSync(runtimeOverlayPath, "utf8");

  it.each([
    ["migration", migration],
    ["C4 runtime overlay", runtimeOverlay],
  ])("keeps UUID payload validation but compares reminder text keys without a column cast in the %s", (_label, sql) => {
    expect(sql).toContain("v_occurrence_id text;");
    expect(sql).toContain("v_occurrence_id := queue_payload ->> 'occurrenceId';");
    expect(sql).toContain("WHERE occurrence.id = v_occurrence_id;");
    expect(sql).toContain("rule.id = occurrence.rule_id");
    expect(sql).not.toMatch(/occurrence\.id::uuid\s*=/);
    expect(sql).not.toMatch(/occurrence\.id\s*=\s*v_occurrence_id::uuid/);
    expect(sql).toContain("'invalid_occurrence_id'");
  });

  it("preserves the resolver signature and security contract without changing the definer count", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION app.resolve_outgoing_delivery_scope(p_queue_id uuid)",
    );
    expect(migration).toContain("LANGUAGE plpgsql\nSTABLE\nSECURITY DEFINER\nSET search_path = pg_catalog");
    expect(migration).toContain(
      "ALTER FUNCTION app.resolve_outgoing_delivery_scope(uuid) OWNER TO app_owner;",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION app.resolve_outgoing_delivery_scope(uuid) TO app_operational_delivery_worker;",
    );
    // 105 -> 106: migration 0261 adds the single reviewed
    // app.is_platform_registration_analytics_user_excluded(uuid) SECURITY DEFINER.
    expect(readFileSync(deployHostPath, "utf8")).toContain("local expected_secdef_count=106");
  });

  it("keeps the UUID-to-UUID operator and broadcast branches unchanged", () => {
    expect(migration).toContain(
      "WHERE incident.id = v_incident_id",
    );
    expect(migration).toContain(
      "WHERE audit.id = v_broadcast_audit_id;",
    );
    expect(migration).toContain("v_incident_id uuid;");
    expect(migration).toContain("v_broadcast_audit_id uuid;");
  });

  it("pins migration 0260 in the Drizzle journal", () => {
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
      entries: Array<Record<string, unknown>>;
    };
    // The exact journal tail grew from three pinned entries to five. Migration 0263 neutralizes
    // the retired provider's remaining provenance values/comments; migration 0264 seeds the
    // global platform-integration availability setting and its two runtime mirrors. Neither adds
    // a SECURITY DEFINER, so the exact deploy count asserted above remains 106. Keep every entry
    // from 0260 exact instead of weakening the contract merely because 0260 is no longer the tail.
    expect(journal.entries.slice(-5)).toEqual([
      {
        idx: 260,
        version: "7",
        when: 1793539200057,
        tag: "0260_outgoing_delivery_scope_text_ids",
        breakpoints: true,
      },
      {
        idx: 261,
        version: "7",
        when: 1793539200058,
        tag: "0261_platform_registration_events_read",
        breakpoints: true,
      },
      {
        idx: 262,
        version: "7",
        when: 1793539200059,
        tag: "0262_remove_rubitime_data",
        breakpoints: true,
      },
      {
        idx: 263,
        version: "7",
        when: 1793539200060,
        tag: "0263_retire_provider_provenance_names",
        breakpoints: true,
      },
      {
        idx: 264,
        version: "7",
        when: 1793539200061,
        tag: "0264_platform_integration_availability",
        breakpoints: true,
      },
    ]);
  });
});
