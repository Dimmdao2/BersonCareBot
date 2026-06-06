/**
 * Редиректы legacy /subscribers и сохранение scope в ссылке «назад» карточки клиента.
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
  let DoctorClientsListPage: (typeof import("@/app/app/doctor/clients/page"))["default"];

  beforeAll(async () => {
    const listMod = await import("@/app/app/doctor/subscribers/page");
    SubscribersListPage = listMod.default;
    const profileMod = await import("@/app/app/doctor/subscribers/[userId]/page");
    SubscribersProfilePage = profileMod.default;
    const clientsMod = await import("@/app/app/doctor/clients/page");
    DoctorClientsListPage = clientsMod.default;
  }, 60_000);

  it("/app/doctor/subscribers redirects to /app/doctor/clients?scope=all", async () => {
    redirectMock.mockClear();
    await expect(SubscribersListPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect");
    expect(redirectMock).toHaveBeenCalledWith("/app/doctor/clients?scope=all");
  });

  it("/app/doctor/subscribers preserves query params on redirect", async () => {
    redirectMock.mockClear();
    await expect(
      SubscribersListPage({
        searchParams: Promise.resolve({ q: "ivan", selected: "550e8400-e29b-41d4-a716-446655440000" }),
      }),
    ).rejects.toThrow("redirect");
    expect(redirectMock).toHaveBeenCalledWith(
      "/app/doctor/clients?scope=all&q=ivan&selected=550e8400-e29b-41d4-a716-446655440000",
    );
  });

  it("/app/doctor/subscribers/[userId] redirects to clients profile with scope=all", async () => {
    redirectMock.mockClear();
    const uid = "550e8400-e29b-41d4-a716-446655440099";
    await expect(SubscribersProfilePage({ params: Promise.resolve({ userId: uid }) })).rejects.toThrow("redirect");
    expect(redirectMock).toHaveBeenCalledWith(`/app/doctor/clients/${encodeURIComponent(uid)}?scope=all`);
  });

  it("legacy ?selected= on clients list redirects to canonical profile", async () => {
    redirectMock.mockClear();
    const uid = "550e8400-e29b-41d4-a716-446655440000";
    await expect(
      DoctorClientsListPage({
        searchParams: Promise.resolve({ scope: "all", selected: uid }),
      }),
    ).rejects.toThrow("redirect");
    expect(redirectMock).toHaveBeenCalledWith(`/app/doctor/clients/${encodeURIComponent(uid)}?scope=all`);
  });

  it("invalid ?selected= redirects to canonical list scope", async () => {
    redirectMock.mockClear();
    await expect(
      DoctorClientsListPage({
        searchParams: Promise.resolve({ scope: "appointments", selected: "not-a-uuid" }),
      }),
    ).rejects.toThrow("redirect");
    expect(redirectMock).toHaveBeenCalledWith("/app/doctor/clients?scope=all");
  });

  it("subscribers with selected eventually resolves to profile without selected in query", async () => {
    redirectMock.mockClear();
    const uid = "550e8400-e29b-41d4-a716-446655440000";
    await expect(
      SubscribersListPage({
        searchParams: Promise.resolve({ selected: uid }),
      }),
    ).rejects.toThrow("redirect");
    expect(redirectMock).toHaveBeenCalledWith(
      `/app/doctor/clients?scope=all&selected=${encodeURIComponent(uid)}`,
    );

    redirectMock.mockClear();
    await expect(
      DoctorClientsListPage({
        searchParams: Promise.resolve({ scope: "all", selected: uid }),
      }),
    ).rejects.toThrow("redirect");
    const finalUrl = redirectMock.mock.calls[0]?.[0] as string;
    expect(finalUrl).toBe(`/app/doctor/clients/${encodeURIComponent(uid)}?scope=all`);
    expect(finalUrl).not.toContain("selected=");
  });
});
