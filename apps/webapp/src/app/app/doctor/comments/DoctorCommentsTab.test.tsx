/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TodayExerciseCommentAttentionItem } from "../loadDoctorExerciseCommentAttention";
import type { DoctorExerciseCommentCursor } from "@/modules/program-item-discussion/types";
import type { CommentPatientRow } from "./loadDoctorCommentPatients";
import type {
  PatientExercisesWithCommentsResult,
  ExerciseCommentItem,
} from "./loadDoctorPatientExercisesWithComments";

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

// ── Fixtures ──────────────────────────────────────────────────────────────────

const P1 = "00000000-0000-4000-8000-000000000001";
const P2 = "00000000-0000-4000-8000-000000000002";
const INST = "00000000-0000-4000-8000-bbbb00000001";
const ITEM1 = "00000000-0000-4000-8000-aaa000000001";
const ITEM2 = "00000000-0000-4000-8000-aaa000000002";
const STAGE1 = "00000000-0000-4000-8000-ddd000000001";
const MSG1 = "00000000-0000-4000-8000-ccc000000001";
const MSG2 = "00000000-0000-4000-8000-ccc000000002";

function makeFeedItem(
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

function makePatient(
  overrides: Partial<CommentPatientRow> & { patientUserId: string; displayName: string },
): CommentPatientRow {
  return {
    isOnSupport: true,
    unreadCount: 1,
    phone: null,
    telegramId: null,
    maxId: null,
    ...overrides,
  };
}

const FEED_A = makeFeedItem({ stageItemId: ITEM1, patientDisplayName: "Иванов Иван", patientUserId: P1 });
const FEED_B = makeFeedItem({ stageItemId: ITEM2, patientDisplayName: "Петрова Мария", patientUserId: P2 });

const PAT_A = makePatient({ patientUserId: P1, displayName: "Иванов Иван" });
const PAT_B = makePatient({ patientUserId: P2, displayName: "Петрова Мария", unreadCount: 2 });

const CURSOR_1: DoctorExerciseCommentCursor = {
  createdAt: "2026-06-11T10:00:00.000Z",
  id: MSG1,
};

const EXERCISE_ITEM: ExerciseCommentItem = {
  stageItemId: ITEM1,
  stageId: STAGE1,
  title: "Приседания",
  thumb: { mediaFileId: null, snapshotPreviewUrl: null },
  totalComments: 3,
  unreadComments: 2,
  latestCommentAt: "2026-06-11T10:00:00.000Z",
};

const EXERCISES_RESULT: PatientExercisesWithCommentsResult = {
  patientUserId: P1,
  instanceId: INST,
  instanceTitle: "Программа реабилитации",
  groups: [
    {
      stageId: STAGE1,
      stageTitle: "Этап 1",
      stageStatus: "in_progress",
      isActive: true,
      exercises: [EXERCISE_ITEM],
    },
  ],
  totalExercisesWithComments: 1,
  totalUnreadComments: 2,
};

const THREAD_RESPONSE = {
  ok: true,
  messages: [
    {
      id: MSG1,
      instanceStageItemId: ITEM1,
      patientUserId: P1,
      senderRole: "patient",
      origin: "patient_observation",
      body: "Болит колено",
      mediaFileId: null,
      supportMessageId: null,
      createdAt: "2026-06-11T10:00:00.000Z",
    },
    {
      id: MSG2,
      instanceStageItemId: ITEM1,
      patientUserId: P1,
      senderRole: "admin",
      origin: "support_admin_reply",
      body: "Понял вас",
      mediaFileId: null,
      supportMessageId: null,
      createdAt: "2026-06-11T11:00:00.000Z",
    },
  ],
  pageInfo: { direction: "backward", limit: 50, nextCursor: null, hasMore: false },
  totalCount: 2,
  peerLastReadAt: null,
};

function stubFetchOk(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  } as unknown as Response);
}

function defaultProps(overrides?: Partial<ConstructorParameters<typeof Object>[0]>) {
  return {
    initialItems: [FEED_A, FEED_B],
    initialCursor: null,
    hasMoreInitial: false,
    initialPatients: [PAT_A, PAT_B],
    ...overrides,
  };
}

// ── State A: feed ─────────────────────────────────────────────────────────────

