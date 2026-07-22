/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { DoctorSupportInbox } from "./DoctorSupportInbox";

vi.mock("@/modules/messaging/components/DoctorChatPanel", () => ({
  DoctorChatPanel: ({ conversationId }: { conversationId: string }) => (
    <div>chat:{conversationId}</div>
  ),
}));

vi.mock("./ChatClientOverviewPanel", () => ({
  ChatClientOverviewPanel: ({ patientUserId }: { patientUserId: string }) => (
    <div>overview:{patientUserId}</div>
  ),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string; className?: string }) => (
    <a href={href} {...props}>{children}</a>
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
  patientUserId: "aaaaaaaa-0000-4000-8000-000000000099",
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
    const { container } = render(<DoctorSupportInbox />);
    await screen.findByText("Пациент");
    expect(screen.getByText("Выберите чат слева")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass(
      "lg:grid-cols-[minmax(0,9fr)_minmax(0,11fr)]",
    );
  });

  it("открывает DoctorChatPanel from the full row by pointer and keyboard", async () => {
    const onSelectedConversationChange = vi.fn();
    render(<DoctorSupportInbox onSelectedConversationChange={onSelectedConversationChange} />);
    const patientName = await screen.findByText("Пациент");
    const row = patientName.closest("button");
    expect(row).toHaveClass("w-full", "cursor-pointer", "hover:bg-muted");

    await userEvent.click(screen.getByText("Здравствуйте"));
    expect(screen.getByText(`chat:${BASE_CONV.conversationId}`)).toBeInTheDocument();
    expect(onSelectedConversationChange).toHaveBeenLastCalledWith(BASE_CONV.conversationId);

    row?.focus();
    await userEvent.keyboard(" ");
    expect(onSelectedConversationChange).toHaveBeenCalledTimes(2);
  });

  it("uses the shared inset flat-list rhythm and a subtle selection marker", async () => {
    render(<DoctorSupportInbox />);

    const primaryName = await screen.findByText("Пациент");
    const row = primaryName.closest("button");
    const list = row?.closest("ul");

    expect(row).toHaveClass(
      "border-t-0",
      "px-[var(--doctor-list-inline-padding,18px)]",
      "text-base",
      "font-normal",
      "rounded-none",
    );
    expect(primaryName).toHaveClass("text-base", "font-normal");
    expect(list).toHaveClass("mx-[var(--doctor-block-padding,18px)]");
    const flatListSurface = document.querySelector("[data-doctor-flat-list-surface]");
    expect(flatListSurface).toBeInTheDocument();
    expect(flatListSurface?.className).not.toMatch(/\bborder\b|\brounded-/);

    await userEvent.click(primaryName);
    expect(row?.querySelector("[aria-hidden]")).toHaveClass(
      "absolute",
      "w-[3px]",
      "bg-primary",
    );
    expect(row).not.toHaveClass("bg-primary/15");
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

describe("DoctorSupportInbox — шапка треда", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", makeFetch([BASE_CONV]));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("при выборе чата показывает шапку с именем пациента", async () => {
    render(<DoctorSupportInbox />);
    await userEvent.click(await screen.findByText("Пациент"));
    // Имя пациента присутствует в шапке (и ещё в левом списке — ищем по role=heading нет,
    // проверяем просто наличие text; displayName = "Пациент" есть в шапке + в строке списка)
    const patientElements = screen.getAllByText("Пациент");
    // Шапка добавляет ещё один элемент с именем
    expect(patientElements.length).toBeGreaterThanOrEqual(2);
  });

  it("при выборе чата показывает ссылку в профиль пациента", async () => {
    render(<DoctorSupportInbox />);
    await userEvent.click(await screen.findByText("Пациент"));

    expect(screen.getByRole("link", { name: "Пациент" })).toHaveAttribute(
      "href",
      `/app/doctor/patients/${BASE_CONV.patientUserId}`,
    );
    expect(screen.queryByText("Открыть карточку")).not.toBeInTheDocument();
  });

  it("открывает панель обзора и записей для пациента", async () => {
    render(<DoctorSupportInbox />);
    await userEvent.click(await screen.findByText("Пациент"));
    await userEvent.click(screen.getByRole("button", { name: "Обзор и записи" }));

    expect(screen.getByText(`overview:${BASE_CONV.patientUserId}`)).toBeInTheDocument();
  });

  it("при выборе чата кнопка × видна и сбрасывает выбор", async () => {
    render(<DoctorSupportInbox />);
    await userEvent.click(await screen.findByText("Пациент"));

    // DoctorChatPanel виден
    expect(screen.getByText(`chat:${BASE_CONV.conversationId}`)).toBeInTheDocument();

    // Кнопка × закрывает тред
    const closeBtn = screen.getByRole("button", { name: "Закрыть тред" });
    await userEvent.click(closeBtn);

    // Правая панель вернулась к плейсхолдеру
    expect(screen.getByText("Выберите чат слева")).toBeInTheDocument();
    // DoctorChatPanel исчез
    expect(screen.queryByText(`chat:${BASE_CONV.conversationId}`)).not.toBeInTheDocument();
  });

  it("шапка треда НЕ отображается при отсутствии выбранного чата", async () => {
    render(<DoctorSupportInbox />);
    await screen.findByText("Пациент");
    expect(screen.queryByRole("button", { name: "Закрыть тред" })).not.toBeInTheDocument();
  });
});

describe("DoctorSupportInbox — deep-link ?id= (#812)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", makeFetch([BASE_CONV]));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("открывает диалог из initialSelectedConversationId без клика", async () => {
    render(<DoctorSupportInbox initialSelectedConversationId={BASE_CONV.conversationId} />);
    expect(await screen.findByText(`chat:${BASE_CONV.conversationId}`)).toBeInTheDocument();
  });

  it("вызывает onSelectedConversationChange(id) при клике на строку", async () => {
    const onSelectedConversationChange = vi.fn();
    render(<DoctorSupportInbox onSelectedConversationChange={onSelectedConversationChange} />);
    await userEvent.click(await screen.findByText("Пациент"));
    expect(onSelectedConversationChange).toHaveBeenCalledWith(BASE_CONV.conversationId);
  });

  it("вызывает onSelectedConversationChange(null) при закрытии треда", async () => {
    const onSelectedConversationChange = vi.fn();
    render(<DoctorSupportInbox onSelectedConversationChange={onSelectedConversationChange} />);
    await userEvent.click(await screen.findByText("Пациент"));
    await userEvent.click(screen.getByRole("button", { name: "Закрыть тред" }));
    expect(onSelectedConversationChange).toHaveBeenLastCalledWith(null);
  });
});

describe("DoctorSupportInbox — имя как единственный переход в карточку", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("показывает ссылку на карточку пациента, когда patientUserId известен", async () => {
    vi.stubGlobal("fetch", makeFetch([BASE_CONV]));
    render(<DoctorSupportInbox />);
    await userEvent.click(await screen.findByText("Пациент"));
    const link = screen.getByRole("link", { name: "Пациент" });
    expect(link).toHaveAttribute("href", `/app/doctor/patients/${BASE_CONV.patientUserId}`);
    expect(screen.queryByText("Открыть карточку")).not.toBeInTheDocument();
  });

  it("не показывает ссылку, когда patientUserId отсутствует (например, Telegram-диалог)", async () => {
    vi.stubGlobal("fetch", makeFetch([{ ...BASE_CONV, patientUserId: null }]));
    render(<DoctorSupportInbox />);
    await userEvent.click(await screen.findByText("Пациент"));
    expect(screen.queryByRole("link", { name: "Пациент" })).not.toBeInTheDocument();
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
