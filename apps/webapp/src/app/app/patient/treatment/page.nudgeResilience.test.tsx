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
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
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

const resolvePatientTreatmentProgramEntryMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/treatment-program/patientTreatmentProgramEntry", () => ({
  resolvePatientTreatmentProgramEntry: resolvePatientTreatmentProgramEntryMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({}),
}));

import { PATIENT_PLAN_TAB_UI_LABEL } from "@/app-layer/routes/navigation";
import PatientTreatmentProgramsPage from "./page";

describe("PatientTreatmentProgramsPage / list loader", () => {
  beforeEach(() => {
    notFoundMock.mockClear();
    redirectMock.mockClear();
    resolvePatientTreatmentProgramEntryMock.mockReset();
    resolvePatientTreatmentProgramEntryMock.mockResolvedValue({
      kind: "list",
      archived: [],
      promoEnsureFailed: false,
    });
  });

  it("renders empty state when there is no active program (no redirect)", async () => {
    const ui = await PatientTreatmentProgramsPage();
    render(ui);
    expect(screen.getByTestId("shell-title")).toHaveTextContent(PATIENT_PLAN_TAB_UI_LABEL);
    expect(
      screen.getByRole("heading", { name: "Хочу персональную программу!" }),
    ).toBeInTheDocument();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("redirects to detail when entry resolves redirect", async () => {
    resolvePatientTreatmentProgramEntryMock.mockResolvedValue({
      kind: "redirect",
      instanceId: "11111111-1111-4111-8111-111111111111",
    });
    await expect(PatientTreatmentProgramsPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalled();
  });

  it("shows promo retry when ensure failed and no redirect target", async () => {
    resolvePatientTreatmentProgramEntryMock.mockResolvedValue({
      kind: "list",
      archived: [],
      promoEnsureFailed: true,
    });
    const ui = await PatientTreatmentProgramsPage();
    render(ui);
    expect(screen.getByRole("alert")).toHaveTextContent("Не удалось открыть программу");
  });
});
