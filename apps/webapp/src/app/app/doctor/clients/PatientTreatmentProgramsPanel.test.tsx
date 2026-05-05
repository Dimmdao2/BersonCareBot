/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PatientTreatmentProgramsPanel } from "./PatientTreatmentProgramsPanel";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const { toastSuccessMock } = vi.hoisted(() => {
  const toastSuccessMock = vi.fn();
  return { toastSuccessMock };
});

vi.mock("react-hot-toast", () => ({
  default: { success: toastSuccessMock },
}));

const PATIENT_ID = "00000000-0000-4000-8000-000000000001";
const TEMPLATE_A = { id: "tpl-a", title: "Программа Альфа" };
const TEMPLATE_B = { id: "tpl-b", title: "Программа Бета" };

function makeInstancesResponse(instances: unknown[] = []) {
  return new Response(JSON.stringify({ ok: true, items: instances }), { status: 200 });
}

describe("PatientTreatmentProgramsPanel", () => {
  beforeEach(() => {
    toastSuccessMock.mockReset();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(makeInstancesResponse());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("CTA «Назначить программу лечения» открывает модалку", async () => {
    const user = userEvent.setup();
    render(
      <PatientTreatmentProgramsPanel
        patientUserId={PATIENT_ID}
        templates={[TEMPLATE_A, TEMPLATE_B]}
      />,
    );

    const cta = screen.getByRole("button", { name: /назначить программу лечения/i });
    await user.click(cta);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Выберите шаблон программы лечения")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/поиск по названию/i)).toBeInTheDocument();
    expect(screen.getByText(TEMPLATE_A.title)).toBeInTheDocument();
    expect(screen.getByText(TEMPLATE_B.title)).toBeInTheDocument();
  });

  it("успешное назначение закрывает модалку и вызывает toast.success", async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeInstancesResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, item: { id: "inst-1" } }), { status: 200 }),
      )
      .mockResolvedValueOnce(makeInstancesResponse());

    render(
      <PatientTreatmentProgramsPanel
        patientUserId={PATIENT_ID}
        templates={[TEMPLATE_A, TEMPLATE_B]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /назначить программу лечения/i }));
    await screen.findByRole("dialog");

    await user.click(screen.getByText(TEMPLATE_A.title));

    const assignBtn = screen.getByRole("button", { name: /^назначить$/i });
    await user.click(assignBtn);

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith("Программа лечения назначена");
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    const calls = vi.mocked(globalThis.fetch).mock.calls;
    const postCall = calls.find(
      ([, init]) => (init as RequestInit)?.method === "POST",
    );
    expect(postCall).toBeDefined();
    expect(JSON.parse((postCall![1] as RequestInit).body as string)).toEqual({
      templateId: TEMPLATE_A.id,
    });
  });

  it("при 409 показывает ошибку inline, модалка остаётся открытой", async () => {
    const user = userEvent.setup();
    const errorMsg =
      "У пациента уже есть активная программа. Завершите текущую программу или дождитесь её завершения перед назначением новой.";

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeInstancesResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false, error: errorMsg }), { status: 409 }),
      );

    render(
      <PatientTreatmentProgramsPanel
        patientUserId={PATIENT_ID}
        templates={[TEMPLATE_A]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /назначить программу лечения/i }));
    await screen.findByRole("dialog");

    await user.click(screen.getByText(TEMPLATE_A.title));
    await user.click(screen.getByRole("button", { name: /^назначить$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(errorMsg);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });
});
