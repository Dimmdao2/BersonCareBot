import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionMock,
  getPatientDefaultPromoMock,
  countInstancesMock,
  getTemplateMock,
  updateSettingMock,
  buildAppDepsMock,
} = vi.hoisted(() => {
  const getPatientDefaultPromoMockInner = vi.fn().mockResolvedValue(null);
  const countInstancesMockInner = vi.fn().mockResolvedValue(0);
  const getTemplateMockInner = vi.fn();
  const updateSettingMockInner = vi.fn().mockResolvedValue({});
  return {
    getSessionMock: vi.fn(),
    getPatientDefaultPromoMock: getPatientDefaultPromoMockInner,
    countInstancesMock: countInstancesMockInner,
    getTemplateMock: getTemplateMockInner,
    updateSettingMock: updateSettingMockInner,
    buildAppDepsMock: vi.fn(() => ({
      systemSettings: {
        getPatientDefaultPromoTreatmentProgramTemplateId: getPatientDefaultPromoMockInner,
        updateSetting: updateSettingMockInner,
      },
      treatmentProgram: { getTemplate: getTemplateMockInner },
      treatmentProgramInstance: {
        countInstancesForAssignmentSource: countInstancesMockInner,
      },
    })),
  };
});

vi.mock("@/app-layer/di/buildAppDeps", () => ({ buildAppDeps: buildAppDepsMock }));
vi.mock("@/modules/auth/service", () => ({ getCurrentSession: getSessionMock }));
vi.mock("@/modules/system-settings/configAdapter", () => ({ invalidateConfigKey: vi.fn() }));

import { GET, PATCH } from "./route";

const TEMPLATE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("GET /api/doctor/treatment-program-promo", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getPatientDefaultPromoMock.mockReset();
    countInstancesMock.mockReset();
  });

  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for client role", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "u1", role: "client", bindings: {} } });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns promo config for doctor", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    getPatientDefaultPromoMock.mockResolvedValue(TEMPLATE_ID);
    countInstancesMock.mockResolvedValueOnce(2).mockResolvedValueOnce(5);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      templateId: TEMPLATE_ID,
      stats: { activePromo: 2, completedPromo: 5 },
    });
  });
});

describe("PATCH /api/doctor/treatment-program-promo", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getTemplateMock.mockReset();
    updateSettingMock.mockReset();
  });

  it("returns 403 for client role", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "u1", role: "client", bindings: {} } });
    const res = await PATCH(
      new Request("http://localhost/api/doctor/treatment-program-promo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: TEMPLATE_ID }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("clears promo template when templateId is empty", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    const res = await PATCH(
      new Request("http://localhost/api/doctor/treatment-program-promo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: "" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(updateSettingMock).toHaveBeenCalledWith(
      "patient_default_promo_treatment_program_template_id",
      "admin",
      { value: "" },
      "d1",
    );
  });

  it("rejects unpublished template", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "d1", role: "doctor", bindings: {} } });
    getTemplateMock.mockResolvedValue({ status: "draft" });
    const res = await PATCH(
      new Request("http://localhost/api/doctor/treatment-program-promo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: TEMPLATE_ID }),
      }),
    );
    expect(res.status).toBe(400);
    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it("saves published template for admin", async () => {
    getSessionMock.mockResolvedValue({ user: { userId: "a1", role: "admin", bindings: {} } });
    getTemplateMock.mockResolvedValue({ status: "published" });
    const res = await PATCH(
      new Request("http://localhost/api/doctor/treatment-program-promo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: TEMPLATE_ID }),
      }),
    );
    expect(res.status).toBe(200);
    expect(updateSettingMock).toHaveBeenCalledWith(
      "patient_default_promo_treatment_program_template_id",
      "admin",
      { value: TEMPLATE_ID },
      "a1",
    );
  });
});
