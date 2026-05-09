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
});
