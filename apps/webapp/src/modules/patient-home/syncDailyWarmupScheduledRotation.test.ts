import { describe, expect, it, vi } from "vitest";
import { DateTime } from "luxon";
import { createInMemoryPatientDailyWarmupPresentationPort } from "@/infra/repos/inMemoryPatientDailyWarmupPresentation";
import {
  syncDailyWarmupScheduledRotation,
  type SyncDailyWarmupScheduledRotationDeps,
} from "./syncDailyWarmupScheduledRotation";

vi.mock("@/modules/system-settings/appDisplayTimezone", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/system-settings/appDisplayTimezone")>();
  return {
    ...actual,
    getAppDisplayTimeZone: vi.fn(async () => "Europe/Moscow"),
  };
});

const pages = [
  { contentPageId: "a" },
  { contentPageId: "b" },
  { contentPageId: "c" },
];

function buildDeps(overrides: {
  enabled?: boolean;
  times?: string[];
  lastCompleted?: string | null;
  patientIana?: string | null;
  port?: ReturnType<typeof createInMemoryPatientDailyWarmupPresentationPort>;
}) {
  const port = overrides.port ?? createInMemoryPatientDailyWarmupPresentationPort();
  return {
    patientHomeBlocks: {},
    contentPages: {},
    contentSections: {},
    systemSettings: {
      getSetting: vi.fn(async (key: string) => {
        if (key === "patient_home_daily_warmup_rotation_enabled") {
          return { valueJson: { value: overrides.enabled ?? false } };
        }
        if (key === "patient_home_daily_warmup_rotation_times") {
          return { valueJson: { value: overrides.times ?? [] } };
        }
        return null;
      }),
    },
    patientDailyWarmupPresentation: port,
    patientPractice: {
      getLatestDailyWarmupCompletedContentPageId: vi.fn(async () => overrides.lastCompleted ?? null),
    },
    patientCalendarTimezone: {
      getIanaForUser: vi.fn(async () => overrides.patientIana ?? "Europe/Moscow"),
    },
  } as unknown as SyncDailyWarmupScheduledRotationDeps;
}

describe("syncDailyWarmupScheduledRotation", () => {
  it("creates initial state as next after last completed when no row exists", async () => {
    const port = createInMemoryPatientDailyWarmupPresentationPort();
    const now = new Date("2026-06-09T10:00:00.000Z");
    const state = await syncDailyWarmupScheduledRotation(
      "user-1",
      pages,
      buildDeps({ lastCompleted: "a", port }),
      now,
    );
    expect(state?.contentPageId).toBe("b");
    expect(state?.lastRotationAt).toBe(now.toISOString());
    expect(await port.getPresentationState("user-1")).toEqual(state);
  });

  it("applies due scheduled slots when rotation enabled", async () => {
    const port = createInMemoryPatientDailyWarmupPresentationPort();
    const iana = "Europe/Moscow";
    const last = DateTime.fromObject({ year: 2026, month: 6, day: 9, hour: 7, minute: 0 }, { zone: iana });
    const now = DateTime.fromObject({ year: 2026, month: 6, day: 9, hour: 15, minute: 0 }, { zone: iana });

    await port.upsertPresentationState("user-1", {
      contentPageId: "a",
      lastRotationAt: last.toUTC().toISO(),
      skipNextScheduledRotation: false,
    });

    const state = await syncDailyWarmupScheduledRotation(
      "user-1",
      pages,
      buildDeps({
        enabled: true,
        times: ["08:00", "14:00"],
        port,
        patientIana: iana,
      }),
      now.toJSDate(),
    );

    expect(state?.contentPageId).toBe("c");
    expect(await port.getPresentationState("user-1")).toEqual(state);
  });

  it("consumes skip flag on first due slot after manual advance", async () => {
    const port = createInMemoryPatientDailyWarmupPresentationPort();
    const iana = "Europe/Moscow";
    const last = DateTime.fromObject({ year: 2026, month: 6, day: 9, hour: 7, minute: 0 }, { zone: iana });
    const now = DateTime.fromObject({ year: 2026, month: 6, day: 9, hour: 9, minute: 0 }, { zone: iana });

    await port.upsertPresentationState("user-1", {
      contentPageId: "b",
      lastRotationAt: last.toUTC().toISO(),
      skipNextScheduledRotation: true,
    });

    const state = await syncDailyWarmupScheduledRotation(
      "user-1",
      pages,
      buildDeps({
        enabled: true,
        times: ["08:00", "14:00"],
        port,
        patientIana: iana,
      }),
      now.toJSDate(),
    );

    expect(state?.contentPageId).toBe("b");
    expect(state?.skipNextScheduledRotation).toBe(false);
  });
});
