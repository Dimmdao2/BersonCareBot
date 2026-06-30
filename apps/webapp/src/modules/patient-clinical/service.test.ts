import { describe, expect, it, vi } from "vitest";
import { createPatientClinicalService } from "./service";
import type { PatientClinicalPort } from "./ports";

const PATIENT = "11111111-1111-1111-1111-111111111111";
const DOCTOR = "22222222-2222-2222-2222-222222222222";

/** Port stub with all methods mocked; override per test as needed. */
function makePort(overrides: Partial<PatientClinicalPort> = {}): PatientClinicalPort {
  return {
    getClinicalState: vi.fn().mockResolvedValue({ complaints: [], diagnoses: [] }),
    listVisits: vi.fn().mockResolvedValue([]),
    searchDiagnosisCatalog: vi.fn().mockResolvedValue([]),
    createDiagnosisCatalogEntry: vi.fn(),
    createVisit: vi.fn().mockResolvedValue("visit-1"),
    updateComplaintFields: vi.fn().mockResolvedValue(true),
    updateDiagnosisFields: vi.fn().mockResolvedValue(true),
    updateVisitFields: vi.fn().mockResolvedValue(true),
    getAnamnesis: vi
      .fn()
      .mockResolvedValue({ trauma: [], illness: [], lifestyle: [] }),
    appendAnamnesisTrauma: vi
      .fn()
      .mockImplementation(async (i) => ({ id: "t1", ...i })),
    appendAnamnesisIllness: vi
      .fn()
      .mockImplementation(async (i) => ({ id: "i1", ...i })),
    appendAnamnesisLifestyle: vi
      .fn()
      .mockImplementation(async (i) => ({ id: "l1", date: "18.01.2026", text: i.text })),
    setDiagnosisClinicalStatus: vi.fn().mockResolvedValue(true),
    getDiagnosisStatusHistory: vi.fn().mockResolvedValue([]),
    listLinkedAppointmentRecordIds: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe("patient-clinical service — инлайн-правка полей", () => {
  it("updateComplaintFields trims text and forwards priority", async () => {
    const port = makePort();
    const svc = createPatientClinicalService({ patientClinicalPort: port });
    const ok = await svc.updateComplaintFields({
      patientUserId: PATIENT,
      complaintId: "c1",
      text: "  Поясница — боль  ",
      priority: true,
    });
    expect(ok).toBe(true);
    expect(port.updateComplaintFields).toHaveBeenCalledWith({
      patientUserId: PATIENT,
      complaintId: "c1",
      text: "Поясница — боль",
      priority: true,
    });
  });

  it("updateComplaintFields rejects blank text", async () => {
    const port = makePort();
    const svc = createPatientClinicalService({ patientClinicalPort: port });
    await expect(
      svc.updateComplaintFields({ patientUserId: PATIENT, complaintId: "c1", text: "   " }),
    ).rejects.toThrow(/complaint_text_required/);
    expect(port.updateComplaintFields).not.toHaveBeenCalled();
  });

  it("updateComplaintFields rejects when nothing is provided", async () => {
    const port = makePort();
    const svc = createPatientClinicalService({ patientClinicalPort: port });
    await expect(
      svc.updateComplaintFields({ patientUserId: PATIENT, complaintId: "c1" }),
    ).rejects.toThrow(/nothing_to_update/);
  });

  it("updateComplaintFields can change priority only (no text key sent)", async () => {
    const port = makePort();
    const svc = createPatientClinicalService({ patientClinicalPort: port });
    await svc.updateComplaintFields({ patientUserId: PATIENT, complaintId: "c1", priority: false });
    const arg = (port.updateComplaintFields as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg).toEqual({ patientUserId: PATIENT, complaintId: "c1", priority: false });
    expect("text" in arg).toBe(false);
  });

  it("updateDiagnosisFields rejects blank text", async () => {
    const port = makePort();
    const svc = createPatientClinicalService({ patientClinicalPort: port });
    await expect(
      svc.updateDiagnosisFields({ patientUserId: PATIENT, diagnosisId: "d1", text: " " }),
    ).rejects.toThrow(/diagnosis_text_required/);
  });

  it("updateVisitFields trims sections and clears empties to null", async () => {
    const port = makePort();
    const svc = createPatientClinicalService({ patientClinicalPort: port });
    await svc.updateVisitFields({
      patientUserId: PATIENT,
      visitId: "v1",
      exam: "  Наклон болезненный  ",
      recommendations: "   ",
    });
    const arg = (port.updateVisitFields as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg).toMatchObject({
      patientUserId: PATIENT,
      visitId: "v1",
      exam: "Наклон болезненный",
      recommendations: null,
    });
    // Untouched sections are left undefined (not overwritten).
    expect(arg.manipulations).toBeUndefined();
  });

  it("updateVisitFields rejects when no section is provided", async () => {
    const port = makePort();
    const svc = createPatientClinicalService({ patientClinicalPort: port });
    await expect(
      svc.updateVisitFields({ patientUserId: PATIENT, visitId: "v1" }),
    ).rejects.toThrow(/nothing_to_update/);
  });

  it("propagates port false (not found) for complaint update", async () => {
    const port = makePort({ updateComplaintFields: vi.fn().mockResolvedValue(false) });
    const svc = createPatientClinicalService({ patientClinicalPort: port });
    const ok = await svc.updateComplaintFields({
      patientUserId: PATIENT,
      complaintId: "missing",
      priority: true,
    });
    expect(ok).toBe(false);
  });
});

describe("patient-clinical service — анамнез", () => {
  describe("getAnamnesis", () => {
    it("delegates to the port", async () => {
      const port = makePort();
      const svc = createPatientClinicalService({ patientClinicalPort: port });
      await svc.getAnamnesis(PATIENT);
      expect(port.getAnamnesis).toHaveBeenCalledWith(PATIENT);
    });
  });

  describe("appendAnamnesisTrauma", () => {
    it("trims fields and passes them to the port", async () => {
      const port = makePort();
      const svc = createPatientClinicalService({ patientClinicalPort: port });
      await svc.appendAnamnesisTrauma({
        patientUserId: PATIENT,
        year: "  2019 ",
        what: "  Перелом лодыжки  ",
        type: "  закрытый  ",
        immobilization: "  гипс 6 недель  ",
        createdBy: DOCTOR,
      });
      expect(port.appendAnamnesisTrauma).toHaveBeenCalledWith({
        patientUserId: PATIENT,
        year: "2019",
        what: "Перелом лодыжки",
        type: "закрытый",
        immobilization: "гипс 6 недель",
        createdBy: DOCTOR,
      });
    });

    it("defaults empty immobilization to «—»", async () => {
      const port = makePort();
      const svc = createPatientClinicalService({ patientClinicalPort: port });
      await svc.appendAnamnesisTrauma({
        patientUserId: PATIENT,
        year: "2019",
        what: "Перелом",
        type: "закрытый",
        immobilization: "   ",
        createdBy: DOCTOR,
      });
      expect(port.appendAnamnesisTrauma).toHaveBeenCalledWith(
        expect.objectContaining({ immobilization: "—" }),
      );
    });

    it.each([
      ["year", { year: "  " }, /anamnesis_trauma_year_required/],
      ["what", { what: "  " }, /anamnesis_trauma_what_required/],
      ["type", { type: "  " }, /anamnesis_trauma_type_required/],
    ])("rejects blank %s", async (_field, override, expected) => {
      const port = makePort();
      const svc = createPatientClinicalService({ patientClinicalPort: port });
      await expect(
        svc.appendAnamnesisTrauma({
          patientUserId: PATIENT,
          year: "2019",
          what: "Перелом",
          type: "закрытый",
          immobilization: "гипс",
          createdBy: DOCTOR,
          ...override,
        }),
      ).rejects.toThrow(expected);
      expect(port.appendAnamnesisTrauma).not.toHaveBeenCalled();
    });
  });

  describe("appendAnamnesisIllness", () => {
    it("trims fields and passes them to the port", async () => {
      const port = makePort();
      const svc = createPatientClinicalService({ patientClinicalPort: port });
      await svc.appendAnamnesisIllness({
        patientUserId: PATIENT,
        period: "  2020 ",
        what: "  ОРВI  ",
        comment: "  тяжело  ",
        createdBy: DOCTOR,
      });
      expect(port.appendAnamnesisIllness).toHaveBeenCalledWith({
        patientUserId: PATIENT,
        period: "2020",
        what: "ОРВI",
        comment: "тяжело",
        createdBy: DOCTOR,
      });
    });

    it("allows an empty comment (trimmed to «»)", async () => {
      const port = makePort();
      const svc = createPatientClinicalService({ patientClinicalPort: port });
      await svc.appendAnamnesisIllness({
        patientUserId: PATIENT,
        period: "2020",
        what: "ОРВI",
        comment: "   ",
        createdBy: DOCTOR,
      });
      expect(port.appendAnamnesisIllness).toHaveBeenCalledWith(
        expect.objectContaining({ comment: "" }),
      );
    });

    it.each([
      ["period", { period: "  " }, /anamnesis_illness_period_required/],
      ["what", { what: "  " }, /anamnesis_illness_what_required/],
    ])("rejects blank %s", async (_field, override, expected) => {
      const port = makePort();
      const svc = createPatientClinicalService({ patientClinicalPort: port });
      await expect(
        svc.appendAnamnesisIllness({
          patientUserId: PATIENT,
          period: "2020",
          what: "ОРВI",
          comment: "",
          createdBy: DOCTOR,
          ...override,
        }),
      ).rejects.toThrow(expected);
      expect(port.appendAnamnesisIllness).not.toHaveBeenCalled();
    });
  });

  describe("appendAnamnesisLifestyle", () => {
    it("trims text and recordDate and passes them to the port", async () => {
      const port = makePort();
      const svc = createPatientClinicalService({ patientClinicalPort: port });
      await svc.appendAnamnesisLifestyle({
        patientUserId: PATIENT,
        recordDate: " 2026-01-18 ",
        text: "  Бросил курить  ",
        createdBy: DOCTOR,
      });
      expect(port.appendAnamnesisLifestyle).toHaveBeenCalledWith({
        patientUserId: PATIENT,
        recordDate: "2026-01-18",
        text: "Бросил курить",
        createdBy: DOCTOR,
      });
    });

    it.each([
      ["text", { text: "  " }, /anamnesis_lifestyle_text_required/],
      ["recordDate", { recordDate: "  " }, /anamnesis_lifestyle_record_date_required/],
    ])("rejects blank %s", async (_field, override, expected) => {
      const port = makePort();
      const svc = createPatientClinicalService({ patientClinicalPort: port });
      await expect(
        svc.appendAnamnesisLifestyle({
          patientUserId: PATIENT,
          recordDate: "2026-01-18",
          text: "Бросил курить",
          createdBy: DOCTOR,
          ...override,
        }),
      ).rejects.toThrow(expected);
      expect(port.appendAnamnesisLifestyle).not.toHaveBeenCalled();
    });
  });
});
