/**
 * Редиректы legacy /subscribers → /app/doctor/patients
 * и legacy /clients (list) → /app/doctor/patients.
 * Импорты `page.tsx` — один раз в `beforeAll` (проект `fast` с жёстким testTimeout; холодный граф не дублируем в каждом `it`).
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((url: string) => {
  const e = new Error("redirect");
  (e as Error & { digest?: string }).digest = `NEXT_REDIRECT;${url}`;
  throw e;
});

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorAccess: vi.fn(async () => ({
    user: { id: "doc-1", role: "doctor", displayName: "Doc" },
  })),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: vi.fn(() => ({
    doctorClients: { listClients: vi.fn(async () => []) },
  })),
}));

describe("doctor clients scope and subscribers redirects", () => {
  let SubscribersListPage: (typeof import("@/app/app/doctor/subscribers/page"))["default"];
  let SubscribersProfilePage: (typeof import("@/app/app/doctor/subscribers/[userId]/page"))["default"];
  let DoctorClientsLegacyPage: (typeof import("@/app/app/doctor/clients/page"))["default"];

  beforeAll(async () => {
    const listMod = await import("@/app/app/doctor/subscribers/page");
    SubscribersListPage = listMod.default;
    const profileMod = await import("@/app/app/doctor/subscribers/[userId]/page");
    SubscribersProfilePage = profileMod.default;
    const clientsMod = await import("@/app/app/doctor/clients/page");
    DoctorClientsLegacyPage = clientsMod.default;
  }, 60_000);

  it("/app/doctor/subscribers redirects to /app/doctor/patients", async () => {
    redirectMock.mockClear();
    await expect(SubscribersListPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect");
    expect(redirectMock).toHaveBeenCalledWith(expect.stringContaining("/app/doctor/patients"));
  });

  it("/app/doctor/subscribers preserves query param q on redirect", async () => {
    redirectMock.mockClear();
    await expect(
      SubscribersListPage({
        searchParams: Promise.resolve({ q: "ivan" }),
      }),
    ).rejects.toThrow("redirect");
    const url = redirectMock.mock.calls[0]?.[0] as string;
    expect(url).toContain("/app/doctor/patients");
    expect(url).toContain("q=ivan");
  });

  it("/app/doctor/subscribers/[userId] redirects to clients profile with scope=all", async () => {
    redirectMock.mockClear();
    const uid = "550e8400-e29b-41d4-a716-446655440099";
    await expect(SubscribersProfilePage({ params: Promise.resolve({ userId: uid }) })).rejects.toThrow("redirect");
    expect(redirectMock).toHaveBeenCalledWith(`/app/doctor/clients/${encodeURIComponent(uid)}?scope=all`);
  });

  it("legacy /app/doctor/clients redirects to /app/doctor/patients", async () => {
    redirectMock.mockClear();
    await expect(
      DoctorClientsLegacyPage({
        searchParams: Promise.resolve({ scope: "all" }),
      }),
    ).rejects.toThrow("redirect");
    const url = redirectMock.mock.calls[0]?.[0] as string;
    expect(url).toContain("/app/doctor/patients");
  });

  it("legacy /app/doctor/clients with archived scope redirects with archived=true", async () => {
    redirectMock.mockClear();
    await expect(
      DoctorClientsLegacyPage({
        searchParams: Promise.resolve({ scope: "archived" }),
      }),
    ).rejects.toThrow("redirect");
    const url = redirectMock.mock.calls[0]?.[0] as string;
    expect(url).toContain("/app/doctor/patients");
    expect(url).toContain("archived=true");
  });
});