describe("DoctorCommentsTab — состояние A (лента)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("показывает пациентов в левой панели", () => {
    render(<DoctorCommentsTab {...defaultProps()} />);
    // getAllByRole because patient name appears in both left pane and feed right pane
    expect(screen.getAllByRole("button", { name: /Иванов Иван/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("button", { name: /Петрова Мария/i }).length).toBeGreaterThanOrEqual(1);
  });

  it("показывает ленту комментариев в правой панели по умолчанию", () => {
    render(<DoctorCommentsTab {...defaultProps()} />);
    // feed items appear as patient name
    const allIvanov = screen.getAllByText(/Иванов Иван/);
    expect(allIvanov.length).toBeGreaterThanOrEqual(2); // left pane + right feed
  });

  it("показывает empty-state в левой панели если нет пациентов", () => {
    render(
      <DoctorCommentsTab {...defaultProps({ initialPatients: [] })} />,
    );
    expect(screen.getByText(/нет пациентов с непрочитанными/i)).toBeInTheDocument();
  });

  it("показывает тоггл «★ На сопровождении» с числом пациентов", () => {
    render(<DoctorCommentsTab {...defaultProps()} />);
    expect(
      screen.getByRole("button", { name: /★ На сопровождении · 2/i }),
    ).toBeInTheDocument();
  });

  it("тоггл «★ На сопровождении» переключается (aria-pressed)", async () => {
    render(<DoctorCommentsTab {...defaultProps()} />);
    const btn = screen.getByRole("button", { name: /★ На сопровождении/i });
    expect(btn).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(btn);
    expect(btn).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(btn);
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });

  it("показывает «Загрузить ещё» когда hasMoreInitial=true", () => {
    render(
      <DoctorCommentsTab
        {...defaultProps({ hasMoreInitial: true, initialCursor: CURSOR_1 })}
      />,
    );
    expect(screen.getByRole("button", { name: /загрузить ещё/i })).toBeInTheDocument();
  });

  it("скрывает «Загрузить ещё» когда hasMoreInitial=false", () => {
    render(<DoctorCommentsTab {...defaultProps()} />);
    expect(screen.queryByRole("button", { name: /загрузить ещё/i })).not.toBeInTheDocument();
  });

  it("«Загрузить ещё» вызывает /api/doctor/exercise-comments", async () => {
    const fetchMock = stubFetchOk({
      ok: true,
      items: [],
      hasMore: false,
      nextCursor: null,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DoctorCommentsTab
        {...defaultProps({ hasMoreInitial: true, initialCursor: CURSOR_1 })}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /загрузить ещё/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("/api/doctor/exercise-comments");
  });
});

// ── Navigation A→B ────────────────────────────────────────────────────────────

/** Click the left-pane patient button (first one with aria-pressed attr). */
async function clickPatientInLeftPane(name: RegExp | string) {
  const btns = screen.getAllByRole("button", { name });
  // Left pane patient buttons have aria-pressed attribute
  const leftBtn = btns.find((b) => b.hasAttribute("aria-pressed"));
  if (!leftBtn) throw new Error("No left-pane patient button found for: " + String(name));
  await userEvent.click(leftBtn);
}

describe("DoctorCommentsTab — навигация A→B (выбор пациента)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("клик по пациенту переходит в state B (загружает упражнения)", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetchOk({ ok: true, data: EXERCISES_RESULT }),
    );

    render(<DoctorCommentsTab {...defaultProps()} />);
    await clickPatientInLeftPane(/Иванов Иван/i);

    // Header with patient name appears in right pane
    await waitFor(() => {
      const links = screen.getAllByRole("link");
      const patientLink = links.find((l) => l.textContent?.includes("Иванов Иван"));
      expect(patientLink).toBeDefined();
    });
  });

  it("после выбора пациента показывается кнопка × (сброс пациента)", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetchOk({ ok: true, data: EXERCISES_RESULT }),
    );

    render(<DoctorCommentsTab {...defaultProps()} />);
    await clickPatientInLeftPane(/Иванов Иван/i);

    // Wait for state B header
    await waitFor(() => {
      expect(screen.getByLabelText(/сбросить выбор пациента/i)).toBeInTheDocument();
    });
  });

  it("кнопка «×» в шапке сбрасывает выбор пациента (B→A)", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetchOk({ ok: true, data: EXERCISES_RESULT }),
    );

    render(<DoctorCommentsTab {...defaultProps()} />);
    await clickPatientInLeftPane(/Иванов Иван/i);

    await waitFor(() => {
      expect(screen.getByLabelText(/сбросить выбор пациента/i)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByLabelText(/сбросить выбор пациента/i));

    // Back to state A: patient list toggle still shows
    expect(
      screen.getByRole("button", { name: /★ На сопровождении/i }),
    ).toBeInTheDocument();
  });
});

// ── State B: exercises ────────────────────────────────────────────────────────

