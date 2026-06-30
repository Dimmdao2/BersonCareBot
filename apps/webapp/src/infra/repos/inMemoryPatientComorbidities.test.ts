import { describe, it, expect, beforeEach } from "vitest";
import {
  inMemoryPatientComorbiditiesPort,
  __resetInMemoryPatientComorbiditiesForTest,
} from "./inMemoryPatientComorbidities";

const PATIENT = "11111111-1111-1111-1111-111111111111";
const OTHER_PATIENT = "33333333-3333-3333-3333-333333333333";
const DOCTOR = "22222222-2222-2222-2222-222222222222";

describe("inMemoryPatientComorbidities", () => {
  beforeEach(() => {
    __resetInMemoryPatientComorbiditiesForTest();
  });

  describe("add + listByPatient", () => {
    it("add returns the created entry with status=active", async () => {
      const c = await inMemoryPatientComorbiditiesPort.add({
        patientUserId: PATIENT,
        text: "Диабет 2 типа",
        since: "с 2017",
        createdBy: DOCTOR,
      });
      expect(c.id).toBeTruthy();
      expect(c.text).toBe("Диабет 2 типа");
      expect(c.since).toBe("с 2017");
      expect(c.status).toBe("active");
      expect(c.removedAt).toBeNull();
    });

    it("listByPatient(active) returns only active entries", async () => {
      await inMemoryPatientComorbiditiesPort.add({
        patientUserId: PATIENT,
        text: "Гипертония",
        since: null,
        createdBy: DOCTOR,
      });
      await inMemoryPatientComorbiditiesPort.add({
        patientUserId: PATIENT,
        text: "Астма",
        since: "с 2010",
        createdBy: DOCTOR,
      });
      const list = await inMemoryPatientComorbiditiesPort.listByPatient(PATIENT, "active");
      expect(list).toHaveLength(2);
      expect(list.map((c) => c.text)).toContain("Гипертония");
      expect(list.map((c) => c.text)).toContain("Астма");
    });

    it("listByPatient is ordered chronologically (oldest→newest)", async () => {
      await inMemoryPatientComorbiditiesPort.add({ patientUserId: PATIENT, text: "Первая", since: null, createdBy: DOCTOR });
      await inMemoryPatientComorbiditiesPort.add({ patientUserId: PATIENT, text: "Вторая", since: null, createdBy: DOCTOR });
      const list = await inMemoryPatientComorbiditiesPort.listByPatient(PATIENT, "active");
      expect(list[0].text).toBe("Первая");
      expect(list[1].text).toBe("Вторая");
    });

    it("listByPatient is scoped per patient", async () => {
      await inMemoryPatientComorbiditiesPort.add({ patientUserId: PATIENT, text: "Болезнь А", since: null, createdBy: DOCTOR });
      await inMemoryPatientComorbiditiesPort.add({ patientUserId: OTHER_PATIENT, text: "Болезнь Б", since: null, createdBy: DOCTOR });

      const a = await inMemoryPatientComorbiditiesPort.listByPatient(PATIENT, "active");
      expect(a).toHaveLength(1);
      expect(a[0].text).toBe("Болезнь А");

      const b = await inMemoryPatientComorbiditiesPort.listByPatient(OTHER_PATIENT, "active");
      expect(b).toHaveLength(1);
      expect(b[0].text).toBe("Болезнь Б");
    });

    it("listByPatient(all) returns both active and removed", async () => {
      const c1 = await inMemoryPatientComorbiditiesPort.add({ patientUserId: PATIENT, text: "Болезнь 1", since: null, createdBy: DOCTOR });
      await inMemoryPatientComorbiditiesPort.add({ patientUserId: PATIENT, text: "Болезнь 2", since: null, createdBy: DOCTOR });
      await inMemoryPatientComorbiditiesPort.markRemoved(PATIENT, c1.id);

      const all = await inMemoryPatientComorbiditiesPort.listByPatient(PATIENT, "all");
      expect(all).toHaveLength(2);
      expect(all.map((c) => c.status)).toContain("removed");
      expect(all.map((c) => c.status)).toContain("active");
    });
  });

  describe("markRemoved", () => {
    it("moves entry to removed and sets removedAt", async () => {
      const c = await inMemoryPatientComorbiditiesPort.add({ patientUserId: PATIENT, text: "Диабет", since: null, createdBy: DOCTOR });
      const ok = await inMemoryPatientComorbiditiesPort.markRemoved(PATIENT, c.id);
      expect(ok).toBe(true);

      const removed = await inMemoryPatientComorbiditiesPort.listByPatient(PATIENT, "removed");
      expect(removed).toHaveLength(1);
      expect(removed[0].status).toBe("removed");
      expect(removed[0].removedAt).toBeTruthy();

      const active = await inMemoryPatientComorbiditiesPort.listByPatient(PATIENT, "active");
      expect(active).toHaveLength(0);
    });

    it("returns false when entry not found (cross-patient scope guard)", async () => {
      const c = await inMemoryPatientComorbiditiesPort.add({ patientUserId: PATIENT, text: "Диабет", since: null, createdBy: DOCTOR });
      const ok = await inMemoryPatientComorbiditiesPort.markRemoved(OTHER_PATIENT, c.id);
      expect(ok).toBe(false);
      // Still active for the correct patient
      const active = await inMemoryPatientComorbiditiesPort.listByPatient(PATIENT, "active");
      expect(active).toHaveLength(1);
    });

    it("returns false when already removed", async () => {
      const c = await inMemoryPatientComorbiditiesPort.add({ patientUserId: PATIENT, text: "Диабет", since: null, createdBy: DOCTOR });
      await inMemoryPatientComorbiditiesPort.markRemoved(PATIENT, c.id);
      const ok = await inMemoryPatientComorbiditiesPort.markRemoved(PATIENT, c.id);
      expect(ok).toBe(false);
    });
  });

  describe("restore", () => {
    it("restores a removed entry and clears removedAt", async () => {
      const c = await inMemoryPatientComorbiditiesPort.add({ patientUserId: PATIENT, text: "Гипертония", since: null, createdBy: DOCTOR });
      await inMemoryPatientComorbiditiesPort.markRemoved(PATIENT, c.id);
      const ok = await inMemoryPatientComorbiditiesPort.restore(PATIENT, c.id);
      expect(ok).toBe(true);

      const active = await inMemoryPatientComorbiditiesPort.listByPatient(PATIENT, "active");
      expect(active).toHaveLength(1);
      expect(active[0].removedAt).toBeNull();
    });

    it("returns false for already-active entry", async () => {
      const c = await inMemoryPatientComorbiditiesPort.add({ patientUserId: PATIENT, text: "Гипертония", since: null, createdBy: DOCTOR });
      const ok = await inMemoryPatientComorbiditiesPort.restore(PATIENT, c.id);
      expect(ok).toBe(false);
    });

    it("returns false for cross-patient scope guard", async () => {
      const c = await inMemoryPatientComorbiditiesPort.add({ patientUserId: PATIENT, text: "Гипертония", since: null, createdBy: DOCTOR });
      await inMemoryPatientComorbiditiesPort.markRemoved(PATIENT, c.id);
      const ok = await inMemoryPatientComorbiditiesPort.restore(OTHER_PATIENT, c.id);
      expect(ok).toBe(false);
    });
  });

  describe("editText", () => {
    it("edits text and reflects change in the list", async () => {
      const c = await inMemoryPatientComorbiditiesPort.add({ patientUserId: PATIENT, text: "Диабет", since: null, createdBy: DOCTOR });
      const ok = await inMemoryPatientComorbiditiesPort.editText({
        patientUserId: PATIENT,
        comorbidityId: c.id,
        text: "Диабет 2 типа, скомпенсированный",
      });
      expect(ok).toBe(true);
      const list = await inMemoryPatientComorbiditiesPort.listByPatient(PATIENT, "active");
      expect(list[0].text).toBe("Диабет 2 типа, скомпенсированный");
    });

    it("edits since only (text unchanged)", async () => {
      const c = await inMemoryPatientComorbiditiesPort.add({ patientUserId: PATIENT, text: "Диабет", since: null, createdBy: DOCTOR });
      const ok = await inMemoryPatientComorbiditiesPort.editText({
        patientUserId: PATIENT,
        comorbidityId: c.id,
        since: "с 2015",
      });
      expect(ok).toBe(true);
      const list = await inMemoryPatientComorbiditiesPort.listByPatient(PATIENT, "active");
      expect(list[0].text).toBe("Диабет");
      expect(list[0].since).toBe("с 2015");
    });

    it("returns false for cross-patient scope guard", async () => {
      const c = await inMemoryPatientComorbiditiesPort.add({ patientUserId: PATIENT, text: "Диабет", since: null, createdBy: DOCTOR });
      const ok = await inMemoryPatientComorbiditiesPort.editText({
        patientUserId: OTHER_PATIENT,
        comorbidityId: c.id,
        text: "Попытка изменить",
      });
      expect(ok).toBe(false);
      const list = await inMemoryPatientComorbiditiesPort.listByPatient(PATIENT, "active");
      expect(list[0].text).toBe("Диабет");
    });

    it("returns false for unknown comorbidityId", async () => {
      const ok = await inMemoryPatientComorbiditiesPort.editText({
        patientUserId: PATIENT,
        comorbidityId: "00000000-0000-0000-0000-000000000000",
        text: "Неизвестная",
      });
      expect(ok).toBe(false);
    });
  });
});
