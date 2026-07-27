import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../../db/drizzle-migrations/0262_remove_rubitime_data.sql", import.meta.url),
  "utf8",
);
const journal = readFileSync(
  new URL("../../../db/drizzle-migrations/meta/_journal.json", import.meta.url),
  "utf8",
);

function position(fragment: string): number {
  const index = migration.indexOf(fragment);
  expect(index, `missing migration fragment: ${fragment}`).toBeGreaterThanOrEqual(0);
  return index;
}

describe("0262 Rubitime data removal migration", () => {
  /**
   * The first cut of this migration updated `source` BEFORE dropping the old CHECK, and this test
   * pinned that order — i.e. the test encoded the bug. Against the live TEST database the update
   * failed immediately: the old constraint does not allow 'imported'. Caught by a rolled-back dry
   * run, not by review. The order below is the one that actually works, and it is pinned so nobody
   * "tidies" it back.
   */
  it("drops the old CHECKs, then rewrites provenance, then re-adds them, then drops physically", () => {
    const patientDropCheck = position("DROP CONSTRAINT IF EXISTS patient_bookings_source_check");
    const appointmentDropCheck = position("DROP CONSTRAINT IF EXISTS be_appointments_source_check");
    const patientUpdate = position("UPDATE public.patient_bookings");
    const appointmentUpdate = position("UPDATE public.be_appointments");
    const patientAddCheck = position("ADD CONSTRAINT patient_bookings_source_check");
    const appointmentAddCheck = position("ADD CONSTRAINT be_appointments_source_check");
    const capability = position("CREATE OR REPLACE FUNCTION app.read_current_patient_booking_rows");
    const firstIndex = position("DROP INDEX IF EXISTS public.patient_bookings_rubitime_id_key");
    const firstColumn = position("DROP COLUMN IF EXISTS rubitime_service_id");
    const firstTable = position("DROP TABLE IF EXISTS integrator.booking_calendar_map");

    expect(patientDropCheck).toBeLessThan(patientUpdate);
    expect(appointmentDropCheck).toBeLessThan(appointmentUpdate);
    expect(patientUpdate).toBeLessThan(patientAddCheck);
    expect(appointmentUpdate).toBeLessThan(appointmentAddCheck);
    expect(patientAddCheck).toBeLessThan(capability);
    expect(appointmentAddCheck).toBeLessThan(capability);
    expect(capability).toBeLessThan(firstIndex);
    expect(firstIndex).toBeLessThan(firstColumn);
    expect(firstColumn).toBeLessThan(firstTable);
    expect(migration).toContain("WHERE source = 'rubitime_projection'");
    expect(migration).toContain("ARRAY['native'::text, 'imported'::text]");
    expect(migration).not.toContain("'rubitime_id', row.rubitime_id");
  });

  it("drops the exact requested indexes, columns and integrator tables repeat-safely", () => {
    for (const index of [
      "patient_bookings_rubitime_id_key",
      "idx_patient_bookings_rubitime_id",
      "idx_booking_branches_rubitime_id",
      "idx_booking_specialists_rubitime_id",
    ]) {
      expect(migration).toContain(`DROP INDEX IF EXISTS public.${index}`);
    }

    for (const column of [
      "rubitime_service_id",
      "rubitime_branch_id",
      "rubitime_cooperator_id",
      "rubitime_id",
      "rubitime_manage_url",
      "rubitime_branch_id_snapshot",
      "rubitime_cooperator_id_snapshot",
      "rubitime_service_id_snapshot",
    ]) {
      expect(migration).toContain(`DROP COLUMN IF EXISTS ${column}`);
    }

    const tables = [
      "booking_calendar_map",
      "rubitime_booking_profiles",
      "rubitime_events",
      "rubitime_records",
      "rubitime_api_throttle",
      "rubitime_branches",
      "rubitime_services",
      "rubitime_cooperators",
    ];
    let previous = -1;
    for (const table of tables) {
      const current = position(`DROP TABLE IF EXISTS integrator.${table}`);
      expect(current).toBeGreaterThan(previous);
      previous = current;
    }
  });

  it("registers the next version-7 Drizzle journal entry", () => {
    expect(journal).toContain('"idx": 262');
    expect(journal).toContain('"version": "7"');
    expect(journal).toContain('"when": 1793539200059');
    expect(journal).toContain('"tag": "0262_remove_rubitime_data"');
  });
});
