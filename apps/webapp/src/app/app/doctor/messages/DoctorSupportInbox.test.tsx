/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DoctorSupportInbox } from "./DoctorSupportInbox";

vi.mock("@/modules/messaging/components/DoctorChatPanel", () => ({
  DoctorChatPanel: ({ conversationId }: { conversationId: string }) => (
    <div>chat:{conversationId}</div>
  ),
}));

const BASE_CONV = {
  conversationId: "00000000-0000-4000-8000-000000000002",
  displayName: "Пациент",
  phoneNormalized: "+79990000000",
  lastMessageAt: "2025-01-02T12:34:00.000Z",
  lastMessageText: "Здравствуйте",
  lastSenderRole: "user",
  unreadFromUserCount: 2,
  hasUnreadFromUser: true,
  onSupport: false,
};

function makeFetch(conversations: object[]) {
  return vi.fn(async () =>
    new Response(JSON.stringify({ ok: true, conversations })),
  );
}

describe("DoctorSupportInbox — базовый рендер", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", makeFetch([BASE_CONV]));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("рендерит имя пациента, время и бейдж непрочитанных", async () => {
    render(<DoctorSupportInbox />);
    expect(await screen.findByText("Пациент")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getAllByText(/02\.01/).length).toBeGreaterThan(0);
  });

  it("показывает превью сообщения с префиксом отправителя (пациент)", async () => {
    render(<DoctorSupportInbox />);
    await screen.findByText("Пациент");
    expect(screen.getByText("Пациент:")).toBeInTheDocument();
    expect(screen.getByText("Здравствуйте")).toBeInTheDocument();
  });

  it("показывает 'Выберите чат слева' при отсутствии выбранного диалога", async () => {
    render(<DoctorSupportInbox />);
    await screen.findByText("Пациент");
    expect(screen.getByText("Выберите чат слева")).toBeInTheDocument();
  });

  it("открывает DoctorChatPanel при клике на строку", async () => {
    render(<DoctorSupportInbox />);
    await userEvent.click(await screen.findByText("Пациент"));
    expect(screen.getByText(`chat:${BASE_CONV.conversationId}`)).toBeInTheDocument();
  });
});

describe("DoctorSupportInbox — seam: onSupport и lastSenderRole", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("рендерит ★ когда onSupport=true", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch([{ ...BASE_CONV, displayName: "Ирина Вовк", onSupport: true }]),
    );
    render(<DoctorSupportInbox />);
    await screen.findByText("Ирина Вовк");
    expect(screen.getByText("★")).toBeInTheDocument();
  });

  it("не рендерит ★ когда onSupport=false", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch([{ ...BASE_CONV, displayName: "Юлия", onSupport: false }]),
    );
    render(<DoctorSupportInbox />);
    await screen.findByText("Юлия");
    expect(screen.queryByText("★")).not.toBeInTheDocument();
  });

  it("показывает 'Вы:' как префикс для lastSenderRole=admin", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch([{ ...BASE_CONV, lastSenderRole: "admin", lastMessageText: "Сделал" }]),
    );
    render(<DoctorSupportInbox />);
    await screen.findByText("Пациент");
    expect(screen.getByText("Вы:")).toBeInTheDocument();
    expect(screen.getByText("Сделал")).toBeInTheDocument();
  });

  it("показывает имя пациента как префикс для lastSenderRole=user", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch([
        { ...BASE_CONV, displayName: "Ирина Вовк", lastSenderRole: "user", lastMessageText: "Спасибо" },
      ]),
    );
    render(<DoctorSupportInbox />);
    await screen.findByText("Ирина Вовк");
    expect(screen.getByText("Ирина:")).toBeInTheDocument();
  });
});

describe("DoctorSupportInbox — фильтр чипы (клиентская сторона)", () => {
  const convUnread = {
    ...BASE_CONV,
    conversationId: "c1",
    displayName: "Непрочитанный",
    unreadFromUserCount: 3,
    hasUnreadFromUser: true,
  };
  const convRead = {
    ...BASE_CONV,
    conversationId: "c2",
    displayName: "Прочитанный",
    unreadFromUserCount: 0,
    hasUnreadFromUser: false,
  };
  const convSupport = {
    ...BASE_CONV,
    conversationId: "c3",
    displayName: "На сопровождении",
    onSupport: true,
    unreadFromUserCount: 0,
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", makeFetch([convUnread, convRead, convSupport]));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("фильтр 'Непрочитанные' показывает только unread строки без нового запроса", async () => {
    const fetchMock = makeFetch([convUnread, convRead, convSupport]);
    vi.stubGlobal("fetch", fetchMock);
    render(<DoctorSupportInbox />);
    await screen.findByText("Непрочитанный");

    const callsBefore = fetchMock.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: /Непрочитанные/i }));

    expect(fetchMock.mock.calls.length).toBe(callsBefore);
    expect(screen.getByText("Непрочитанный")).toBeInTheDocument();
    expect(screen.queryByText("Прочитанный")).not.toBeInTheDocument();
    expect(screen.queryByText("На сопровождении")).not.toBeInTheDocument();
  });

  it("фильтр '★ На сопровождении' показывает только onSupport строки", async () => {
    render(<DoctorSupportInbox />);
    await screen.findByText("На сопровождении");

    // aria-pressed="false" — фильтр-чип (не строка списка)
    const chipBtn = screen.getAllByRole("button", { name: /На сопровождении/i }).find(
      (b) => b.getAttribute("aria-pressed") !== null,
    );
    expect(chipBtn).toBeDefined();
    await userEvent.click(chipBtn!);

    expect(screen.getByText("На сопровождении")).toBeInTheDocument();
    expect(screen.queryByText("Непрочитанный")).not.toBeInTheDocument();
    expect(screen.queryByText("Прочитанный")).not.toBeInTheDocument();
  });

  it("повторный клик на активный чип сбрасывает фильтр", async () => {
    render(<DoctorSupportInbox />);
    await screen.findByText("Непрочитанный");

    await userEvent.click(screen.getByRole("button", { name: /Непрочитанные/i }));
    await userEvent.click(screen.getByRole("button", { name: /Непрочитанные/i }));

    expect(screen.getByText("Прочитанный")).toBeInTheDocument();
    expect(screen.getByText("Непрочитанный")).toBeInTheDocument();
  });
});

describe("DoctorSupportInbox — ошибки", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("показывает ошибку при сбое сети", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    render(<DoctorSupportInbox />);
    expect(await screen.findByText("Не удалось загрузить диалоги")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Нет открытых диалогов")).toBeInTheDocument();
    });
  });
});

describe("DoctorSupportInbox — polling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  it("не запускает поллинг когда active=false", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, conversations: [] }))),
    );
    const spy = vi.spyOn(window, "setInterval");
    render(<DoctorSupportInbox active={false} />);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("не делает запросы во время poll-тиков при скрытом окне", async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, conversations: [] })),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<DoctorSupportInbox active={true} />);
    await act(async () => { await Promise.resolve(); });
    const callsAfterInit = fetchMock.mock.calls.length;

    await act(async () => { vi.advanceTimersByTime(3_500); });
    expect(fetchMock.mock.calls.length).toBe(callsAfterInit);
  });

  it("возобновляет поллинг при возврате видимости окна", async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, conversations: [] })),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<DoctorSupportInbox active={true} />);
    await act(async () => { await Promise.resolve(); });
    const callsWhileHidden = fetchMock.mock.calls.length;

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    await act(async () => { vi.advanceTimersByTime(2_500); });

    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsWhileHidden);
  });
});
