/** @vitest-environment node */

import { describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn((url: string) => { throw new Error(`redirect:${url}`); }));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/app-layer/routes/paths", () => ({ routePaths: { settings: "/app/settings" } }));

import ManagementPage from "./page";

describe("ManagementPage", () => {
  it("keeps the legacy route as a compatibility redirect to Settings", async () => {
    await expect(ManagementPage()).rejects.toThrow("redirect:/app/settings?tab=organization");
  });
});
