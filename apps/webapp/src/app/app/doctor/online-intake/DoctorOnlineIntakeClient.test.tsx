/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DoctorOnlineIntakeClient } from "./DoctorOnlineIntakeClient";

const PATIENT_ID = "00000000-0000-0000-0000-0000000000aa";
const REQUEST_ID = "00000000-0000-0000-0000-0000000000cc";

const ITEM_ROW = {
  id: REQUEST_ID,
  patientUserId: PATIENT_ID,
  type: "lfk",
  status: "new",
  summary: "Боль в шее",
  patientName: "Список Имя",
  patientPhone: "+79007770088",
  createdAt: "2026-01-01T10:00:00.000Z",
  updatedAt: "2026-01-01T10:00:00.000Z",
};

const DETAIL_RECORD = {
  id: REQUEST_ID,
  patientUserId: PATIENT_ID,
  type: "lfk",
  status: "new",
  patientName: "Список Имя",
  patientPhone: "+79007770088",
  createdAt: "2026-01-01T10:00:00.000Z",
  updatedAt: "2026-01-01T10:00:00.000Z",
  description: "Боль в шее уже неделю",
  statusHistory: [],
};

const EMPTY_STATS = {
  days: 30,
  total: 0,
  byStatus: {},
  conversionRate: null,
};

function makeFetch(overrides?: {
  list?: object;
  detail?: object;
  stats?: object;
  reply?: object;
  status?: object;
}) {
  return vi.fn((input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;

    if (url.includes("/reply")) {
      const body = overrides?.reply ?? { ok: true };
      return Promise.resolve({ ok: true, json: async () => body } as Response);
    }
    if (url.includes("/status")) {
      const body = overrides?.status ?? { id: REQUEST_ID, status: "booked", updatedAt: "2026-01-02T00:00:00.000Z" };
      return Promise.resolve({ ok: true, json: async () => body } as Response);
    }
    if (url.includes("/stats")) {
      const body = overrides?.stats ?? { ok: true, stats: EMPTY_STATS };
      return Promise.resolve({ ok: true, json: async () => body } as Response);
    }
    if (url.match(/\/online-intake\/[^/]+$/) && !url.includes("/stats")) {
      const body = overrides?.detail ?? DETAIL_RECORD;
      return Promise.resolve({ ok: true, json: async () => body } as Response);
    }
    // list
    const body = overrides?.list ?? { items: [ITEM_ROW], total: 1 };
    return Promise.resolve({ ok: true, json: async () => body } as Response);
  });
}

describe("DoctorOnlineIntakeClient — список", () => {
  beforeEach(() => { vi.stubGlobal("fetch", makeFetch()); });
  afterEach(() => vi.unstubAllGlobals());

  it("показывает имя пациента из списка", async () => {
    render(<DoctorOnlineIntakeClient />);
    expect(await screen.findByText("Список Имя")).toBeInTheDocument();
  });

  it("показывает телефон пациента в строке", async () => {
    render(<DoctorOnlineIntakeClient />);
    await screen.findByText("Список Имя");
    expect(screen.getAllByText(/\+79007770088/).length).toBeGreaterThan(0);
  });

  it("показывает empty-state «Заявок нет» при пустом списке и без фильтров", async () => {
    vi.stubGlobal("fetch", makeFetch({ list: { items: [], total: 0 } }));
    render(<DoctorOnlineIntakeClient />);
    // дефолт — все заявки (пустой выбор); пустой список → empty-state сразу
    await waitFor(() => {
      expect(screen.getByText(/заявок нет/i)).toBeInTheDocument();
    });
  });

  it("по умолчанию фильтр «Новые» не активен — показываются все заявки", async () => {
    render(<DoctorOnlineIntakeClient />);
    const newBtn = await screen.findByRole("button", { name: /Новые/i });
    expect(newBtn).toHaveAttribute("aria-pressed", "false");
  });

  it("нет кнопки «Все» — фильтр убран", async () => {
    render(<DoctorOnlineIntakeClient />);
    await screen.findByText("Список Имя");
    expect(screen.queryByRole("button", { name: /^Все$/i })).not.toBeInTheDocument();
  });

  it("дефолт — пустой выбор — все заявки видны без клика", async () => {
    render(<DoctorOnlineIntakeClient />);
    // дефолт пустой выбор → все заявки сразу видны
    expect(await screen.findByText("Список Имя")).toBeInTheDocument();
  });

  it("клик тоггл включает фильтр, повторный клик снимает — возвращаются все заявки", async () => {
    render(<DoctorOnlineIntakeClient />);
    await screen.findByText("Список Имя");

    // дефолт — пустой выбор, все заявки видны
    expect(await screen.findByText("Список Имя")).toBeInTheDocument();

    // Включаем фильтр «В работе» — заявка со статусом new исчезает
    const inReviewBtn = screen.getByRole("button", { name: /В работе/i });
    await userEvent.click(inReviewBtn);
    expect(inReviewBtn).toHaveAttribute("aria-pressed", "true");
    // Заявка «new» не входит в «in_review»
    await waitFor(() => {
      expect(screen.queryByText("Список Имя")).not.toBeInTheDocument();
    });

    // Повторный клик — фильтр снимается, все заявки снова видны
    await userEvent.click(inReviewBtn);
    expect(inReviewBtn).toHaveAttribute("aria-pressed", "false");
    expect(await screen.findByText("Список Имя")).toBeInTheDocument();
  });

  it("можно включить несколько тогглов одновременно", async () => {
    render(<DoctorOnlineIntakeClient />);
    await screen.findByText("Список Имя");

    const newBtn = screen.getByRole("button", { name: /Новые/i });
    const inReviewBtn = screen.getByRole("button", { name: /В работе/i });

    // оба выключены по умолчанию; включаем «Новые» и «В работе»
    await userEvent.click(newBtn);
    await userEvent.click(inReviewBtn);

    expect(newBtn).toHaveAttribute("aria-pressed", "true");
    expect(inReviewBtn).toHaveAttribute("aria-pressed", "true");
    // Заявка «new» должна быть видна (входит в выбранные статусы)
    expect(screen.getByText("Список Имя")).toBeInTheDocument();
  });
});

