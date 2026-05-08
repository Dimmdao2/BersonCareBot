/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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
const TEMPLATE_A = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Программа Альфа" };
const TEMPLATE_B = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", title: "Программа Бета" };

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
    const dlg = screen.getByRole("dialog");
    expect(
      within(dlg).getByRole("heading", { name: /назначить программу лечения/i }),
    ).toBeInTheDocument();
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
      kind: "from_template",
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

  it("пустой план: POST с kind blank и успех", async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeInstancesResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, item: { id: "inst-blank" } }), { status: 200 }),
      )
      .mockResolvedValueOnce(makeInstancesResponse());

    render(
      <PatientTreatmentProgramsPanel patientUserId={PATIENT_ID} templates={[TEMPLATE_A, TEMPLATE_B]} />,
    );

    await user.click(screen.getByRole("button", { name: /назначить программу лечения/i }));
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("radio", { name: /пустой план/i }));

    await user.click(screen.getByRole("button", { name: /создать пустой план/i }));

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith("Программа лечения назначена");
    });

    const calls = vi.mocked(globalThis.fetch).mock.calls;
    const postCall = calls.find(([, init]) => (init as RequestInit)?.method === "POST");
    expect(postCall).toBeDefined();
    expect(JSON.parse((postCall![1] as RequestInit).body as string)).toEqual({ kind: "blank" });
  });

  it("пустой план: необязательный title передаётся в POST", async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeInstancesResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, item: { id: "inst-titled" } }), { status: 200 }),
      )
      .mockResolvedValueOnce(makeInstancesResponse());

    render(
      <PatientTreatmentProgramsPanel patientUserId={PATIENT_ID} templates={[TEMPLATE_A, TEMPLATE_B]} />,
    );

    await user.click(screen.getByRole("button", { name: /назначить программу лечения/i }));
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("radio", { name: /пустой план/i }));

    await user.type(screen.getByLabelText(/название программы/i), "План после осмотра");

    await user.click(screen.getByRole("button", { name: /создать пустой план/i }));

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith("Программа лечения назначена");
    });

    const calls = vi.mocked(globalThis.fetch).mock.calls;
    const postCall = calls.find(([, init]) => (init as RequestInit)?.method === "POST");
    expect(postCall).toBeDefined();
    expect(JSON.parse((postCall![1] as RequestInit).body as string)).toEqual({
      kind: "blank",
      title: "План после осмотра",
    });
  });

  it("пустой план: кнопка назначения disabled на время ответа POST", async () => {
    const user = userEvent.setup();

    let resolvePost!: (r: Response) => void;
    const postHang = new Promise<Response>((res) => {
      resolvePost = res;
    });

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeInstancesResponse())
      .mockImplementation((url, init) => {
        if (
          String(url).includes(`/clients/${PATIENT_ID}/treatment-program-instances`) &&
          (init as RequestInit)?.method === "POST"
        ) {
          return postHang;
        }
        return Promise.resolve(makeInstancesResponse());
      });

    render(
      <PatientTreatmentProgramsPanel patientUserId={PATIENT_ID} templates={[TEMPLATE_A, TEMPLATE_B]} />,
    );

    await waitFor(() => {
      expect(vi.mocked(globalThis.fetch)).toHaveBeenCalled();
    });

    await user.click(screen.getByRole("button", { name: /назначить программу лечения/i }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("radio", { name: /пустой план/i }));

    const assignBtn = screen.getByRole("button", { name: /создать пустой план/i });
    await user.click(assignBtn);

    expect(assignBtn).toBeDisabled();

    resolvePost!(new Response(JSON.stringify({ ok: true, item: { id: "inst-x" } }), { status: 200 }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
