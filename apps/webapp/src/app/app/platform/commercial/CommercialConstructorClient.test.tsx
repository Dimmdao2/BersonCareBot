/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommercialConstructorClient } from "./CommercialConstructorClient";

function tariffFixture(id: string, name: string) {
  return {
    id,
    name,
    description: "",
    priceMinor: null,
    currency: null,
    billingPeriod: "month",
    mechanics: {},
    quotas: {},
    includedSeats: null,
    isActive: true,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("CommercialConstructorClient", () => {
  it("renders the platform tariff constructor from the dedicated aggregate", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, tariffs: [], organizations: [], trialPolicy: null }),
    })));

    render(<CommercialConstructorClient />);

    expect(await screen.findByRole("tab", { name: "Тарифы" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Организации" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Триал" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Созданные тарифы" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Новый тариф" })).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/admin/commercial", { cache: "no-store" }));
  });

  it("shows the persisted commercial lifecycle state instead of implying that every org has a trial", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        tariffs: [],
        organizations: [{
          id: "11111111-1111-4111-8111-111111111111",
          title: "Клиника без триала",
          tariffId: null,
          manualTariffId: null,
          isActive: true,
          commercialAccessState: "no_trial",
          effectiveAccess: { lifecycle: "read_only", tariffId: null, source: "no_trial" },
          overrides: [{
            id: "22222222-2222-4222-8222-222222222222",
            organizationId: "11111111-1111-4111-8111-111111111111",
            mechanic: "courses",
            enabled: false,
            quota: null,
            expiresAt: "2026-08-01T00:00:00.000Z",
            seatLimitOverride: null,
            createdAt: "2026-07-01T00:00:00.000Z",
            updatedAt: "2026-07-01T00:00:00.000Z",
          }],
          trial: null,
        }],
        trialPolicy: null,
      }),
    })));

    render(<CommercialConstructorClient />);
    fireEvent.click(await screen.findByRole("tab", { name: "Организации" }));
    fireEvent.click((await screen.findAllByRole("combobox"))[0]!);
    fireEvent.click(screen.getByText("Клиника без триала"));

    expect(await screen.findByText("Доступ: Только чтение")).toBeInTheDocument();
    expect(screen.getByText(/Курсы: запрещено; действует до/)).toBeInTheDocument();
    expect(screen.getByText("Триал не запускался.")).toBeInTheDocument();
  });

  it("keeps overrides independent from trial extension and exposes only valid lifecycle controls", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        tariffs: [
          tariffFixture("33333333-3333-4333-8333-333333333333", "Триал"),
          tariffFixture("44444444-4444-4444-8444-444444444444", "Платный"),
        ],
        organizations: [{
          id: "11111111-1111-4111-8111-111111111111",
          title: "Организация с триалом",
          tariffId: "33333333-3333-4333-8333-333333333333",
          manualTariffId: null,
          isActive: true,
          commercialAccessState: "active",
          effectiveAccess: { lifecycle: "active", tariffId: "33333333-3333-4333-8333-333333333333", source: "trial" },
          overrides: [],
          trial: {
            id: "22222222-2222-4222-8222-222222222222",
            tariffId: "33333333-3333-4333-8333-333333333333",
            status: "active",
            startedAt: "2026-07-20T00:00:00.000Z",
            endsAt: "2026-07-22T00:00:00.000Z",
            graceEndsAt: "2026-07-23T00:00:00.000Z",
          },
        }],
        trialPolicy: {
          tariffId: "33333333-3333-4333-8333-333333333333",
          durationDays: 14,
          graceDays: 0,
          startEvent: "organization_provisioned",
          postTrialBehavior: "read_only",
          postTrialTariffId: null,
          isActive: true,
        },
      }),
    })));

    render(<CommercialConstructorClient />);
    fireEvent.click(await screen.findByRole("tab", { name: "Организации" }));
    fireEvent.click((await screen.findAllByRole("combobox"))[0]!);
    fireEvent.click(screen.getByText("Организация с триалом"));
    fireEvent.change(screen.getByLabelText("Причина (необязательно)"), {
      target: { value: "Проверка операции" },
    });

    expect(screen.getByRole("button", { name: "Сохранить исключение" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Удалить" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Запустить триал" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Продлить" })).toBeDisabled();
    expect(screen.getByText("Статус триала: Активен")).toBeInTheDocument();
    expect(screen.getByText("Тариф триала: Триал")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Завершить триал и назначить" })).toBeDisabled();
  });

  it("shows an elapsed persisted-active trial as expired and disables extension", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        tariffs: [tariffFixture("33333333-3333-4333-8333-333333333333", "Триал")],
        organizations: [{
          id: "11111111-1111-4111-8111-111111111111",
          title: "Истёкший триал",
          tariffId: "33333333-3333-4333-8333-333333333333",
          manualTariffId: null,
          isActive: true,
          commercialAccessState: "active",
          effectiveAccess: { lifecycle: "read_only", tariffId: "33333333-3333-4333-8333-333333333333", source: "trial" },
          overrides: [],
          trial: {
            id: "22222222-2222-4222-8222-222222222222",
            tariffId: "33333333-3333-4333-8333-333333333333",
            status: "expired",
            startedAt: "2026-06-01T00:00:00.000Z",
            endsAt: "2026-06-15T00:00:00.000Z",
            graceEndsAt: "2026-06-16T00:00:00.000Z",
          },
        }],
        trialPolicy: null,
      }),
    })));

    render(<CommercialConstructorClient />);
    fireEvent.click(await screen.findByRole("tab", { name: "Организации" }));
    fireEvent.click((await screen.findAllByRole("combobox"))[0]!);
    fireEvent.click(screen.getByText("Истёкший триал"));

    expect(await screen.findByText("Статус триала: Истёк")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Продлить" })).toBeDisabled();
  });

  it("shows loading and a load error explicitly", async () => {
    let rejectRequest: ((reason: Error) => void) | undefined;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((_resolve, reject) => { rejectRequest = reject; })));
    render(<CommercialConstructorClient />);
    expect(screen.getByRole("status")).toHaveTextContent("Загрузка коммерческих настроек");
    rejectRequest?.(new Error("network_failed"));
    expect(await screen.findByRole("alert")).toHaveTextContent("network_failed");
  });

  // Owner 2026-07-26 (#1003): "убрать необходимость ввода причины для правки тарифов (сейчас
  // блокирует сохранение)". The `required` HTML attribute on the reason input is exactly what
  // blocked native form submission — proves it is gone, and that saving with a blank reason still
  // reaches the API with reason: "" (the audit row still gets written server-side).
  it("does not require a reason to save a tariff", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return { ok: true, json: async () => ({ ok: true, result: { id: "created" } }) };
      }
      return {
        ok: true,
        json: async () => ({ ok: true, tariffs: [], organizations: [], trialPolicy: null }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CommercialConstructorClient />);
    await screen.findByRole("heading", { name: "Новый тариф" });

    const reasonInput = screen.getByLabelText("Причина изменения (необязательно)");
    expect(reasonInput).not.toBeRequired();

    fireEvent.change(screen.getByLabelText("Название"), { target: { value: "Базовый" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/commercial",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    const body = JSON.parse((postCall[1] as RequestInit).body as string);
    expect(body).toMatchObject({ action: "create_tariff", reason: "" });
  });

  // Owner 2026-07-26 (#1003): "квоты... там какой-то бред, машинные ключи и непонятные единицы".
  // The unit picker used to render the raw `quotaUnits` machine key ("appointments") as both the
  // dropdown option and, once selected, the trigger's own value.
  it("shows a human-readable quota unit label instead of the raw machine key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, tariffs: [], organizations: [], trialPolicy: null }),
    })));

    render(<CommercialConstructorClient />);
    await screen.findByRole("heading", { name: "Новый тариф" });

    // "booking" (quotaUnits: ["appointments"]) mechanic row, scoped by its own label so this does
    // not depend on the mechanic's position in the registry.
    const user = userEvent.setup();
    const bookingRow = screen.getByText("Онлайн-запись").closest(".rounded-xl") as HTMLElement;
    await user.click(within(bookingRow).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Числовая" }));

    // Selecting "Числовая" reveals unit/period/usagePolicy comboboxes inside the same row.
    const rowComboboxes = await within(bookingRow).findAllByRole("combobox");
    expect(rowComboboxes).toHaveLength(4);
    await user.click(rowComboboxes[1]!);
    expect(await screen.findByRole("option", { name: "Записи" })).toBeInTheDocument();
    expect(screen.queryByText("appointments")).not.toBeInTheDocument();
  });
});
