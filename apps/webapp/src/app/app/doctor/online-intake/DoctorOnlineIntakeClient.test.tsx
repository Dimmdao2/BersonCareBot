/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DoctorOnlineIntakeClient } from "./DoctorOnlineIntakeClient";

const PATIENT_ID = "00000000-0000-0000-0000-0000000000aa";
const REQUEST_ID = "00000000-0000-0000-0000-0000000000cc";

describe("DoctorOnlineIntakeClient", () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes(`/api/doctor/online-intake/${REQUEST_ID}`) && !url.includes("/status")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: REQUEST_ID,
            patientUserId: PATIENT_ID,
            type: "lfk",
            status: "new",
            patientName: "Деталь Имя",
            patientPhone: "+79005550123",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            description: "d",
            statusHistory: [],
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          items: [
            {
              id: REQUEST_ID,
              patientUserId: PATIENT_ID,
              type: "lfk",
              status: "new",
              summary: "Кратко о симптомах",
              patientName: "Список Имя",
              patientPhone: "+79007770088",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
          total: 1,
          page: 1,
          totalPages: 1,
        }),
      } as Response);
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("renders patientName and patientPhone from list API", async () => {
    render(<DoctorOnlineIntakeClient />);
    await waitFor(() => {
      expect(screen.getByText("Список Имя")).toBeInTheDocument();
    });
    expect(screen.getByText("+79007770088")).toBeInTheDocument();
  });

  it("links to client profile and chat", async () => {
    render(<DoctorOnlineIntakeClient />);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Карточка клиента" })).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Карточка клиента" })).toHaveAttribute(
      "href",
      `/app/doctor/clients/${PATIENT_ID}?scope=appointments`,
    );
    expect(screen.getByRole("link", { name: "Чат" })).toHaveAttribute(
      "href",
      `/app/doctor/clients/${PATIENT_ID}?scope=appointments&chat=1`,
    );
  });

  it("calls onDetailChange(id) when user opens a detail", async () => {
    const onDetailChange = vi.fn();
    render(<DoctorOnlineIntakeClient onDetailChange={onDetailChange} />);
    await waitFor(() => screen.getByText("Список Имя"));
    await userEvent.click(screen.getByRole("button", { name: "Подробнее" }));
    expect(onDetailChange).toHaveBeenCalledWith(REQUEST_ID);
  });

  it("calls onDetailChange(null) when user closes a detail", async () => {
    const onDetailChange = vi.fn();
    render(<DoctorOnlineIntakeClient onDetailChange={onDetailChange} />);
    await waitFor(() => screen.getByText("Список Имя"));
    await userEvent.click(screen.getByRole("button", { name: "Подробнее" }));
    await waitFor(() => screen.getByRole("button", { name: "Скрыть детали" }));
    await userEvent.click(screen.getByRole("button", { name: "Скрыть детали" }));
    expect(onDetailChange).toHaveBeenLastCalledWith(null);
  });

  it("deep-linked closed request switches to «Все» and does not show orphan card on «Открытые»", async () => {
    const deepId = "00000000-0000-0000-0000-0000000000dd";
    globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes(`/${deepId}`) && !url.includes("/status")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: deepId,
            patientUserId: PATIENT_ID,
            type: "lfk",
            status: "closed",
            patientName: "Deep Имя",
            patientPhone: "+79001112233",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            description: "Текст по ссылке",
            statusHistory: [],
          }),
        } as Response);
      }
      if (url.includes("open=1")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [],
            total: 0,
            page: 1,
            totalPages: 0,
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          items: [
            {
              id: deepId,
              patientUserId: PATIENT_ID,
              type: "lfk",
              status: "closed",
              summary: "Текст по ссылке",
              patientName: "Deep Имя",
              patientPhone: "+79001112233",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
          total: 1,
          page: 1,
          totalPages: 1,
        }),
      } as Response);
    }) as typeof fetch;

    render(<DoctorOnlineIntakeClient initialOpenRequestId={deepId} />);
    await waitFor(() => {
      expect(screen.getByText("Deep Имя")).toBeInTheDocument();
    });
    expect(screen.queryByText("Заявка по ссылке")).not.toBeInTheDocument();
    expect(screen.getByText("Закрыта")).toBeInTheDocument();
  });
});
