import { beforeEach, describe, expect, it, vi } from "vitest";
import { SECOND_ACTIVE_TREATMENT_PROGRAM_MESSAGE } from "./instance-service";
import { resolvePatientTreatmentProgramEntry } from "./patientTreatmentProgramEntry";

const listForPatient = vi.fn();
const ensureDefaultPromo = vi.fn();
const getTemplate = vi.fn();
const getPromoTplId = vi.fn();

const deps = {
  treatmentProgramInstance: { listForPatient, ensureDefaultPromoProgramForPatient: ensureDefaultPromo },
  treatmentProgram: { getTemplate },
  systemSettings: { getPatientDefaultPromoTreatmentProgramTemplateId: getPromoTplId },
};

const patientId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("resolvePatientTreatmentProgramEntry", () => {
  beforeEach(() => {
    listForPatient.mockReset();
    ensureDefaultPromo.mockReset();
    getTemplate.mockReset();
    getPromoTplId.mockReset();
    getPromoTplId.mockResolvedValue(null);
  });

  it("redirects to newest active program", async () => {
    listForPatient.mockResolvedValue([
      {
        id: "11111111-1111-4111-8111-111111111111",
        title: "Active",
        status: "active",
        updatedAt: "2026-02-01T00:00:00.000Z",
        assignmentSource: "doctor",
      },
    ]);
    const r = await resolvePatientTreatmentProgramEntry(deps, patientId);
    expect(r).toEqual({ kind: "redirect", instanceId: "11111111-1111-4111-8111-111111111111" });
  });

  it("redirects to ensured promo when no active", async () => {
    listForPatient.mockResolvedValue([]);
    getPromoTplId.mockResolvedValue("tpl-1");
    getTemplate.mockResolvedValue({ status: "published" });
    ensureDefaultPromo.mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222" });
    const r = await resolvePatientTreatmentProgramEntry(deps, patientId);
    expect(r).toEqual({ kind: "redirect", instanceId: "22222222-2222-4222-8222-222222222222" });
  });

  it("returns list (not completed redirect) when promo ensure fails but archived exists", async () => {
    const archived = [
      {
        id: "33333333-3333-4333-8333-333333333333",
        title: "Old",
        status: "completed" as const,
        updatedAt: "2026-01-15T00:00:00.000Z",
        assignmentSource: "doctor" as const,
      },
    ];
    listForPatient.mockResolvedValue(archived);
    getPromoTplId.mockResolvedValue("tpl-1");
    getTemplate.mockResolvedValue({ status: "published" });
    ensureDefaultPromo.mockRejectedValue(new Error("db down"));
    const r = await resolvePatientTreatmentProgramEntry(deps, patientId);
    expect(r).toEqual({ kind: "list", archived, promoEnsureFailed: true });
  });

  it("returns list with promoEnsureFailed when nothing to open", async () => {
    listForPatient.mockResolvedValue([]);
    getPromoTplId.mockResolvedValue("tpl-1");
    getTemplate.mockResolvedValue({ status: "published" });
    ensureDefaultPromo.mockRejectedValue(new Error("db down"));
    const r = await resolvePatientTreatmentProgramEntry(deps, patientId);
    expect(r).toEqual({ kind: "list", archived: [], promoEnsureFailed: true });
  });

  it("recovers active id when ensure hits SECOND_ACTIVE race", async () => {
    listForPatient
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "44444444-4444-4444-8444-444444444444",
          title: "Promo",
          status: "active",
          updatedAt: "2026-03-01T00:00:00.000Z",
          assignmentSource: "promo",
        },
      ]);
    getPromoTplId.mockResolvedValue("tpl-1");
    getTemplate.mockResolvedValue({ status: "published" });
    ensureDefaultPromo.mockRejectedValue(new Error(SECOND_ACTIVE_TREATMENT_PROGRAM_MESSAGE));
    const r = await resolvePatientTreatmentProgramEntry(deps, patientId);
    expect(r).toEqual({ kind: "redirect", instanceId: "44444444-4444-4444-8444-444444444444" });
  });
});
