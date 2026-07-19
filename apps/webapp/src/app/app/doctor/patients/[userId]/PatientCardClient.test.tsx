/** @vitest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PatientCardHeader } from "@/modules/doctor-clients/ports";
import { PatientCardClient } from "./PatientCardClient";

type MockDatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  max?: string;
};

type FetchMock = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const { doctorDatePickerMock } = vi.hoisted(() => ({
  doctorDatePickerMock: vi.fn(({ value, onChange, placeholder, max }: MockDatePickerProps) => (
    <button
      type="button"
      data-testid="birth-date-picker"
      data-value={value}
      data-max={max}
      onClick={() => onChange("1990-01-02")}
    >
      {value || placeholder || "Выберите дату"}
    </button>
  )),
}));

vi.mock("@/shared/ui/doctor/DoctorDatePicker", () => ({
  DoctorDatePicker: doctorDatePickerMock,
}));

vi.mock("@/shared/ui/doctor/DoctorOpenChatButton", () => ({
  DoctorOpenChatButton: ({ children, disabled, title }: { children?: ReactNode; disabled?: boolean; title?: string }) => (
    <button type="button" disabled={disabled} title={title}>
      {children ?? "Открыть чат"}
    </button>
  ),
}));

vi.mock("./tabs/PatientTabOverview", () => ({
  PatientTabOverview: () => <div data-testid="tab-overview" />,
}));

vi.mock("./tabs/PatientTabKarta", () => ({
  PatientTabKarta: () => <div data-testid="tab-karta" />,
}));

vi.mock("./tabs/PatientTabProgram", () => ({
  PatientTabProgram: () => <div data-testid="tab-program" />,
}));

vi.mock("./tabs/PatientTabRecords", () => ({
  PatientTabRecords: () => <div data-testid="tab-records" />,
}));

vi.mock("./tabs/PatientTabFiles", () => ({
  PatientTabFiles: () => <div data-testid="tab-files" />,
}));

vi.mock("./tabs/PatientTabAccount", () => ({
  PatientTabAccount: () => <div data-testid="tab-account" />,
}));

vi.mock("./tabs/PatientTabComms", () => ({
  PatientTabComms: () => <div data-testid="tab-comms" />,
}));

vi.mock("./tabs/PatientTabFinances", () => ({
  PatientTabFinances: () => <div data-testid="tab-finances" />,
}));

function makeHeader(overrides: Partial<PatientCardHeader["identity"]> = {}): PatientCardHeader {
  return {
    identity: {
      userId: "11111111-1111-4111-8111-111111111111",
      displayName: "Иван",
      firstName: "Иван",
      lastName: "Петров",
      patronymic: null,
      phone: "+7 (999) 000-00-01",
      email: "patient@example.test",
      bindings: { telegramId: "123", maxId: "max-1" },
      hasConversation: true,
      isArchived: false,
      isBlocked: false,
      birthDate: "1990-07-07",
      age: 36,
      gender: null,
      ...overrides,
    },
    support: {
      isOnSupport: false,
      startedAt: null,
      supportMonthsApprox: null,
    },
    lastVisit: null,
    nextAppointment: null,
    totalVisits: 0,
    cancellationsCount: 0,
    reschedulesCount: 0,
    firstVisitDate: null,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  doctorDatePickerMock.mockClear();
});

describe("PatientCardClient header", () => {
  it("shows age from birth date and exposes clickable contact actions", async () => {
    const user = userEvent.setup();
    const openMock = vi.fn();
    vi.stubGlobal("open", openMock);

    render(<PatientCardClient cardHeader={makeHeader()} />);

    expect(screen.getByText(/ДР: 07\.07\.1990 · 36 лет/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "+7 (999) 000-00-01" }));
    expect(openMock).toHaveBeenCalledWith("tel:+79990000001", "_self");

    await user.click(screen.getByTitle("Написать email"));
    expect(openMock).toHaveBeenCalledWith("mailto:patient@example.test", "_self");

    await user.click(screen.getByTitle("Открыть коммуникации: Telegram"));
    expect(screen.getByRole("button", { name: "Коммуникации" })).toHaveClass("bg-primary/15");
  });

  it("uses doctor date picker and saves empty birth date as null", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<FetchMock>(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    render(<PatientCardClient cardHeader={makeHeader({ birthDate: null, age: null })} />);

    expect(screen.getByText("ДР: —")).toBeInTheDocument();

    await user.click(screen.getByTitle("Редактировать ФИО"));
    const picker = screen.getByTestId("birth-date-picker");
    expect(picker).toHaveTextContent("Не указана");
    expect(picker.getAttribute("data-max")).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await user.click(screen.getByRole("button", { name: /Сохранить/ }));

    const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/fio"));
    expect(call).toBeDefined();
    const init = call?.[1] as RequestInit | undefined;
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toMatchObject({ birthDate: null });
    expect(JSON.parse(String(init?.body))).not.toHaveProperty("displayName");
  });

  it("renders structured FIO ahead of an incompatible legacy display label", () => {
    render(<PatientCardClient cardHeader={makeHeader({ displayName: "Старое имя", lastName: "Петров", firstName: "Иван", patronymic: "Сергеевич" })} />);
    expect(screen.getByText("Петров Иван Сергеевич")).toBeInTheDocument();
    expect(screen.queryByText("отобр.: Старое имя")).not.toBeInTheDocument();
  });

  it("updates birth date and age after profile save without reload", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn<FetchMock>(async () => Response.json({ ok: true })),
    );

    render(<PatientCardClient cardHeader={makeHeader({ birthDate: null, age: null })} />);

    await user.click(screen.getByTitle("Редактировать ФИО"));
    await user.click(screen.getByTestId("birth-date-picker"));
    await user.click(screen.getByRole("button", { name: /Сохранить/ }));

    await waitFor(() => {
      expect(screen.getByText(/ДР: 02\.01\.1990 · 36 лет/)).toBeInTheDocument();
    });
  });
});
