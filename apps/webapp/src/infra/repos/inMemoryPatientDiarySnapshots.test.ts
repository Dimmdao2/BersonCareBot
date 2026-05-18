import { describe, expect, it, beforeEach } from "vitest";
import {
  createInMemoryPatientDiarySnapshotsPort,
  resetInMemoryPatientDiarySnapshotsForTests,
} from "@/infra/repos/inMemoryPatientDiarySnapshots";

describe("createInMemoryPatientDiarySnapshotsPort", () => {
  beforeEach(() => {
    resetInMemoryPatientDiarySnapshotsForTests();
  });

  it("insertIfMissing is idempotent", async () => {
    const port = createInMemoryPatientDiarySnapshotsPort();
    const row = {
      platformUserId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      localDate: "2026-05-01",
      iana: "Europe/Moscow",
      warmupSlotLimit: 3,
      warmupDoneCount: 1,
      warmupAllDone: false,
      planInstanceId: null,
      planItemIds: [] as string[],
      planDoneMask: [] as boolean[],
    };
    expect(await port.insertIfMissing(row)).toBe(true);
    expect(await port.insertIfMissing(row)).toBe(false);
    const listed = await port.listForUserDateRange(row.platformUserId, "2026-05-01", "2026-05-01");
    expect(listed).toHaveLength(1);
    expect(listed[0]!.warmupDoneCount).toBe(1);
  });

  it("minLocalDateForUser returns earliest local_date", async () => {
    const port = createInMemoryPatientDiarySnapshotsPort();
    const uid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const base = {
      platformUserId: uid,
      iana: "Europe/Moscow",
      warmupSlotLimit: 1,
      warmupDoneCount: 0,
      warmupAllDone: false,
      planInstanceId: null,
      planItemIds: [] as string[],
      planDoneMask: [] as boolean[],
    };
    await port.insertIfMissing({ ...base, localDate: "2026-05-10" });
    await port.insertIfMissing({ ...base, localDate: "2026-04-02" });
    expect(await port.minLocalDateForUser(uid)).toBe("2026-04-02");
    expect(await port.minLocalDateForUser("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")).toBeNull();
  });
});
