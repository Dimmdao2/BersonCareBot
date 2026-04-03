import { describe, it, expect, beforeEach } from "vitest";
import { inMemoryPatientBookingsPort, resetInMemoryPatientBookingsStore } from "./inMemoryPatientBookings";

describe("inMemoryPatientBookings - compat-sync", () => {
  beforeEach(() => {
    resetInMemoryPatientBookingsStore();
  });

  describe("upsertFromRubitime - compat-create path", () => {
    it("creates compat-row when rubitime_id not found", async () => {
      await inMemoryPatientBookingsPort.upsertFromRubitime({
        rubitimeId: "rub-123",
        status: "confirmed",
        slotStart: "2026-05-01T10:00:00.000Z",
        slotEnd: "2026-05-01T11:00:00.000Z",
        contactName: "Иван Иванов",
        contactPhone: "+79001234567",
        branchTitle: "Клиника Москва",
        serviceTitle: "ЛФК",
        rubitimeBranchId: "br-1",
        rubitimeServiceId: "svc-1",
      });

      const found = await inMemoryPatientBookingsPort.getByRubitimeId("rub-123");
      expect(found).not.toBeNull();
      expect(found?.rubitimeId).toBe("rub-123");
      expect(found?.status).toBe("confirmed");
      expect(found?.branchTitleSnapshot).toBe("Клиника Москва");
      expect(found?.serviceTitleSnapshot).toBe("ЛФК");
      expect(found?.rubitimeBranchIdSnapshot).toBe("br-1");
      expect(found?.userId).toBeNull();
    });

    it("does not create compat-row when slotStart is missing", async () => {
      await inMemoryPatientBookingsPort.upsertFromRubitime({
        rubitimeId: "rub-no-slot",
        status: "confirmed",
        slotStart: null,
      });

      const found = await inMemoryPatientBookingsPort.getByRubitimeId("rub-no-slot");
      expect(found).toBeNull();
    });

    it("cancel webhook removes existing compat row by rubitime_id", async () => {
      // First call: create
      await inMemoryPatientBookingsPort.upsertFromRubitime({
        rubitimeId: "rub-dedup",
        status: "confirmed",
        slotStart: "2026-05-01T10:00:00.000Z",
      });

      // Second call: cancel (same rubitime_id) -> remove projection row
      await inMemoryPatientBookingsPort.upsertFromRubitime({
        rubitimeId: "rub-dedup",
        status: "cancelled",
        slotStart: "2026-05-01T10:00:00.000Z",
      });

      const found = await inMemoryPatientBookingsPort.getByRubitimeId("rub-dedup");
      expect(found).toBeNull();
    });

    it("does not create compat row for cancel webhook when row does not exist", async () => {
      await inMemoryPatientBookingsPort.upsertFromRubitime({
        rubitimeId: "rub-cancel-miss",
        status: "cancelled",
        slotStart: "2026-05-01T10:00:00.000Z",
      });

      const found = await inMemoryPatientBookingsPort.getByRubitimeId("rub-cancel-miss");
      expect(found).toBeNull();
    });

    it("uses default 60-min duration when slotEnd is missing", async () => {
      await inMemoryPatientBookingsPort.upsertFromRubitime({
        rubitimeId: "rub-no-end",
        status: "confirmed",
        slotStart: "2026-05-01T10:00:00.000Z",
        slotEnd: null,
      });

      const found = await inMemoryPatientBookingsPort.getByRubitimeId("rub-no-end");
      expect(found?.slotEnd).toBe("2026-05-01T11:00:00.000Z");
    });

    it("fallback links native row by phone + slot when rubitime_id was NULL, then UPDATE path (no compat INSERT)", async () => {
      const slotStart = "2026-05-01T10:00:00.000Z";
      const slotEnd = "2026-05-01T11:00:00.000Z";
      const pending = await inMemoryPatientBookingsPort.createPending({
        userId: "u-fallback-native",
        bookingType: "in_person",
        city: "moscow",
        category: "general",
        slotStart,
        slotEnd,
        contactName: "T",
        contactPhone: "+79001234567",
        contactEmail: null,
        branchId: "br1",
        serviceId: "sv1",
        branchServiceId: "bs1",
        cityCodeSnapshot: "moscow",
        branchTitleSnapshot: "Филиал",
        serviceTitleSnapshot: "Сеанс",
        durationMinutesSnapshot: 60,
        priceMinorSnapshot: 100,
        rubitimeBranchIdSnapshot: "173",
        rubitimeCooperatorIdSnapshot: "347",
        rubitimeServiceIdSnapshot: "675",
      });
      expect(pending.rubitimeId).toBeNull();

      await inMemoryPatientBookingsPort.upsertFromRubitime({
        rubitimeId: "rt-webhook-new",
        status: "confirmed",
        slotStart,
        slotEnd,
        contactPhone: "+79001234567",
        contactName: "T",
        rubitimeBranchId: "173",
        rubitimeServiceId: "675",
      });

      const linked = await inMemoryPatientBookingsPort.getByRubitimeId("rt-webhook-new");
      expect(linked).not.toBeNull();
      expect(linked!.id).toBe(pending.id);
      expect(linked!.rubitimeId).toBe("rt-webhook-new");
      expect(linked!.status).toBe("confirmed");
      expect(linked!.bookingSource).toBe("native");

      const upcoming = await inMemoryPatientBookingsPort.listUpcomingByUser("u-fallback-native", "2025-01-01T00:00:00.000Z");
      expect(upcoming.filter((r) => r.rubitimeId === "rt-webhook-new")).toHaveLength(1);
    });

    it("native row update keeps original slotStart/slotEnd on webhook upsert", async () => {
      const pending = await inMemoryPatientBookingsPort.createPending({
        userId: "u-native-keep",
        bookingType: "in_person",
        city: "moscow",
        category: "general",
        slotStart: "2026-05-01T10:00:00.000Z",
        slotEnd: "2026-05-01T11:00:00.000Z",
        contactName: "T",
        contactPhone: "+79000000001",
        contactEmail: null,
        branchId: "br1",
        serviceId: "sv1",
        branchServiceId: "bs1",
        cityCodeSnapshot: "moscow",
        branchTitleSnapshot: "Филиал",
        serviceTitleSnapshot: "Сеанс",
        durationMinutesSnapshot: 60,
        priceMinorSnapshot: 100,
        rubitimeBranchIdSnapshot: "173",
        rubitimeCooperatorIdSnapshot: "347",
        rubitimeServiceIdSnapshot: "675",
      });
      await inMemoryPatientBookingsPort.markConfirmed(pending.id, "rt-native-1");

      await inMemoryPatientBookingsPort.upsertFromRubitime({
        rubitimeId: "rt-native-1",
        status: "cancelled",
        slotStart: "2026-05-01 11:00:00",
        slotEnd: "2026-05-01 12:00:00",
      });

      const updated = await inMemoryPatientBookingsPort.getByRubitimeId("rt-native-1");
      expect(updated?.slotStart).toBe("2026-05-01T10:00:00.000Z");
      expect(updated?.slotEnd).toBe("2026-05-01T11:00:00.000Z");
      expect(updated?.status).toBe("cancelled");
    });
  });

  describe("createPending overlap scope", () => {
    it("allows same time for different specialists", async () => {
      await inMemoryPatientBookingsPort.createPending({
        userId: "u1",
        bookingType: "in_person",
        city: "moscow",
        category: "general",
        slotStart: "2026-05-01T19:00:00.000Z",
        slotEnd: "2026-05-01T20:00:00.000Z",
        contactName: "A",
        contactPhone: "+79000000011",
        contactEmail: null,
        branchId: "br1",
        serviceId: "sv1",
        branchServiceId: "bs1",
        cityCodeSnapshot: "moscow",
        branchTitleSnapshot: "Филиал",
        serviceTitleSnapshot: "Сеанс",
        durationMinutesSnapshot: 60,
        priceMinorSnapshot: 100,
        rubitimeBranchIdSnapshot: "173",
        rubitimeCooperatorIdSnapshot: "347",
        rubitimeServiceIdSnapshot: "675",
      });

      await expect(
        inMemoryPatientBookingsPort.createPending({
          userId: "u2",
          bookingType: "in_person",
          city: "moscow",
          category: "general",
          slotStart: "2026-05-01T19:00:00.000Z",
          slotEnd: "2026-05-01T20:00:00.000Z",
          contactName: "B",
          contactPhone: "+79000000022",
          contactEmail: null,
          branchId: "br2",
          serviceId: "sv2",
          branchServiceId: "bs2",
          cityCodeSnapshot: "moscow",
          branchTitleSnapshot: "Филиал 2",
          serviceTitleSnapshot: "Сеанс 2",
          durationMinutesSnapshot: 60,
          priceMinorSnapshot: 100,
          rubitimeBranchIdSnapshot: "174",
          rubitimeCooperatorIdSnapshot: "999",
          rubitimeServiceIdSnapshot: "676",
        }),
      ).resolves.toBeTruthy();
    });

    it("blocks same time for the same specialist", async () => {
      await inMemoryPatientBookingsPort.createPending({
        userId: "u1",
        bookingType: "in_person",
        city: "moscow",
        category: "general",
        slotStart: "2026-05-01T19:00:00.000Z",
        slotEnd: "2026-05-01T20:00:00.000Z",
        contactName: "A",
        contactPhone: "+79000000011",
        contactEmail: null,
        branchId: "br1",
        serviceId: "sv1",
        branchServiceId: "bs1",
        cityCodeSnapshot: "moscow",
        branchTitleSnapshot: "Филиал",
        serviceTitleSnapshot: "Сеанс",
        durationMinutesSnapshot: 60,
        priceMinorSnapshot: 100,
        rubitimeBranchIdSnapshot: "173",
        rubitimeCooperatorIdSnapshot: "347",
        rubitimeServiceIdSnapshot: "675",
      });

      await expect(
        inMemoryPatientBookingsPort.createPending({
          userId: "u2",
          bookingType: "in_person",
          city: "moscow",
          category: "general",
          slotStart: "2026-05-01T19:00:00.000Z",
          slotEnd: "2026-05-01T20:00:00.000Z",
          contactName: "B",
          contactPhone: "+79000000022",
          contactEmail: null,
          branchId: "br2",
          serviceId: "sv2",
          branchServiceId: "bs2",
          cityCodeSnapshot: "moscow",
          branchTitleSnapshot: "Филиал 2",
          serviceTitleSnapshot: "Сеанс 2",
          durationMinutesSnapshot: 60,
          priceMinorSnapshot: 100,
          rubitimeBranchIdSnapshot: "174",
          rubitimeCooperatorIdSnapshot: "347",
          rubitimeServiceIdSnapshot: "676",
        }),
      ).rejects.toThrow("slot_overlap");
    });
  });
});