describe("DoctorCommentsTab — состояние B (упражнения пациента)", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function renderStateB() {
    vi.stubGlobal(
      "fetch",
      stubFetchOk({ ok: true, data: EXERCISES_RESULT }),
    );
    render(<DoctorCommentsTab {...defaultProps()} />);
    await clickPatientInLeftPane(/Иванов Иван/i);
    // Wait for exercises to load
    await waitFor(() => {
      expect(screen.getByText("Этап 1")).toBeInTheDocument();
    });
  }

  it("показывает группы по этапам", async () => {
    await renderStateB();
    expect(screen.getByText("Этап 1")).toBeInTheDocument();
  });

  it("показывает упражнение в группе", async () => {
    await renderStateB();
    expect(screen.getByText("Приседания")).toBeInTheDocument();
  });

  it("показывает счётчик непрочитанных на упражнении", async () => {
    await renderStateB();
    // 2 unread on the exercise — appears at least once in the DOM
    const twos = screen.getAllByText("2");
    expect(twos.length).toBeGreaterThanOrEqual(1);
  });

  it("показывает ссылку «Открыть программу пациента»", async () => {
    await renderStateB();
    expect(screen.getByRole("link", { name: /открыть программу пациента/i })).toBeInTheDocument();
  });

  it("ссылка на имя пациента ведёт на профиль пациента", async () => {
    await renderStateB();
    const links = screen.getAllByRole("link");
    const profileLink = links.find((l) => l.textContent?.includes("Иванов Иван"));
    expect(profileLink).toBeDefined();
    expect(profileLink!.getAttribute("href")).toContain(P1);
  });
});

// ── Navigation B→C ────────────────────────────────────────────────────────────

describe("DoctorCommentsTab — навигация B→C (выбор упражнения)", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function renderStateC() {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/exercises")) {
          return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: EXERCISES_RESULT }) });
        }
        if (url.includes("exercise-metrics")) {
          return Promise.resolve({ ok: true, json: async () => ({ ok: true, points: [] }) });
        }
        // discussion + mark-read
        return Promise.resolve({ ok: true, json: async () => THREAD_RESPONSE });
      }),
    );

    render(<DoctorCommentsTab {...defaultProps()} />);
    await clickPatientInLeftPane(/Иванов Иван/i);

    await waitFor(() => {
      expect(screen.getByText("Приседания")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Приседания/i }));

    await waitFor(() => {
      expect(screen.getByText(/Болит колено/i)).toBeInTheDocument();
    });
  }

  it("клик по упражнению переходит в state C (тред)", async () => {
    await renderStateC();
    expect(screen.getByText(/Болит колено/i)).toBeInTheDocument();
  });

  it("показывает хлебные крошки пациент → упражнение в шапке", async () => {
    await renderStateC();
    // breadcrumb: patient name link + exercise name
    const links = screen.getAllByRole("link");
    const patientLink = links.find((l) => l.textContent?.includes("Иванов Иван"));
    expect(patientLink).toBeDefined();
    expect(screen.getByText("Приседания")).toBeInTheDocument();
  });

  it("показывает кнопку «Закрыть» (не «×») в треде", async () => {
    await renderStateC();
    expect(screen.getByRole("button", { name: /^Закрыть$/i })).toBeInTheDocument();
  });

  it("кнопка «Закрыть» возвращает в state B", async () => {
    await renderStateC();
    await userEvent.click(screen.getByRole("button", { name: /^Закрыть$/i }));
    // Back to state B: stage group should be visible
    expect(screen.getByText("Этап 1")).toBeInTheDocument();
    // Thread message should disappear
    expect(screen.queryByText(/Болит колено/i)).not.toBeInTheDocument();
  });
});

// ── State C: reply ────────────────────────────────────────────────────────────

describe("DoctorCommentsTab — ответ в треде (state C)", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function renderStateC() {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/exercises")) {
          return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: EXERCISES_RESULT }) });
        }
        if (url.includes("exercise-metrics")) {
          return Promise.resolve({ ok: true, json: async () => ({ ok: true, points: [] }) });
        }
        if (url.includes("program-note-reply")) {
          return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
        }
        return Promise.resolve({ ok: true, json: async () => THREAD_RESPONSE });
      }),
    );

    render(<DoctorCommentsTab {...defaultProps()} />);
    await clickPatientInLeftPane(/Иванов Иван/i);

    await waitFor(() => {
      expect(screen.getByText("Приседания")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Приседания/i }));

    await waitFor(() => {
      expect(screen.getByText(/Болит колено/i)).toBeInTheDocument();
    });
  }

  it("пациентское сообщение имеет кнопку «Ответить»", async () => {
    await renderStateC();
    // The patient message has "Ответить" link-button
    const replyBtns = screen.getAllByRole("button", { name: /^Ответить$/i });
    expect(replyBtns.length).toBeGreaterThanOrEqual(1);
  });

  it("клик «Ответить» показывает форму с textarea", async () => {
    await renderStateC();
    // "Ответить" link-button on patient message
    const replyBtns = screen.getAllByRole("button", { name: /^Ответить$/i });
    await userEvent.click(replyBtns[0]!);
    expect(screen.getByRole("textbox", { name: /текст ответа/i })).toBeInTheDocument();
  });

  it("отправляет POST на program-note-reply и показывает «Ответ отправлен»", async () => {
    await renderStateC();
    const replyBtns = screen.getAllByRole("button", { name: /^Ответить$/i });
    await userEvent.click(replyBtns[0]!);
    await userEvent.type(screen.getByRole("textbox", { name: /текст ответа/i }), "Всё нормально");
    // Now there's a send button inside the form
    const sendBtns = screen.getAllByRole("button", { name: /^Ответить$/i });
    await userEvent.click(sendBtns[sendBtns.length - 1]!);

    await waitFor(() => {
      expect(screen.getByText(/Ответ отправлен/i)).toBeInTheDocument();
    });
  });

  it("кнопка «Ответить» в форме заблокирована при пустом тексте", async () => {
    await renderStateC();
    const replyBtns = screen.getAllByRole("button", { name: /^Ответить$/i });
    await userEvent.click(replyBtns[0]!);
    // After opening form, the send button is disabled (empty text)
    const sendBtns = screen.getAllByRole("button", { name: /^Ответить$/i });
    const sendBtn = sendBtns[sendBtns.length - 1]!;
    expect(sendBtn).toBeDisabled();
  });
});

