import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDoctorBookingEngineMock = vi.hoisted(() => vi.fn());
const resolveDoctorOwnSpecialistIdMock = vi.hoisted(() => vi.fn());
const listScheduleTemplatesMock = vi.hoisted(() => vi.fn());
const createScheduleTemplateMock = vi.hoisted(() => vi.fn());
const deleteScheduleTemplateMock = vi.hoisted(() => vi.fn());
const applyScheduleTemplateMock = vi.hoisted(() => vi.fn());
const principalState = vi.hoisted(() => ({ inside: false }));
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn(async <T,>(
    _workspace: { organizationId: string },
    _source: string,
    fn: () => Promise<T>,
  ) => {
    principalState.inside = true;
    try {
      return await fn();
    } finally {
      principalState.inside = false;
    }
  }),
);

vi.mock("../_requireDoctorBookingEngine", () => ({
  requireDoctorBookingEngine: requireDoctorBookingEngineMock,
}));

vi.mock("../_resolveDoctorSpecialistId", () => ({
  resolveDoctorOwnSpecialistId: resolveDoctorOwnSpecialistIdMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    bookingScheduling: {
      listScheduleTemplates: listScheduleTemplatesMock,
      createScheduleTemplate: createScheduleTemplateMock,
      deleteScheduleTemplate: deleteScheduleTemplateMock,
      applyScheduleTemplate: applyScheduleTemplateMock,
    },
  }),
}));

vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

import { DELETE, GET, POST } from "./route";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TMPL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SPECIALIST = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

describe("/api/doctor/booking-engine/working-schedule-templates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    principalState.inside = false;
  });

  it("lists templates without principal wrapper", async () => {
    requireDoctorBookingEngineMock.mockResolvedValue({ ok: true, ctx: { organizationId: ORG } });
    listScheduleTemplatesMock.mockResolvedValue([{ id: TMPL, name: "Стандарт" }]);

    const res = await GET(new Request("http://localhost/api/doctor/booking-engine/working-schedule-templates"));
    const json = (await res.json()) as { ok: boolean; rows: unknown[] };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.rows).toHaveLength(1);
    expect(listScheduleTemplatesMock).toHaveBeenCalledWith(ORG);
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
  });

  it("creates a template inside doctor workspace principal", async () => {
    requireDoctorBookingEngineMock.mockResolvedValue({ ok: true, ctx: { organizationId: ORG } });
    createScheduleTemplateMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
      return { id: TMPL, name: "Стандарт" };
    });

    const res = await POST(
      new Request("http://localhost/api/doctor/booking-engine/working-schedule-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Стандарт", startMinute: 540, endMinute: 1080 }),
      }),
    );
    const json = (await res.json()) as { ok: boolean; row: { id: string } };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.row.id).toBe(TMPL);
    expect(createScheduleTemplateMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, name: "Стандарт", startMinute: 540, endMinute: 1080 }),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG }),
      "doctor.booking-engine.working-schedule-templates.create",
      expect.any(Function),
    );
  });

  it("applies a template without principal wrapper", async () => {
    requireDoctorBookingEngineMock.mockResolvedValue({ ok: true, ctx: { organizationId: ORG } });
    resolveDoctorOwnSpecialistIdMock.mockResolvedValue(SPECIALIST);
    applyScheduleTemplateMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(false);
      return [];
    });

    const res = await POST(
      new Request("http://localhost/api/doctor/booking-engine/working-schedule-templates?action=apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: TMPL, dates: ["2026-06-10"] }),
      }),
    );
    const json = (await res.json()) as { ok: boolean };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(applyScheduleTemplateMock).toHaveBeenCalledWith({
      organizationId: ORG,
      templateId: TMPL,
      dates: ["2026-06-10"],
      specialistId: SPECIALIST,
    });
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
  });

  it("deletes a template inside doctor workspace principal", async () => {
    requireDoctorBookingEngineMock.mockResolvedValue({ ok: true, ctx: { organizationId: ORG } });
    deleteScheduleTemplateMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
    });

    const res = await DELETE(
      new Request(`http://localhost/api/doctor/booking-engine/working-schedule-templates?id=${TMPL}`),
    );
    const json = (await res.json()) as { ok: boolean };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(deleteScheduleTemplateMock).toHaveBeenCalledWith(TMPL, ORG);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG }),
      "doctor.booking-engine.working-schedule-templates.delete",
      expect.any(Function),
    );
  });
});
