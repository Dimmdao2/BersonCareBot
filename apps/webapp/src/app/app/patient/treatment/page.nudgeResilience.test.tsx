/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    const e = new Error("NEXT_NOT_FOUND");
    throw e;
  }),
);

const redirectMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
);

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}));

vi.mock("@/shared/ui/AppShell", () => ({
  AppShell: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div>
      <span data-testid="shell-title">{title}</span>
      {children}
    </div>
  ),
}));

const patientSession = {
  user: {
    userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    role: "client" as const,
    displayName: "Patient",
    bindings: {},
  },
  issuedAt: 0,
  expiresAt: 9_999_999_999,
};

vi.mock("@/app-layer/guards/requireRole", () => ({
  getOptionalPatientSession: vi.fn(async () => patientSession),
  patientRscPersonalDataGate: vi.fn(async () => "allow" as const),
}));

const listForPatientMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    treatmentProgramInstance: {
      listForPatient: listForPatientMock,
    },
  }),
}));

vi.mock("@/modules/system-settings/appDisplayTimezone", () => ({
  getAppDisplayTimeZone: vi.fn(async () => "Europe/Moscow"),
}));

import PatientTreatmentProgramsPage from "./page";

describe("PatientTreatmentProgramsPage / list loader", () => {
  beforeEach(() => {
    notFoundMock.mockClear();
    redirectMock.mockClear();
    listForPatientMock.mockResolvedValue([]);
  });

  it("renders empty state when there is no active program (no redirect)", async () => {
    const ui = await PatientTreatmentProgramsPage();
    render(ui);
    expect(screen.getByTestId("shell-title")).toHaveTextContent("Программы лечения");
    expect(screen.getByRole("heading", { name: "Нет активной программы" })).toBeInTheDocument();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("redirects to detail when the newest item in the list is active", async () => {
    listForPatientMock.mockResolvedValue([
      {
        id: "11111111-1111-4111-8111-111111111111",
        title: "Программа",
        status: "active",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    await expect(PatientTreatmentProgramsPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalled();
  });
});