// ── CommentsTab SSR mapping ──────────────────────────────────────────────────
// (covered in CommentsTab.test.tsx — here we test DoctorCommentsTab directly)

describe("DoctorCommentsTab — пустые начальные данные", () => {
  it("рендерится без краша при пустых данных", () => {
    render(
      <DoctorCommentsTab
        initialItems={[]}
        initialCursor={null}
        hasMoreInitial={false}
        initialPatients={[]}
      />,
    );
    expect(screen.getByText(/нет пациентов/i)).toBeInTheDocument();
  });
});

// ── State C: micro-chart (B.3) ────────────────────────────────────────────────

describe("DoctorCommentsTab — микро-график метрик в шапке C (B.3)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("вызывает /api/doctor/comments/exercise-metrics при открытии треда", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/exercises")) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: EXERCISES_RESULT }) });
      }
      if (url.includes("exercise-metrics")) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, points: [] }) });
      }
      return Promise.resolve({ ok: true, json: async () => THREAD_RESPONSE });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<DoctorCommentsTab {...defaultProps()} />);
    await clickPatientInLeftPane(/Иванов Иван/i);
    await waitFor(() => screen.getByText("Приседания"));
    await userEvent.click(screen.getByRole("button", { name: /Приседания/i }));
    await waitFor(() => screen.getByText(/Болит колено/i));

    const metricsCalls = fetchMock.mock.calls.filter((args: unknown[]) => {
      const url = args[0];
      return typeof url === "string" && url.includes("exercise-metrics");
    });
    expect(metricsCalls.length).toBeGreaterThanOrEqual(1);
    const metricsUrl = metricsCalls[0]![0] as string;
    expect(metricsUrl).toContain(`instanceId=${INST}`);
    expect(metricsUrl).toContain(`stageItemId=${ITEM1}`);
  });

  it("показывает «нет данных» когда сервер вернул пустой массив точек", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/exercises")) {
          return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: EXERCISES_RESULT }) });
        }
        if (url.includes("exercise-metrics")) {
          return Promise.resolve({ ok: true, json: async () => ({ ok: true, points: [] }) });
        }
        return Promise.resolve({ ok: true, json: async () => THREAD_RESPONSE });
      }),
    );

    render(<DoctorCommentsTab {...defaultProps()} />);
    await clickPatientInLeftPane(/Иванов Иван/i);
    await waitFor(() => screen.getByText("Приседания"));
    await userEvent.click(screen.getByRole("button", { name: /Приседания/i }));
    await waitFor(() => screen.getByText(/Болит колено/i));

    await waitFor(() => {
      expect(screen.getByText(/нет данных за последние 7 дней/i)).toBeInTheDocument();
    });
  });

  it("показывает полоски reps когда точки содержат повторения", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/exercises")) {
          return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: EXERCISES_RESULT }) });
        }
        if (url.includes("exercise-metrics")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              ok: true,
              points: [
                { at: "2026-06-10T10:00:00.000Z", reps: 10, weightKg: null, sets: null, difficulty: null },
              ],
            }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => THREAD_RESPONSE });
      }),
    );

    render(<DoctorCommentsTab {...defaultProps()} />);
    await clickPatientInLeftPane(/Иванов Иван/i);
    await waitFor(() => screen.getByText("Приседания"));
    await userEvent.click(screen.getByRole("button", { name: /Приседания/i }));
    await waitFor(() => screen.getByText(/Болит колено/i));

    await waitFor(() => {
      expect(screen.getByText("повт.")).toBeInTheDocument();
    });
  });
});
