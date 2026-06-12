/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TodayExerciseCommentAttentionItem } from "../loadDoctorExerciseCommentAttention";
import type { DoctorExerciseCommentCursor } from "@/modules/program-item-discussion/types";

// Mock hook so unit tests aren't affected by debounce / server search logic
vi.mock("./useDoctorExerciseCommentsSearch", () => ({
  useDoctorExerciseCommentsSearch: (items: TodayExerciseCommentAttentionItem[]) => ({
    filteredItems: items,
    serverActive: false,
    serverLoading: false,
    serverError: null,
  }),
}));

import { DoctorCommentsTab } from "./DoctorCommentsTab";

const P1 = "00000000-0000-4000-8000-000000000001";
const P2 = "00000000-0000-4000-8000-000000000002";
const INST = "00000000-0000-4000-8000-bbbb00000001";
const ITEM1 = "00000000-0000-4000-8000-aaa000000001";
const ITEM2 = "00000000-0000-4000-8000-aaa000000002";
const MSG1 = "00000000-0000-4000-8000-ccc000000001";

function makeItem(
  overrides: Partial<TodayExerciseCommentAttentionItem> & {
    stageItemId: string;
    patientDisplayName: string;
  },
): TodayExerciseCommentAttentionItem {
  return {
    patientUserId: P1,
    instanceId: INST,
    stageItemTitle: "Тестовое упражнение",
    latestMessage: {
      id: MSG1,
      instanceStageItemId: overrides.stageItemId,
      patientUserId: P1,
      senderRole: "patient",
      origin: "patient_observation",
      body: "Немного болит поясница",
      mediaFileId: null,
      supportMessageId: null,
      createdAt: "2026-06-11T10:00:00.000Z",
    },
    latestMessageAtLabel: "11.06, 13:00",
    href: `/app/doctor/clients/${P1}/treatment-programs/${INST}?discussionItem=${overrides.stageItemId}`,
    ...overrides,
  };
}

const ITEM_A = makeItem({ stageItemId: ITEM1, patientDisplayName: "Иванов Иван" });
const ITEM_B = makeItem({
  stageItemId: ITEM2,
  patientDisplayName: "Петрова Мария",
  patientUserId: P2,
});

const CURSOR_1: DoctorExerciseCommentCursor = {
  createdAt: "2026-06-11T10:00:00.000Z",
  id: MSG1,
};

function stubFetchOk(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  } as unknown as Response);
}

describe("DoctorCommentsTab — базовый рендер", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("показывает имена пациентов в левой панели", () => {
    render(
      <DoctorCommentsTab initialItems={[ITEM_A, ITEM_B]} initialCursor={null} hasMoreInitial={false} />,
    );
    expect(screen.getByText("Иванов Иван")).toBeInTheDocument();
    expect(screen.getByText("Петрова Мария")).toBeInTheDocument();
  });

  it("показывает empty-state при отсутствии элементов", () => {
    render(<DoctorCommentsTab initialItems={[]} initialCursor={null} hasMoreInitial={false} />);
    expect(screen.getByText(/нет новых комментариев/i)).toBeInTheDocument();
  });

  it("показывает «Выберите комментарий слева» в правой панели по умолчанию", () => {
    render(<DoctorCommentsTab initialItems={[ITEM_A]} initialCursor={null} hasMoreInitial={false} />);
    expect(screen.getByText("Выберите комментарий слева")).toBeInTheDocument();
  });

  it("показывает «Загрузить ещё» когда hasMoreInitial=true", () => {
    render(
      <DoctorCommentsTab initialItems={[ITEM_A]} initialCursor={CURSOR_1} hasMoreInitial={true} />,
    );
    expect(screen.getByRole("button", { name: /загрузить ещё/i })).toBeInTheDocument();
  });

  it("скрывает «Загрузить ещё» когда hasMoreInitial=false", () => {
    render(<DoctorCommentsTab initialItems={[ITEM_A]} initialCursor={null} hasMoreInitial={false} />);
    expect(screen.queryByRole("button", { name: /загрузить ещё/i })).not.toBeInTheDocument();
  });
});

describe("DoctorCommentsTab — детальная панель", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("клик на строку открывает правую панель с именем пациента и формой ответа", async () => {
    render(<DoctorCommentsTab initialItems={[ITEM_A]} initialCursor={null} hasMoreInitial={false} />);

    await userEvent.click(screen.getByRole("button", { name: /Иванов Иван/i }));

    // header in right pane shows patient name
    const allNames = screen.getAllByText(/Иванов Иван/i);
    expect(allNames.length).toBeGreaterThanOrEqual(2); // row + header

    // reply textarea and button appear
    expect(screen.getByRole("textbox", { name: /текст ответа/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^ответить$/i })).toBeInTheDocument();
  });

  it("кнопка «Ответить» заблокирована при пустом тексте", async () => {
    render(<DoctorCommentsTab initialItems={[ITEM_A]} initialCursor={null} hasMoreInitial={false} />);

    await userEvent.click(screen.getByRole("button", { name: /Иванов Иван/i }));
    expect(screen.getByRole("button", { name: /^ответить$/i })).toBeDisabled();
  });

  it("смена строки сбрасывает текст ответа", async () => {
    render(
      <DoctorCommentsTab initialItems={[ITEM_A, ITEM_B]} initialCursor={null} hasMoreInitial={false} />,
    );

    await userEvent.click(screen.getByRole("button", { name: /Иванов Иван/i }));
    await userEvent.type(screen.getByRole("textbox", { name: /текст ответа/i }), "Отлично!");
    expect(screen.getByRole("textbox", { name: /текст ответа/i })).toHaveValue("Отлично!");

    await userEvent.click(screen.getByRole("button", { name: /Петрова Мария/i }));
    expect(screen.getByRole("textbox", { name: /текст ответа/i })).toHaveValue("");
  });
});