describe("DoctorOnlineIntakeClient — детальная панель", () => {
  beforeEach(() => { vi.stubGlobal("fetch", makeFetch()); });
  afterEach(() => vi.unstubAllGlobals());

  it("клик по строке открывает детальную панель", async () => {
    render(<DoctorOnlineIntakeClient />);
    await screen.findByText("Список Имя");
    await userEvent.click(screen.getByRole("button", { name: /Список Имя/i }));
    await waitFor(() => {
      expect(screen.getByText("Боль в шее уже неделю")).toBeInTheDocument();
    });
  });

  it("показывает «Карточка клиента» (ссылка) и «Открыть чат» (кнопка-модалка) в панели деталей", async () => {
    render(<DoctorOnlineIntakeClient />);
    await screen.findByText("Список Имя");
    await userEvent.click(screen.getByRole("button", { name: /Список Имя/i }));
    await waitFor(() => screen.getByRole("link", { name: "Карточка клиента" }));
    expect(screen.getByRole("link", { name: "Карточка клиента" })).toHaveAttribute(
      "href",
      `/app/doctor/patients/${PATIENT_ID}`,
    );
    // «Открыть чат» теперь открывает модалку с перепиской (не уводит со страницы) — это кнопка, не ссылка.
    expect(screen.getByRole("button", { name: "Открыть чат" })).toBeInTheDocument();
  });

  it("вызывает onDetailChange(id) при открытии", async () => {
    const onDetailChange = vi.fn();
    render(<DoctorOnlineIntakeClient onDetailChange={onDetailChange} />);
    await screen.findByText("Список Имя");
    await userEvent.click(screen.getByRole("button", { name: /Список Имя/i }));
    expect(onDetailChange).toHaveBeenCalledWith(REQUEST_ID);
  });

  it("вызывает onDetailChange(null) при закрытии (повторный клик)", async () => {
    const onDetailChange = vi.fn();
    render(<DoctorOnlineIntakeClient onDetailChange={onDetailChange} />);
    await screen.findByText("Список Имя");
    const rowBtn = screen.getByRole("button", { name: /Список Имя/i });
    await userEvent.click(rowBtn);
    await waitFor(() => expect(onDetailChange).toHaveBeenCalledWith(REQUEST_ID));
    await userEvent.click(rowBtn);
    expect(onDetailChange).toHaveBeenLastCalledWith(null);
  });
});

