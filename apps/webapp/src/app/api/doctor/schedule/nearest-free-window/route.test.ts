import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDoctorBookingEngineMock = vi.hoisted(() => vi.fn());
const nearestFreeWindowMock = vi.hoisted(() => vi.fn());
const buildAppDepsMock = vi.hoisted(() => vi.fn());

vi.mock("../../booking-engine/_requireDoctorBookingEngine", () => ({
  requireDoctorBookingEngine: requireDoctorBookingEngineMock,
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));
vi.mock("@/infra/logging/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  serializeError: (e: unknown) => e,
}));

import { GET } from "./route";

const VALID_UUID = "00000000-0000-4000-a000-000000000001";
const ORG_ID = "org-001";
const DOCTOR_SESSION = { user: { userId: "d1", role: "doctor", bindings: {} } };

const sampleWindow = { from: "2026-06-13T10:00:00.000Z", to: "2026-06-13T10:30:00.000Z" };

function makeGateOk() {
  requireDoctorBookingEngineMock.mockResolvedValue({
    ok: true,
    ctx: { session: DOCTOR_SESSION, organizationId: ORG_ID, service: {} },
  });
}

function makeGate401() {
  requireDoctorBookingEngineMock.mockResolvedValue({
    ok: false,
    response: Response.json({ ok: false, error: "unauthorized" }, { status: 401 }),
  });
}

function makeGate403() {
  requireDoctorBookingEngineMock.mockResolvedValue({
    ok: false,
    response: Response.json({ ok: false, error: "forbidden" }, { status: 403 }),
  });
}

function makeDepsWithScheduling() {
  buildAppDepsMock.mockReturnValue({
    bookingScheduling: { nearestFreeWindow: nearestFreeWindowMock },
    systemSettings: null,
  });
}

function makeDepsWithoutScheduling() {
  buildAppDepsMock.mockReturnValue({
    bookingScheduling: null,
    systemSettings: null,
  });
}

const BASE_URL = "http://localhost/api/doctor/schedule/nearest-free-window";

describe("GET /api/doctor/schedule/nearest-free-window", () => {
  beforeEach(() => {
    requireDoctorBookingEngineMock.mockReset();
    nearestFreeWindowMock.mockReset();
    buildAppDepsMock.mockReset();
    nearestFreeWindowMock.mockResolvedValue(sampleWindow);
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("returns 401 when gate returns unauthorized", async () => {
    makeGate401();
    const res = await GET(new Request(BASE_URL));
    expect(res.status).toBe(401);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(false);
    expect(nearestFreeWindowMock).not.toHaveBeenCalled();
    expect(buildAppDepsMock).not.toHaveBeenCalled();
  });

  it("returns 403 when gate returns forbidden", async () => {
    makeGate403();
    const res = await GET(new Request(BASE_URL));
    expect(res.status).toBe(403);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(false);
    expect(nearestFreeWindowMock).not.toHaveBeenCalled();
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it("returns 400 for invalid UUID in branchId", async () => {
    makeGateOk();
    makeDepsWithScheduling();
    const res = await GET(new Request(`${BASE_URL}?branchId=not-a-uuid`));
    expect(res.status).toBe(400);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("invalid_params");
    expect(nearestFreeWindowMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid UUID in specialistId", async () => {
    makeGateOk();
    makeDepsWithScheduling();
    const res = await GET(new Request(`${BASE_URL}?specialistId=bad`));
    expect(res.status).toBe(400);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  it("returns 400 for invalid UUID in roomId", async () => {
    makeGateOk();
    makeDepsWithScheduling();
    const res = await GET(new Request(`${BASE_URL}?roomId=bad`));
    expect(res.status).toBe(400);
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it("happy-path: returns { ok: true, window: {...} } with valid UUIDs", async () => {
    makeGateOk();
    makeDepsWithScheduling();
    const url = `${BASE_URL}?specialistId=${VALID_UUID}&branchId=${VALID_UUID}&roomId=${VALID_UUID}&timeZone=Europe%2FMoscow`;
    const res = await GET(new Request(url));
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; window: typeof sampleWindow };
    expect(body.ok).toBe(true);
    expect(body.window).toEqual(sampleWindow);
  });

  it("happy-path: passes correct args (organizationId, ids, timeZone) to nearestFreeWindow", async () => {
    makeGateOk();
    makeDepsWithScheduling();
    await GET(new Request(`${BASE_URL}?branchId=${VALID_UUID}&timeZone=Asia%2FTokyo`));
    expect(nearestFreeWindowMock).toHaveBeenCalledOnce();
    const [call] = nearestFreeWindowMock.mock.calls as [[{
      organizationId: string;
      specialistId: string | null;
      branchId: string | null;
      roomId: string | null;
      timeZone: string;
    }]];
    expect(call[0].organizationId).toBe(ORG_ID);
    expect(call[0].branchId).toBe(VALID_UUID);
    expect(call[0].specialistId).toBeNull();
    expect(call[0].roomId).toBeNull();
    expect(call[0].timeZone).toBe("Asia/Tokyo");
  });

  it("happy-path: no params → all ids null, default timeZone Europe/Moscow", async () => {
    makeGateOk();
    makeDepsWithScheduling();
    await GET(new Request(BASE_URL));
    const [call] = nearestFreeWindowMock.mock.calls as [[{
      specialistId: string | null;
      branchId: string | null;
      roomId: string | null;
      timeZone: string;
    }]];
    expect(call[0].specialistId).toBeNull();
    expect(call[0].branchId).toBeNull();
    expect(call[0].roomId).toBeNull();
    expect(call[0].timeZone).toBe("Europe/Moscow");
  });

  // ── Graceful degradation ───────────────────────────────────────────────────

  it("degradation: returns { ok: true, window: null } (not 500) when bookingScheduling service throws", async () => {
    makeGateOk();
    makeDepsWithScheduling();
    nearestFreeWindowMock.mockRejectedValue(new Error("db failure"));
    const res = await GET(new Request(BASE_URL));
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; window: null };
    expect(body.ok).toBe(true);
    expect(body.window).toBeNull();
  });

  it("degradation: returns { ok: true, window: null } when bookingScheduling is not available in deps", async () => {
    makeGateOk();
    makeDepsWithoutScheduling();
    const res = await GET(new Request(BASE_URL));
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; window: null };
    expect(body.ok).toBe(true);
    expect(body.window).toBeNull();
    expect(nearestFreeWindowMock).not.toHaveBeenCalled();
  });
});