describe("DoctorCommentsTab — ответ (POST program-note-reply)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("отправляет POST на правильный URL с текстом", async () => {
    const fetchMock = stubFetchOk({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<DoctorCommentsTab initialItems={[ITEM_A]} initialCursor={null} hasMoreInitial={false} />);

    await userEvent.click(screen.getByRole("button", { name: /Иванов Иван/i }));
    await userEvent.type(screen.getByRole("textbox", { name: /текст ответа/i }), "Хорошая работа");
    await userEvent.click(screen.getByRole("button", { name: /^ответить$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(
      `/api/doctor/treatment-program-instances/${INST}/items/${ITEM1}/program-note-reply`,
    );
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ text: "Хорошая работа" });
  });

  it("показывает «Ответ отправлен» после успешной отправки", async () => {
    vi.stubGlobal("fetch", stubFetchOk({ ok: true }));

    render(<DoctorCommentsTab initialItems={[ITEM_A]} initialCursor={null} hasMoreInitial={false} />);

    await userEvent.click(screen.getByRole("button", { name: /Иванов Иван/i }));
    await userEvent.type(screen.getByRole("textbox", { name: /текст ответа/i }), "Супер");
    await userEvent.click(screen.getByRole("button", { name: /^ответить$/i }));

    await waitFor(() => {
      expect(screen.getByText(/ответ отправлен/i)).toBeInTheDocument();
    });
  });

  it("показывает текст ошибки feature_disabled", async () => {
    vi.stubGlobal("fetch", stubFetchOk({ ok: false, error: "feature_disabled" }));

    render(<DoctorCommentsTab initialItems={[ITEM_A]} initialCursor={null} hasMoreInitial={false} />);

    await userEvent.click(screen.getByRole("button", { name: /Иванов Иван/i }));
    await userEvent.type(screen.getByRole("textbox", { name: /текст ответа/i }), "Текст");
    await userEvent.click(screen.getByRole("button", { name: /^ответить$/i }));

    await waitFor(() => {
      expect(screen.getByText(/функция временно недоступна/i)).toBeInTheDocument();
    });
  });

  it("показывает ошибку при сбое сети", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network error")),
    );

    render(<DoctorCommentsTab initialItems={[ITEM_A]} initialCursor={null} hasMoreInitial={false} />);

    await userEvent.click(screen.getByRole("button", { name: /Иванов Иван/i }));
    await userEvent.type(screen.getByRole("textbox", { name: /текст ответа/i }), "Текст");
    await userEvent.click(screen.getByRole("button", { name: /^ответить$/i }));

    await waitFor(() => {
      expect(screen.getByText(/ошибка сети/i)).toBeInTheDocument();
    });
  });
});

describe("DoctorCommentsTab — «Загрузить ещё»", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("вызывает /api/doctor/exercise-comments с cursor и добавляет новые элементы", async () => {
    const fetchMock = stubFetchOk({
      ok: true,
      items: [ITEM_B],
      hasMore: false,
      nextCursor: null,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DoctorCommentsTab initialItems={[ITEM_A]} initialCursor={CURSOR_1} hasMoreInitial={true} />,
    );

    await userEvent.click(screen.getByRole("button", { name: /загрузить ещё/i }));

    await waitFor(() => {
      expect(screen.getByText("Петрова Мария")).toBeInTheDocument();
    });

    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toContain("/api/doctor/exercise-comments");
    expect(url).toContain("cursor=");
  });

  it("скрывает кнопку после загрузки когда hasMore=false", async () => {
    vi.stubGlobal("fetch", stubFetchOk({ ok: true, items: [], hasMore: false, nextCursor: null }));

    render(
      <DoctorCommentsTab initialItems={[ITEM_A]} initialCursor={CURSOR_1} hasMoreInitial={true} />,
    );

    await userEvent.click(screen.getByRole("button", { name: /загрузить ещё/i }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /загрузить ещё/i })).not.toBeInTheDocument();
    });
  });

  it("скрывает кнопку при активном поисковом запросе", async () => {
    render(
      <DoctorCommentsTab initialItems={[ITEM_A]} initialCursor={CURSOR_1} hasMoreInitial={true} />,
    );

    expect(screen.getByRole("button", { name: /загрузить ещё/i })).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/поиск по пациенту/i), "Иванов");

    expect(screen.queryByRole("button", { name: /загрузить ещё/i })).not.toBeInTheDocument();
  });
});

describe("DoctorCommentsTab — фильтр чипы (Новые / Все)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("чип «Новые» активен (aria-pressed=true) по умолчанию", () => {
    render(<DoctorCommentsTab initialItems={[ITEM_A]} initialCursor={null} hasMoreInitial={false} />);
    expect(screen.getByRole("button", { name: /^Новые$/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("клик на «Все» переключает активный чип", async () => {
    render(<DoctorCommentsTab initialItems={[ITEM_A]} initialCursor={null} hasMoreInitial={false} />);

    await userEvent.click(screen.getByRole("button", { name: /^Все$/i }));

    expect(screen.getByRole("button", { name: /^Все$/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^Новые$/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("«★ Только на сопровождении» показывает количество элементов", () => {
    render(
      <DoctorCommentsTab
        initialItems={[ITEM_A, ITEM_B]}
        initialCursor={null}
        hasMoreInitial={false}
      />,
    );
    // initially allItems = initialItems, so count = 2
    expect(screen.getByText(/★ Только на сопровождении · 2/)).toBeInTheDocument();
  });
});
