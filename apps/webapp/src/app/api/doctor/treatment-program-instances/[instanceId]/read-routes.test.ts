/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() => vi.fn((_: unknown, fn: () => unknown) => fn()));
const getInstanceByIdMock = vi.hoisted(() => vi.fn());
const getClientIdentityForOrganizationMock = vi.hoisted(() => vi.fn());
const listProgramEventsMock = vi.hoisted(() => vi.fn());
const listProgramActionLogForInstanceMock = vi.hoisted(() => vi.fn());
const listTestResultsForInstanceMock = vi.hoisted(() => vi.fn());
const getDoctorAttemptAcceptMapMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));

vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: (ctx: unknown, fn: () => unknown) => withDoctorWorkspacePrincipalMock(ctx, fn),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    treatmentProgramInstance: {
      getInstanceById: getInstanceByIdMock,
      listProgramEvents: listProgramEventsMock,
    },
    doctorClientsPort: {
      getClientIdentityForOrganization: getClientIdentityForOrganizationMock,
    },
    treatmentProgramProgress: {
      listProgramActionLogForInstance: listProgramActionLogForInstanceMock,
      listTestResultsForInstance: listTestResultsForInstanceMock,
      getDoctorAttemptAcceptMap: getDoctorAttemptAcceptMapMock,
    },
  }),
}));

import { GET as getInstance } from "./route";
import { GET as getEvents } from "./events/route";
import { GET as getActionLog } from "./action-log/route";
import { GET as getTestResults } from "./test-results/route";

const instanceId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";
const patientUserId = "33333333-3333-4333-8333-333333333333";

const workspaceCtx = {
  session: { user: { userId: "44444444-4444-4444-8444-444444444444", role: "doctor", bindings: {} } },
  organizationId,
  membershipId: "55555555-5555-4555-8555-555555555555",
  membershipRole: "doctor",
  specialistId: null,
  canManageOrganization: false,
  canManageAllSpecialists: false,
};

const instance = {
  id: instanceId,
  organizationId,
  patientUserId,
  assignmentSource: "doctor",
  stages: [],
};

function params() {
  return { params: Promise.resolve({ instanceId }) };
}

describe("doctor treatment program instance read routes", () => {
  beforeEach(() => {
    requireDoctorWorkspaceApiContextMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockClear();
    withDoctorWorkspacePrincipalMock.mockImplementation((_: unknown, fn: () => unknown) => fn());
    getInstanceByIdMock.mockReset();
    getClientIdentityForOrganizationMock.mockReset();
    listProgramEventsMock.mockReset();
    listProgramActionLogForInstanceMock.mockReset();
    listTestResultsForInstanceMock.mockReset();
    getDoctorAttemptAcceptMapMock.mockReset();

    requireDoctorWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: workspaceCtx });
    getInstanceByIdMock.mockResolvedValue(instance);
    getClientIdentityForOrganizationMock.mockResolvedValue({ userId: patientUserId });
    listProgramEventsMock.mockResolvedValue([{ id: "event-1" }]);
    listProgramActionLogForInstanceMock.mockResolvedValue([{ id: "log-1" }]);
    listTestResultsForInstanceMock.mockResolvedValue([{ id: "result-1" }]);
    getDoctorAttemptAcceptMapMock.mockResolvedValue({ attempt1: true });
  });

  it("GET instance returns only selected-workspace instance", async () => {
    const res = await getInstance(new Request("http://localhost/instance"), params());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.item.id).toBe(instanceId);
    expect(getClientIdentityForOrganizationMock).toHaveBeenCalledWith(patientUserId, organizationId);
  });

  it.each([
    ["events", getEvents, listProgramEventsMock],
    ["action-log", getActionLog, listProgramActionLogForInstanceMock],
    ["test-results", getTestResults, listTestResultsForInstanceMock],
  ] as const)("GET %s reads under selected workspace principal", async (_name, handler, readMock) => {
    const res = await handler(new Request("http://localhost/read"), params());

    expect(res.status).toBe(200);
    expect(readMock).toHaveBeenCalledWith(instanceId);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalled();
  });

  it.each([
    ["instance", getInstance, null],
    ["events", getEvents, listProgramEventsMock],
    ["action-log", getActionLog, listProgramActionLogForInstanceMock],
    ["test-results", getTestResults, listTestResultsForInstanceMock],
  ] as const)("GET %s returns 404 for another organization", async (_name, handler, readMock) => {
    getInstanceByIdMock.mockResolvedValue({
      ...instance,
      organizationId: "66666666-6666-4666-8666-666666666666",
    });

    const res = await handler(new Request("http://localhost/read"), params());

    expect(res.status).toBe(404);
    if (readMock) {
      expect(readMock).not.toHaveBeenCalled();
    }
  });
});
