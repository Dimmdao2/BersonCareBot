import { describe, it, expect, beforeEach } from "vitest";
import {
  inMemoryPatientClinicalPort,
  __resetInMemoryPatientClinicalForTest,
} from "./inMemoryPatientClinical";

const PATIENT = "11111111-1111-1111-1111-111111111111";
const DOCTOR = "22222222-2222-2222-2222-222222222222";

describe("inMemoryPatientClinical", () => {
  beforeEach(() => {
    __resetInMemoryPatientClinicalForTest();
  });

  it("first visit creates active complaint with submitted severity + single-point trend", async () => {
    await inMemoryPatientClinicalPort.createVisit({
      patientUserId: PATIENT,
      visitType: "first",
      visitedAt: "2026-01-05T09:00:00.000Z",
      createdBy: DOCTOR,
      complaints: [{ text: "Бедро правое — боль ноющая", priority: true, severity: 5 }],
      diagnoses: [{ text: "Тендинопатия БЯМ", priority: true }],
    });

    const state = await inMemoryPatientClinicalPort.getClinicalState(PATIENT);
    expect(state.complaints).toHaveLength(1);
    const c = state.complaints[0];
    expect(c.text).toBe("Бедро правое — боль ноющая");
    expect(c.priority).toBe(true);
    expect(c.currentSeverity).toBe(5);
    expect(c.trend).toEqual([5]);
    expect(c.since).toBe("с 05.01");

    expect(state.diagnoses).toHaveLength(1);
    expect(state.diagnoses[0].text).toBe("Тендинопатия БЯМ");
    expect(state.diagnoses[0].status).toBe("active");
  });

  it("repeat visit complaint update changes currentSeverity and appends to trend", async () => {
    await inMemoryPatientClinicalPort.createVisit({
      patientUserId: PATIENT,
      visitType: "first",
      visitedAt: "2026-01-05T09:00:00.000Z",
      createdBy: DOCTOR,
      complaints: [{ text: "Поясница — боль тянущая", priority: false, severity: 6 }],
    });

    const before = await inMemoryPatientClinicalPort.getClinicalState(PATIENT);
    const complaintId = before.complaints[0].id;
    expect(before.complaints[0].currentSeverity).toBe(6);
    expect(before.complaints[0].trend).toEqual([6]);

    await inMemoryPatientClinicalPort.createVisit({
      patientUserId: PATIENT,
      visitType: "repeat",
      visitedAt: "2026-01-15T09:00:00.000Z",
      createdBy: DOCTOR,
      complaintUpdates: [
        { complaintId, note: "Стало легче после ходьбы", severity: 4, resolved: false },
      ],
    });

    const after = await inMemoryPatientClinicalPort.getClinicalState(PATIENT);
    expect(after.complaints).toHaveLength(1);
    expect(after.complaints[0].currentSeverity).toBe(4);
    expect(after.complaints[0].trend).toEqual([6, 4]);
  });

  it("resolved=true moves the complaint out of active state", async () => {
    await inMemoryPatientClinicalPort.createVisit({
      patientUserId: PATIENT,
      visitType: "first",
      visitedAt: "2026-01-05T09:00:00.000Z",
      createdBy: DOCTOR,
      complaints: [{ text: "Онемение в стопе", priority: false, severity: 3 }],
    });

    const before = await inMemoryPatientClinicalPort.getClinicalState(PATIENT);
    const complaintId = before.complaints[0].id;

    await inMemoryPatientClinicalPort.createVisit({
      patientUserId: PATIENT,
      visitType: "repeat",
      visitedAt: "2026-02-01T09:00:00.000Z",
      createdBy: DOCTOR,
      complaintUpdates: [
        { complaintId, note: "Прошло полностью", severity: 0, resolved: true },
      ],
    });

    const after = await inMemoryPatientClinicalPort.getClinicalState(PATIENT);
    expect(after.complaints).toHaveLength(0);
  });

  it("listVisits returns history newest-first with from→to dynamics on repeat", async () => {
    await inMemoryPatientClinicalPort.createVisit({
      patientUserId: PATIENT,
      visitType: "first",
      visitedAt: "2026-01-05T09:00:00.000Z",
      createdBy: DOCTOR,
      exam: "Наклон вперёд болезненный",
      complaints: [{ text: "Бедро — боль", priority: true, severity: 5 }],
    });
    const s = await inMemoryPatientClinicalPort.getClinicalState(PATIENT);
    const complaintId = s.complaints[0].id;
    await inMemoryPatientClinicalPort.createVisit({
      patientUserId: PATIENT,
      visitType: "repeat",
      visitedAt: "2026-01-22T09:00:00.000Z",
      createdBy: DOCTOR,
      complaintUpdates: [{ complaintId, note: "Реже", severity: 2, resolved: false }],
    });

    const visits = await inMemoryPatientClinicalPort.listVisits(PATIENT);
    expect(visits).toHaveLength(2);
    expect(visits[0].type).toBe("repeat"); // newest first
    expect(visits[0].dynamics).toHaveLength(1);
    expect(visits[0].dynamics![0]).toMatchObject({ from: 5, to: 2, label: "Бедро — боль" });
    expect(visits[1].type).toBe("first");
    expect(visits[1].sections).toEqual([{ title: "Осмотр", body: "Наклон вперёд болезненный" }]);
  });

  it("searchDiagnosisCatalog finds created entries case-insensitively", async () => {
    await inMemoryPatientClinicalPort.createDiagnosisCatalogEntry({
      label: "Тендинопатия большой ягодичной мышцы",
      createdBy: DOCTOR,
    });
    const found = await inMemoryPatientClinicalPort.searchDiagnosisCatalog("тендино");
    expect(found).toHaveLength(1);
    expect(found[0].label).toBe("Тендинопатия большой ягодичной мышцы");
  });

  describe("инлайн-правка полей", () => {
    it("updateComplaintFields edits text+priority and is reflected in the projection", async () => {
      await inMemoryPatientClinicalPort.createVisit({
        patientUserId: PATIENT,
        visitType: "first",
        visitedAt: "2026-01-05T09:00:00.000Z",
        createdBy: DOCTOR,
        complaints: [{ text: "Поясница — боль", priority: false, severity: 6 }],
      });
      const before = await inMemoryPatientClinicalPort.getClinicalState(PATIENT);
      const complaintId = before.complaints[0].id;

      const ok = await inMemoryPatientClinicalPort.updateComplaintFields({
        patientUserId: PATIENT,
        complaintId,
        text: "Поясница — острая боль",
        priority: true,
      });
      expect(ok).toBe(true);

      const after = await inMemoryPatientClinicalPort.getClinicalState(PATIENT);
      expect(after.complaints[0].text).toBe("Поясница — острая боль");
      expect(after.complaints[0].priority).toBe(true);
      // severity/trend untouched by a field edit
      expect(after.complaints[0].currentSeverity).toBe(6);
    });

    it("updateComplaintFields returns false for another patient's id (scope guard)", async () => {
      await inMemoryPatientClinicalPort.createVisit({
        patientUserId: PATIENT,
        visitType: "first",
        visitedAt: "2026-01-05T09:00:00.000Z",
        createdBy: DOCTOR,
        complaints: [{ text: "Боль", priority: false, severity: 3 }],
      });
      const state = await inMemoryPatientClinicalPort.getClinicalState(PATIENT);
      const complaintId = state.complaints[0].id;

      const ok = await inMemoryPatientClinicalPort.updateComplaintFields({
        patientUserId: "99999999-9999-9999-9999-999999999999",
        complaintId,
        priority: true,
      });
      expect(ok).toBe(false);
      const after = await inMemoryPatientClinicalPort.getClinicalState(PATIENT);
      expect(after.complaints[0].priority).toBe(false);
    });

    it("updateDiagnosisFields edits text+priority without touching status", async () => {
      await inMemoryPatientClinicalPort.createVisit({
        patientUserId: PATIENT,
        visitType: "first",
        visitedAt: "2026-01-05T09:00:00.000Z",
        createdBy: DOCTOR,
        diagnoses: [{ text: "Тендинопатия", priority: false }],
      });
      const before = await inMemoryPatientClinicalPort.getClinicalState(PATIENT);
      const diagnosisId = before.diagnoses[0].id;

      const ok = await inMemoryPatientClinicalPort.updateDiagnosisFields({
        patientUserId: PATIENT,
        diagnosisId,
        text: "Тендинопатия БЯМ",
        priority: true,
      });
      expect(ok).toBe(true);

      const after = await inMemoryPatientClinicalPort.getClinicalState(PATIENT);
      expect(after.diagnoses[0].text).toBe("Тендинопатия БЯМ");
      expect(after.diagnoses[0].priority).toBe(true);
      expect(after.diagnoses[0].status).toBe("active");
    });

    it("updateVisitFields edits a section and clears another to null", async () => {
      await inMemoryPatientClinicalPort.createVisit({
        patientUserId: PATIENT,
        visitType: "first",
        visitedAt: "2026-01-05T09:00:00.000Z",
        createdBy: DOCTOR,
        exam: "Старый осмотр",
        recommendations: "Старые рекомендации",
      });
      const visits = await inMemoryPatientClinicalPort.listVisits(PATIENT);
      const visitId = visits[0].id;

      const ok = await inMemoryPatientClinicalPort.updateVisitFields({
        patientUserId: PATIENT,
        visitId,
        exam: "Новый осмотр",
        recommendations: null,
      });
      expect(ok).toBe(true);

      const after = await inMemoryPatientClinicalPort.listVisits(PATIENT);
      const sections = after[0].sections ?? [];
      expect(sections).toContainEqual({ title: "Осмотр", body: "Новый осмотр" });
      // recommendations cleared → no «Рекомендации / Назначения» section
      expect(sections.some((s) => s.title.startsWith("Рекомендации"))).toBe(false);
    });

    it("updateVisitFields returns false for an unknown visit", async () => {
      const ok = await inMemoryPatientClinicalPort.updateVisitFields({
        patientUserId: PATIENT,
        visitId: "00000000-0000-0000-0000-000000000000",
        exam: "x",
      });
      expect(ok).toBe(false);
    });
  });

  describe("анамнез", () => {
    const OTHER_PATIENT = "33333333-3333-3333-3333-333333333333";

    it("getAnamnesis returns empty sections for a patient with no records", async () => {
      const a = await inMemoryPatientClinicalPort.getAnamnesis(PATIENT);
      expect(a).toEqual({ trauma: [], illness: [], lifestyle: [] });
    });

    it("appendAnamnesisTrauma returns the entry and surfaces it in getAnamnesis", async () => {
      const entry = await inMemoryPatientClinicalPort.appendAnamnesisTrauma({
        patientUserId: PATIENT,
        year: "2019",
        what: "Перелом лодыжки",
        type: "закрытый",
        immobilization: "гипс 6 недель",
        createdBy: DOCTOR,
      });
      expect(entry).toMatchObject({
        year: "2019",
        what: "Перелом лодыжки",
        type: "закрытый",
        immobilization: "гипс 6 недель",
      });
      expect(entry.id).toBeTruthy();

      const a = await inMemoryPatientClinicalPort.getAnamnesis(PATIENT);
      expect(a.trauma).toHaveLength(1);
      expect(a.trauma[0]).toEqual(entry);
    });

    it("appendAnamnesisIllness surfaces the entry in getAnamnesis", async () => {
      const entry = await inMemoryPatientClinicalPort.appendAnamnesisIllness({
        patientUserId: PATIENT,
        period: "2020",
        what: "Пневмония",
        comment: "стационар 2 недели",
        createdBy: DOCTOR,
      });
      const a = await inMemoryPatientClinicalPort.getAnamnesis(PATIENT);
      expect(a.illness).toEqual([entry]);
    });

    it("appendAnamnesisLifestyle formats the record date as ДД.ММ.ГГГГ", async () => {
      const entry = await inMemoryPatientClinicalPort.appendAnamnesisLifestyle({
        patientUserId: PATIENT,
        recordDate: "2026-01-18",
        text: "Бросил курить",
        createdBy: DOCTOR,
      });
      expect(entry).toMatchObject({ date: "18.01.2026", text: "Бросил курить" });

      const a = await inMemoryPatientClinicalPort.getAnamnesis(PATIENT);
      expect(a.lifestyle).toEqual([entry]);
    });

    it("getAnamnesis lists records chronologically (oldest→newest) per section", async () => {
      await inMemoryPatientClinicalPort.appendAnamnesisTrauma({
        patientUserId: PATIENT,
        year: "2010",
        what: "Первая травма",
        type: "закрытый",
        immobilization: "—",
        createdBy: DOCTOR,
      });
      await inMemoryPatientClinicalPort.appendAnamnesisTrauma({
        patientUserId: PATIENT,
        year: "2015",
        what: "Вторая травма",
        type: "открытый",
        immobilization: "—",
        createdBy: DOCTOR,
      });

      const a = await inMemoryPatientClinicalPort.getAnamnesis(PATIENT);
      expect(a.trauma.map((t) => t.what)).toEqual(["Первая травма", "Вторая травма"]);
    });

    it("getAnamnesis is scoped per patient", async () => {
      await inMemoryPatientClinicalPort.appendAnamnesisTrauma({
        patientUserId: PATIENT,
        year: "2019",
        what: "Травма пациента А",
        type: "закрытый",
        immobilization: "—",
        createdBy: DOCTOR,
      });
      await inMemoryPatientClinicalPort.appendAnamnesisIllness({
        patientUserId: OTHER_PATIENT,
        period: "2020",
        what: "Болезнь пациента Б",
        comment: "",
        createdBy: DOCTOR,
      });

      const a = await inMemoryPatientClinicalPort.getAnamnesis(PATIENT);
      expect(a.trauma).toHaveLength(1);
      expect(a.illness).toHaveLength(0);

      const b = await inMemoryPatientClinicalPort.getAnamnesis(OTHER_PATIENT);
      expect(b.trauma).toHaveLength(0);
      expect(b.illness).toHaveLength(1);
    });
  });
});
