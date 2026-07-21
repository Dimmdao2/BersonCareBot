/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DoctorCalendarPatientSearch } from "./DoctorCalendarPatientSearch";

describe("DoctorCalendarPatientSearch new-patient draft", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps new identity data local until the calendar submits the atomic visit", () => {
    const onChange = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <DoctorCalendarPatientSearch
        value={null}
        onChange={onChange}
        deferNewPatientCreation
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Новый пациент" }));
    fireEvent.change(screen.getByLabelText("Фамилия пациента"), {
      target: { value: "Иванов" },
    });
    fireEvent.change(screen.getByLabelText("Имя пациента"), {
      target: { value: "Иван" },
    });
    fireEvent.change(screen.getByLabelText("Телефон пациента"), {
      target: { value: "+7 999 000-00-00" },
    });
    fireEvent.change(screen.getByLabelText("Email пациента"), {
      target: { value: "patient@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Выбрать нового" }));

    expect(onChange).toHaveBeenCalledWith({
      id: null,
      displayName: "Иванов Иван",
      lastName: "Иванов",
      firstName: "Иван",
      patronymic: null,
      phone: "+7 999 000-00-00",
      email: "patient@example.com",
      isNew: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps a contactless structured identity for the atomic calendar command", () => {
    const onChange = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <DoctorCalendarPatientSearch value={null} onChange={onChange} deferNewPatientCreation />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Новый пациент" }));
    fireEvent.change(screen.getByLabelText("Фамилия пациента"), {
      target: { value: "Иванов" },
    });
    fireEvent.change(screen.getByLabelText("Имя пациента"), {
      target: { value: "Иван" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Выбрать нового" }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        id: null,
        lastName: "Иванов",
        firstName: "Иван",
        phone: null,
        email: null,
        isNew: true,
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves immediate standalone client creation for non-calendar consumers", async () => {
    const onChange = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        client: {
          id: "11111111-1111-4111-8111-111111111111",
          displayName: "Иванов Иван",
          lastName: "Иванов",
          firstName: "Иван",
          patronymic: null,
          phone: "+79990000000",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<DoctorCalendarPatientSearch value={null} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Новый пациент" }));
    fireEvent.change(screen.getByLabelText("Фамилия пациента"), {
      target: { value: "Иванов" },
    });
    fireEvent.change(screen.getByLabelText("Имя пациента"), {
      target: { value: "Иван" },
    });
    fireEvent.change(screen.getByLabelText("Телефон пациента"), {
      target: { value: "+79990000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Создать и выбрать" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/doctor/clients");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      lastName: "Иванов",
      firstName: "Иван",
      patronymic: null,
    });
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ id: "11111111-1111-4111-8111-111111111111" }),
      ),
    );
  });

  it("reuses one request UUID after transport failure and suppresses concurrent submit", async () => {
    const onChange = vi.fn();
    let rejectFirst: ((reason?: unknown) => void) | undefined;
    const first = new Promise((_resolve, reject) => { rejectFirst = reject; });
    const fetchMock = vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, client: { id: "11111111-1111-4111-8111-111111111111", displayName: "Иванов Иван", lastName: "Иванов", firstName: "Иван", patronymic: null, phone: null } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<DoctorCalendarPatientSearch value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Новый пациент" }));
    fireEvent.change(screen.getByLabelText("Фамилия пациента"), { target: { value: "Иванов" } });
    fireEvent.change(screen.getByLabelText("Имя пациента"), { target: { value: "Иван" } });
    const submit = screen.getByRole("button", { name: "Создать и выбрать" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    rejectFirst?.(new Error("transport"));
    await waitFor(() => expect(screen.getByText("Ошибка сети")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Создать и выбрать" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const retryBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(retryBody.requestId).toBe(firstBody.requestId);
  });
});
