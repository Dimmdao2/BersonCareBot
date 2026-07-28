/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireDoctorWorkspaceContext: vi.fn(),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceContext: mocks.requireDoctorWorkspaceContext,
}));
vi.mock("./ChartTestPageClient", () => ({
  ChartTestPageClient: () => null,
}));

import ChartTestPage from "./page";

describe("ChartTestPage", () => {
  beforeEach(() => {
    mocks.requireDoctorWorkspaceContext.mockReset();
  });

  it("requires a clinical workspace before rendering the dev chart client", async () => {
    mocks.requireDoctorWorkspaceContext.mockResolvedValue({});

    await ChartTestPage();

    expect(mocks.requireDoctorWorkspaceContext).toHaveBeenCalledOnce();
  });

  it("does not render the chart client when the workspace guard redirects", async () => {
    mocks.requireDoctorWorkspaceContext.mockRejectedValueOnce(new Error("redirect:/app/account?tab=security"));

    await expect(ChartTestPage()).rejects.toThrow("redirect:/app/account?tab=security");
  });
});