describe("DoctorOnlineIntakeClient — ответ", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("отправляет POST /reply и показывает «Ответ отправлен»", async () => {
    const fetchMock = makeFetch();
    vi.stubGlobal("fetch", fetchMock);

    render(<DoctorOnlineIntakeClient />);
    await screen.findByText("Список Имя");
    await userEvent.click(screen.getByRole("button", { name: /Список Имя/i }));
    await waitFor(() => screen.getByRole("textbox", { name: /текст ответа/i }));

    await userEvent.type(screen.getByRole("textbox", { name: /текст ответа/i }), "Здравствуйте");
    await userEvent.click(screen.getByRole("button", { name: /^ответить$/i }));

    await waitFor(() => {
      expect(screen.getByText(/ответ отправлен/i)).toBeInTheDocument();
    });

    const replyCalls = fetchMock.mock.calls.filter(([u]) =>
      (typeof u === "string" ? u : (u as Request).url).includes("/reply"),
    );
    expect(replyCalls).toHaveLength(1);
  });

  it("кнопка «Ответить» заблокирована при пустом тексте", async () => {
    vi.stubGlobal("fetch", makeFetch());
    render(<DoctorOnlineIntakeClient />);
    await screen.findByText("Список Имя");
    await userEvent.click(screen.getByRole("button", { name: /Список Имя/i }));
    await waitFor(() => screen.getByRole("button", { name: /^ответить$/i }));
    expect(screen.getByRole("button", { name: /^ответить$/i })).toBeDisabled();
  });
});

describe("DoctorOnlineIntakeClient — смена статуса", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("кнопка «Записать →» вызывает PATCH /status с booked", async () => {
    const fetchMock = makeFetch();
    vi.stubGlobal("fetch", fetchMock);

    render(<DoctorOnlineIntakeClient />);
    await screen.findByText("Список Имя");
    await userEvent.click(screen.getByRole("button", { name: /Список Имя/i }));
    await waitFor(() => screen.getByRole("button", { name: /Записать →/i }));

    await userEvent.click(screen.getByRole("button", { name: /Записать →/i }));

    await waitFor(() => {
      const statusCalls = fetchMock.mock.calls.filter(([u]) =>
        (typeof u === "string" ? u : (u as Request).url).includes("/status"),
      );
      expect(statusCalls).toHaveLength(1);
    });

    const statusCall = fetchMock.mock.calls.find(([u]) =>
      (typeof u === "string" ? u : (u as Request).url).includes("/status"),
    );
    expect(statusCall?.[1]?.method).toBe("PATCH");
    const body = JSON.parse(statusCall?.[1]?.body as string) as { status: string };
    expect(body.status).toBe("booked");
  });

  it("кнопка «В отказ» вызывает PATCH /status с rejected", async () => {
    const fetchMock = makeFetch();
    vi.stubGlobal("fetch", fetchMock);

    render(<DoctorOnlineIntakeClient />);
    await screen.findByText("Список Имя");
    await userEvent.click(screen.getByRole("button", { name: /Список Имя/i }));
    await waitFor(() => screen.getByRole("button", { name: /В отказ/i }));

    await userEvent.click(screen.getByRole("button", { name: /В отказ/i }));

    await waitFor(() => {
      const statusCalls = fetchMock.mock.calls.filter(([u]) =>
        (typeof u === "string" ? u : (u as Request).url).includes("/status"),
      );
      expect(statusCalls.length).toBeGreaterThan(0);
    });

    const statusCall = fetchMock.mock.calls.find(([u]) =>
      (typeof u === "string" ? u : (u as Request).url).includes("/status"),
    );
    const body = JSON.parse(statusCall?.[1]?.body as string) as { status: string };
    expect(body.status).toBe("rejected");
  });
});

describe("DoctorOnlineIntakeClient — deep-link", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("deep-link: загружает и показывает детали по initialOpenRequestId", async () => {
    vi.stubGlobal("fetch", makeFetch());

    render(<DoctorOnlineIntakeClient initialOpenRequestId={REQUEST_ID} />);

    await waitFor(() => {
      expect(screen.getByText("Боль в шее уже неделю")).toBeInTheDocument();
    });
  });
});

describe("DoctorOnlineIntakeClient — статистика", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("показывает плитки статистики когда stats загружены", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch({
        stats: {
          ok: true,
          stats: {
            days: 30,
            total: 5,
            byStatus: { new: 2, in_review: 1, booked: 2 },
            conversionRate: 1,
          },
        },
      }),
    );

    render(<DoctorOnlineIntakeClient />);

    await waitFor(() => {
      // Total tile
      expect(screen.getByText("5")).toBeInTheDocument();
    });
  });

  it("сворачивает статистику по клику на заголовок", async () => {
    vi.stubGlobal("fetch", makeFetch());

    render(<DoctorOnlineIntakeClient />);
    await screen.findByText("Список Имя");

    await userEvent.click(screen.getByRole("button", { name: /статистика заявок/i }));

    // After collapsing, stats tiles should not be visible
    await waitFor(() => {
      expect(screen.queryByText(/всего/i)).not.toBeInTheDocument();
    });
  });
});
