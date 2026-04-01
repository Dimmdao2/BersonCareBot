/**
 * Редиректы legacy /subscribers и сохранение scope в ссылке «назад» карточки клиента.
 */
import { describe, expect, it, vi } from "vitest";

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

describe("doctor clients scope and subscribers redirects", () => {
  it("/app/doctor/subscribers redirects to /app/doctor/clients?scope=all", async () => {
    redirectMock.mockClear();
    const { default: Page } = await import("@/app/app/doctor/subscribers/page");
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect");
    expect(redirectMock).toHaveBeenCalledWith("/app/doctor/clients?scope=all");
  });

  it("/app/doctor/subscribers preserves query params on redirect", async () => {
    redirectMock.mockClear();
    const { default: Page } = await import("@/app/app/doctor/subscribers/page");
    await expect(
      Page({
        searchParams: Promise.resolve({ q: "ivan", selected: "550e8400-e29b-41d4-a716-446655440000" }),
      }),
    ).rejects.toThrow("redirect");
    expect(redirectMock).toHaveBeenCalledWith(
      "/app/doctor/clients?scope=all&q=ivan&selected=550e8400-e29b-41d4-a716-446655440000",
    );
  });

  it("/app/doctor/subscribers/[userId] redirects to clients profile with scope=all", async () => {
    redirectMock.mockClear();
    const { default: Page } = await import("@/app/app/doctor/subscribers/[userId]/page");
    const uid = "550e8400-e29b-41d4-a716-446655440099";
    await expect(Page({ params: Promise.resolve({ userId: uid }) })).rejects.toThrow("redirect");
    expect(redirectMock).toHaveBeenCalledWith(`/app/doctor/clients/${encodeURIComponent(uid)}?scope=all`);
  });
});
