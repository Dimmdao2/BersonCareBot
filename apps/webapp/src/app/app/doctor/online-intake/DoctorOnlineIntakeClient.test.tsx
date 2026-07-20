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

const IN_REVIEW_ROW = {
  ...ITEM_ROW,
  id: "00000000-0000-0000-0000-0000000000dd",
  patientUserId: "00000000-0000-0000-0000-0000000000bb",
  status: "in_review",
  patientName: "Более старая заявка",
  patientPhone: "+79007770099",
  createdAt: "2025-12-31T10:00:00.000Z",
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

  it("показывает общий empty-state при пустом списке без фильтра", async () => {
    vi.stubGlobal("fetch", makeFetch({ list: { items: [], total: 0 } }));
    render(<DoctorOnlineIntakeClient />);
    await waitFor(() => {
      expect(screen.getByText(/заявок пока нет/i)).toBeInTheDocument();
    });
  });

  it("по умолчанию не фильтрует статусы и показывает все заявки", async () => {
    vi.stubGlobal("fetch", makeFetch({ list: { items: [IN_REVIEW_ROW, ITEM_ROW], total: 2 } }));
    render(<DoctorOnlineIntakeClient />);
    const newBtn = await screen.findByRole("tab", { name: /Новые/i });
    expect(newBtn).toHaveAttribute("aria-selected", "false");
    expect(newBtn).toHaveAttribute("tabIndex", "0");
    expect(screen.getByText("Список Имя")).toBeInTheDocument();
    expect(screen.getByText("Более старая заявка")).toBeInTheDocument();
  });

  it("нет кнопки «Все» — фильтр убран", async () => {
    render(<DoctorOnlineIntakeClient />);
    await screen.findByText("Список Имя");
    expect(screen.queryByRole("button", { name: /^Все$/i })).not.toBeInTheDocument();
  });

  it("новая заявка видна без клика", async () => {
    render(<DoctorOnlineIntakeClient />);
    expect(await screen.findByText("Список Имя")).toBeInTheDocument();
  });

  it("выбирает один статус, а повторный клик снимает фильтр", async () => {
    vi.stubGlobal("fetch", makeFetch({ list: { items: [ITEM_ROW, IN_REVIEW_ROW], total: 2 } }));
    render(<DoctorOnlineIntakeClient />);
    await screen.findByText("Список Имя");

    const newBtn = screen.getByRole("tab", { name: /Новые/i });
    const inReviewBtn = screen.getByRole("tab", { name: /В работе/i });
    expect(newBtn).toHaveAttribute("aria-selected", "false");

    await userEvent.click(inReviewBtn);
    expect(inReviewBtn).toHaveAttribute("aria-selected", "true");
    expect(newBtn).toHaveAttribute("aria-selected", "false");
    await waitFor(() => {
      expect(screen.queryByText("Список Имя")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Более старая заявка")).toBeInTheDocument();

    await userEvent.click(inReviewBtn);
    expect(inReviewBtn).toHaveAttribute("aria-selected", "false");
    expect(newBtn).toHaveAttribute("aria-selected", "false");
    expect(await screen.findByText("Список Имя")).toBeInTheDocument();
    expect(screen.getByText("Более старая заявка")).toBeInTheDocument();
  });

  it("стрелка вправо переключает фокус и выбор на следующий статус (tablist keyboard contract)", async () => {
    render(<DoctorOnlineIntakeClient />);
    const newBtn = await screen.findByRole("tab", { name: /Новые/i });
    const inReviewBtn = screen.getByRole("tab", { name: /В работе/i });

    newBtn.focus();
    await userEvent.keyboard("{ArrowRight}");

    expect(inReviewBtn).toHaveAttribute("aria-selected", "true");
    expect(inReviewBtn).toHaveFocus();
    expect(newBtn).toHaveAttribute("aria-selected", "false");
  });

  it("статус-фильтры образуют tablist не более чем с одним активным табом", async () => {
    render(<DoctorOnlineIntakeClient />);
    await screen.findByText("Список Имя");
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(4);
    expect(tabs.filter((t) => t.getAttribute("aria-selected") === "true")).toHaveLength(0);
    await userEvent.click(tabs[2]!);
    expect(tabs.filter((t) => t.getAttribute("aria-selected") === "true")).toHaveLength(1);
  });

  it("сортирует все заявки от новых к старым", async () => {
    vi.stubGlobal("fetch", makeFetch({ list: { items: [IN_REVIEW_ROW, ITEM_ROW], total: 2 } }));
    render(<DoctorOnlineIntakeClient />);
    const newest = await screen.findByText("Список Имя");
    const older = screen.getByText("Более старая заявка");
    expect(newest.compareDocumentPosition(older) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("выделяет new-строку жирнее без изменения ширины строки", async () => {
    vi.stubGlobal("fetch", makeFetch({ list: { items: [ITEM_ROW, IN_REVIEW_ROW], total: 2 } }));
    render(<DoctorOnlineIntakeClient />);
    const newRow = (await screen.findByText("Список Имя")).closest("button");
    const oldRow = screen.getByText("Более старая заявка").closest("button");
    expect(newRow).toHaveClass("w-full", "items-stretch", "font-semibold");
    expect(oldRow).toHaveClass("w-full", "items-stretch");
    expect(oldRow).not.toHaveClass("font-semibold");
  });

  it("использует единый desktop split 45/55", async () => {
    render(<DoctorOnlineIntakeClient />);
    await screen.findByText("Список Имя");
    expect(document.querySelector("#doctor-communications-intake")?.firstElementChild).toHaveClass(
      "lg:grid-cols-[minmax(0,9fr)_minmax(0,11fr)]",
    );
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

  it("оставляет имя в шапке единственным переходом в карточку и сохраняет «Открыть чат»", async () => {
    render(<DoctorOnlineIntakeClient />);
    const listName = await screen.findByText("Список Имя");
    expect(listName.closest("a")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Список Имя/i }));
    await waitFor(() => screen.getByRole("link", { name: "Список Имя" }));
    expect(screen.getByRole("link", { name: "Список Имя" })).toHaveAttribute(
      "href",
      `/app/doctor/patients/${PATIENT_ID}`,
    );
    expect(screen.queryByRole("link", { name: "Карточка клиента" })).not.toBeInTheDocument();
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
