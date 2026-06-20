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
  thumb: {
    url: "/api/media/sq",
    mediaType: "video",
    previewSmUrl: null,
    previewMdUrl: null,
    previewStatus: "pending",
    sortOrder: 0,
  },
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

// ── Default fetch mock for all-mode ─────────────────────────────────────────
// The component now defaults to "all" mode and immediately calls fetchAllMode().
// Tests need a global fetch mock that satisfies both:
//   GET /api/doctor/comments/patients?mode=all → { ok: true, patients: [PAT_A, PAT_B] }
//   GET /api/doctor/exercise-comments?mode=all  → { ok: true, items: [FEED_A, FEED_B], hasMore: false, nextCursor: null }
// Synchronous or waitFor-less tests use this default; individual tests override as needed.
function stubFetchAllMode(overridePatientsData?: CommentPatientRow[]) {
  return vi.fn().mockImplementation((url: string) => {
    const s = typeof url === "string" ? url : "";
    if (s.includes("/api/doctor/comments/patients")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, patients: overridePatientsData ?? [PAT_A, PAT_B] }),
      } as unknown as Response);
    }
    if (s.includes("/api/doctor/exercise-comments")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, items: [FEED_A, FEED_B], hasMore: false, nextCursor: null }),
      } as unknown as Response);
    }
    // fallback for other endpoints (exercises, thread, mark-read, metrics, day-activity)
    return Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as unknown as Response);
  });
}

describe("DoctorCommentsTab — состояние A (лента)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("показывает пациентов в левой панели (all-mode)", async () => {
    vi.stubGlobal("fetch", stubFetchAllMode());
    render(<DoctorCommentsTab {...defaultProps()} />);
    // Wait for allModePatients to load
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /Иванов Иван/i }).length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getAllByRole("button", { name: /Петрова Мария/i }).length).toBeGreaterThanOrEqual(1);
  });

  it("показывает ленту комментариев в правой панели по умолчанию (all-mode)", async () => {
    vi.stubGlobal("fetch", stubFetchAllMode());
    render(<DoctorCommentsTab {...defaultProps()} />);
    // Wait for all-mode feed to load
    await waitFor(() => {
      const allIvanov = screen.getAllByText(/Иванов Иван/);
      expect(allIvanov.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("показывает empty-state в левой панели если нет пациентов (all-mode)", async () => {
    vi.stubGlobal("fetch", stubFetchAllMode([]));
    render(
      <DoctorCommentsTab {...defaultProps({ initialPatients: [] })} />,
    );
    await waitFor(() => {
      expect(screen.getByText(/нет пациентов с комментариями/i)).toBeInTheDocument();
    });
  });

  it("показывает бейдж «★ На сопровождении» с числом пациентов", async () => {
    vi.stubGlobal("fetch", stubFetchAllMode());
    render(<DoctorCommentsTab {...defaultProps()} />);
    // ★ На сопровождении теперь пассивный бейдж (span, не button), считает isOnSupport=true
    await waitFor(() => {
      // PAT_A and PAT_B both have isOnSupport: true → count = 2
      expect(screen.getByText(/★ На сопровождении · 2/i)).toBeInTheDocument();
    });
  });

  it("тоггл «Все» / «Непрочитанные» переключает viewMode", async () => {
    vi.stubGlobal("fetch", stubFetchAllMode());
    render(<DoctorCommentsTab {...defaultProps()} />);
    // Initial mode is "all" → «Все» button is aria-pressed=true
    const btnAll = screen.getByRole("button", { name: /^Все$/i });
    const btnUnread = screen.getByRole("button", { name: /Непрочитанные/i });
    expect(btnAll).toHaveAttribute("aria-pressed", "true");
    expect(btnUnread).toHaveAttribute("aria-pressed", "false");
    // Switch to unread
    await userEvent.click(btnUnread);
    expect(btnUnread).toHaveAttribute("aria-pressed", "true");
    expect(btnAll).toHaveAttribute("aria-pressed", "false");
  });

  it("показывает «Загрузить ещё» когда hasMoreInitial=true (в режиме unread)", async () => {
    // In unread mode, hasMoreInitial drives the "Загрузить ещё" button for the unread feed
    vi.stubGlobal("fetch", stubFetchAllMode());
    render(
      <DoctorCommentsTab
        {...defaultProps({ hasMoreInitial: true, initialCursor: CURSOR_1 })}
      />,
    );
    // Switch to unread to see the unread "Загрузить ещё" button
    await userEvent.click(screen.getByRole("button", { name: /Непрочитанные/i }));
    expect(screen.getByRole("button", { name: /загрузить ещё/i })).toBeInTheDocument();
  });

  it("скрывает «Загрузить ещё» когда hasMoreInitial=false (в режиме unread)", async () => {
    vi.stubGlobal("fetch", stubFetchAllMode());
    render(<DoctorCommentsTab {...defaultProps()} />);
    await userEvent.click(screen.getByRole("button", { name: /Непрочитанные/i }));
    expect(screen.queryByRole("button", { name: /загрузить ещё/i })).not.toBeInTheDocument();
  });

  it("«Загрузить ещё» вызывает /api/doctor/exercise-comments", async () => {
    const fetchMock = stubFetchAllMode();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DoctorCommentsTab
        {...defaultProps({ hasMoreInitial: true, initialCursor: CURSOR_1 })}
      />,
    );

    // In all-mode, "Загрузить ещё" uses loadMoreAll if allModeHasMore; switch to unread for simplicity
    await userEvent.click(screen.getByRole("button", { name: /Непрочитанные/i }));
    await userEvent.click(screen.getByRole("button", { name: /загрузить ещё/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const calls = fetchMock.mock.calls.map((args: unknown[]) => args[0] as string);
    expect(calls.some((url) => url.includes("/api/doctor/exercise-comments"))).toBe(true);
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

/** Stub fetch that handles patients?mode=all, exercise-comments, and drill-down APIs. */
function stubFetchMulti(exerciseResult = EXERCISES_RESULT) {
  return vi.fn().mockImplementation((url: string) => {
    const s = typeof url === "string" ? url : "";
    // Patient-specific sub-routes (exercises) BEFORE the top-level patients list
    if (s.includes("/api/doctor/comments/patients/") && s.includes("/exercises")) {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: exerciseResult }) } as unknown as Response);
    }
    if (s.includes("/api/doctor/comments/patients")) {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, patients: [PAT_A, PAT_B] }) } as unknown as Response);
    }
    if (s.includes("/api/doctor/exercise-comments")) {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, items: [FEED_A, FEED_B], hasMore: false, nextCursor: null }) } as unknown as Response);
    }
    // thread, mark-read, metrics, day-activity, etc.
    return Promise.resolve({ ok: true, json: async () => ({ ok: true, messages: [], pageInfo: { direction: "backward", limit: 50, nextCursor: null, hasMore: false }, totalCount: 0, peerLastReadAt: null }) } as unknown as Response);
  });
}

describe("DoctorCommentsTab — навигация A→B (выбор пациента)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("клик по пациенту переходит в state B (загружает упражнения)", async () => {
    vi.stubGlobal("fetch", stubFetchMulti());

    render(<DoctorCommentsTab {...defaultProps()} />);
    // Wait for all-mode patients to load, then click
    await waitFor(() => screen.getAllByRole("button", { name: /Иванов Иван/i }).length >= 1);
    await clickPatientInLeftPane(/Иванов Иван/i);

    // Header with patient name appears in right pane
    await waitFor(() => {
      const links = screen.getAllByRole("link");
      const patientLink = links.find((l) => l.textContent?.includes("Иванов Иван"));
      expect(patientLink).toBeDefined();
    });
  });

  it("после выбора пациента показывается кнопка × (сброс пациента)", async () => {
    vi.stubGlobal("fetch", stubFetchMulti());

    render(<DoctorCommentsTab {...defaultProps()} />);
    await waitFor(() => screen.getAllByRole("button", { name: /Иванов Иван/i }).length >= 1);
    await clickPatientInLeftPane(/Иванов Иван/i);

    // Wait for state B header
    await waitFor(() => {
      expect(screen.getByLabelText(/сбросить выбор пациента/i)).toBeInTheDocument();
    });
  });

  it("кнопка «×» в шапке сбрасывает выбор пациента (B→A)", async () => {
    vi.stubGlobal("fetch", stubFetchMulti());

    render(<DoctorCommentsTab {...defaultProps()} />);
    await waitFor(() => screen.getAllByRole("button", { name: /Иванов Иван/i }).length >= 1);
    await clickPatientInLeftPane(/Иванов Иван/i);

    await waitFor(() => {
      expect(screen.getByLabelText(/сбросить выбор пациента/i)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByLabelText(/сбросить выбор пациента/i));

    // Back to state A: ★ На сопровождении badge still shows
    await waitFor(() => {
      expect(screen.getByText(/★ На сопровождении/i)).toBeInTheDocument();
    });
  });
});

// ── State B: exercises ────────────────────────────────────────────────────────

describe("DoctorCommentsTab — состояние B (упражнения пациента)", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function renderStateB() {
    vi.stubGlobal("fetch", stubFetchMulti());
    render(<DoctorCommentsTab {...defaultProps()} />);
    // Wait for all-mode patients, then click
    await waitFor(() => screen.getAllByRole("button", { name: /Иванов Иван/i }).length >= 1);
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
        const s = typeof url === "string" ? url : "";
        // Patient-specific sub-routes (exercises) BEFORE the top-level patients list
        if (s.includes("/api/doctor/comments/patients/") && s.includes("/exercises")) {
          return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: EXERCISES_RESULT }) } as unknown as Response);
        }
        if (s.includes("/api/doctor/comments/patients")) {
          return Promise.resolve({ ok: true, json: async () => ({ ok: true, patients: [PAT_A, PAT_B] }) } as unknown as Response);
        }
        if (s.includes("/api/doctor/exercise-comments")) {
          return Promise.resolve({ ok: true, json: async () => ({ ok: true, items: [], hasMore: false, nextCursor: null }) } as unknown as Response);
        }
        if (s.includes("exercise-metrics")) {
          return Promise.resolve({ ok: true, json: async () => ({ ok: true, points: [] }) } as unknown as Response);
        }
        if (s.includes("program-day-activity")) {
          return Promise.resolve({ ok: true, json: async () => ({ ok: true, days: [] }) } as unknown as Response);
        }
        // discussion + mark-read
        return Promise.resolve({ ok: true, json: async () => THREAD_RESPONSE } as unknown as Response);
      }),
    );

    render(<DoctorCommentsTab {...defaultProps()} />);
    await waitFor(() => screen.getAllByRole("button", { name: /Иванов Иван/i }).length >= 1);
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
        const s = typeof url === "string" ? url : "";
        // Patient-specific sub-routes (exercises) BEFORE the top-level patients list
        if (s.includes("/api/doctor/comments/patients/") && s.includes("/exercises")) {
          return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: EXERCISES_RESULT }) } as unknown as Response);
        }
        if (s.includes("/api/doctor/comments/patients")) {
          return Promise.resolve({ ok: true, json: async () => ({ ok: true, patients: [PAT_A, PAT_B] }) } as unknown as Response);
        }
        if (s.includes("/api/doctor/exercise-comments")) {
          return Promise.resolve({ ok: true, json: async () => ({ ok: true, items: [], hasMore: false, nextCursor: null }) } as unknown as Response);
        }
        if (s.includes("exercise-metrics")) {
          return Promise.resolve({ ok: true, json: async () => ({ ok: true, points: [] }) } as unknown as Response);
        }
        if (s.includes("program-day-activity")) {
          return Promise.resolve({ ok: true, json: async () => ({ ok: true, days: [] }) } as unknown as Response);
        }
        if (s.includes("program-note-reply")) {
          return Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as unknown as Response);
        }
        return Promise.resolve({ ok: true, json: async () => THREAD_RESPONSE } as unknown as Response);
      }),
    );

    render(<DoctorCommentsTab {...defaultProps()} />);
    await waitFor(() => screen.getAllByRole("button", { name: /Иванов Иван/i }).length >= 1);
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
  afterEach(() => vi.unstubAllGlobals());

  it("рендерится без краша при пустых данных", async () => {
    vi.stubGlobal("fetch", stubFetchAllMode([]));
    render(
      <DoctorCommentsTab
        initialItems={[]}
        initialCursor={null}
        hasMoreInitial={false}
        initialPatients={[]}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/нет пациентов/i)).toBeInTheDocument();
    });
  });
});

// ── State C: micro-chart (B.3) ────────────────────────────────────────────────

/** Full multi-endpoint mock used by micro-chart and read-state tests (navigates to state C). */
function stubFetchForChart(opts?: {
  points?: object[];
  days?: object[];
  exerciseResult?: unknown;
}) {
  const points = opts?.points ?? [];
  const days = opts?.days ?? [];
  const exerciseResult = opts?.exerciseResult ?? EXERCISES_RESULT;

  return vi.fn().mockImplementation((url: string) => {
    const s = typeof url === "string" ? url : "";
    // Patient-specific sub-routes (exercises) BEFORE the top-level patients list
    if (s.includes("/api/doctor/comments/patients/") && s.includes("/exercises")) {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: exerciseResult }) } as unknown as Response);
    }
    if (s.includes("/api/doctor/comments/patients")) {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, patients: [PAT_A, PAT_B] }) } as unknown as Response);
    }
    if (s.includes("/api/doctor/exercise-comments")) {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, items: [FEED_A, FEED_B], hasMore: false, nextCursor: null }) } as unknown as Response);
    }
    if (s.includes("exercise-metrics")) {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, points }) } as unknown as Response);
    }
    if (s.includes("program-day-activity")) {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, days }) } as unknown as Response);
    }
    if (s.includes("program-note-reply")) {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as unknown as Response);
    }
    // thread, mark-read, discussion
    return Promise.resolve({ ok: true, json: async () => THREAD_RESPONSE } as unknown as Response);
  });
}

describe("DoctorCommentsTab — микро-график метрик в шапке C (B.3)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("вызывает /api/doctor/comments/exercise-metrics при открытии треда", async () => {
    const fetchMock = stubFetchForChart();
    vi.stubGlobal("fetch", fetchMock);

    render(<DoctorCommentsTab {...defaultProps()} />);
    // Wait for all-mode patients to load, then navigate to state C
    await waitFor(() => screen.getAllByRole("button", { name: /Иванов Иван/i }).length >= 1);
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
    vi.stubGlobal("fetch", stubFetchForChart({ points: [], days: [] }));

    render(<DoctorCommentsTab {...defaultProps()} />);
    await waitFor(() => screen.getAllByRole("button", { name: /Иванов Иван/i }).length >= 1);
    await clickPatientInLeftPane(/Иванов Иван/i);
    await waitFor(() => screen.getByText("Приседания"));
    await userEvent.click(screen.getByRole("button", { name: /Приседания/i }));
    await waitFor(() => screen.getByText(/Болит колено/i));

    await waitFor(() => {
      expect(screen.getByText(/нет данных за период/i)).toBeInTheDocument();
    });
  });

  it("показывает полоски reps когда точки содержат повторения", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetchForChart({
        points: [{ at: "2026-06-10T10:00:00.000Z", reps: 10, weightKg: null, sets: null, difficulty: null }],
        days: [],
      }),
    );

    render(<DoctorCommentsTab {...defaultProps()} />);
    await waitFor(() => screen.getAllByRole("button", { name: /Иванов Иван/i }).length >= 1);
    await clickPatientInLeftPane(/Иванов Иван/i);
    await waitFor(() => screen.getByText("Приседания"));
    await userEvent.click(screen.getByRole("button", { name: /Приседания/i }));
    await waitFor(() => screen.getByText(/Болит колено/i));

    await waitFor(() => {
      expect(screen.getByText("повт.×подх.")).toBeInTheDocument();
    });
  });
});

// ── Read-state (D3): read-on-view, ранжирование, сходимость бейджей ───────────

describe("DoctorCommentsTab — read-state (D3)", () => {
  afterEach(() => vi.unstubAllGlobals());

  const ITEM_READ = "00000000-0000-4000-8000-aaa000000003";

  const EX_UNREAD: ExerciseCommentItem = {
    ...EXERCISE_ITEM,
    stageItemId: ITEM1,
    title: "Приседания",
    totalComments: 3,
    unreadComments: 2,
  };
  const EX_READ: ExerciseCommentItem = {
    ...EXERCISE_ITEM,
    stageItemId: ITEM_READ,
    title: "Планка",
    totalComments: 4,
    unreadComments: 0,
    latestCommentAt: "2026-06-12T10:00:00.000Z", // новее, но прочитано → должно быть НИЖЕ
  };

  // Одна группа, упражнения в серверном порядке: сначала прочитанное (новее), потом непрочитанное.
  const EXERCISES_MIXED: PatientExercisesWithCommentsResult = {
    patientUserId: P1,
    instanceId: INST,
    instanceTitle: "Программа реабилитации",
    groups: [
      {
        stageId: STAGE1,
        stageTitle: "Этап 1",
        stageStatus: "in_progress",
        isActive: true,
        exercises: [EX_READ, EX_UNREAD],
      },
    ],
    totalExercisesWithComments: 2,
    totalUnreadComments: 2,
  };

  function stubMixedFetch() {
    return vi.fn().mockImplementation((url: string) => {
      const s = typeof url === "string" ? url : "";
      // Patient-specific sub-routes (exercises) BEFORE the top-level patients list
      if (s.includes("/api/doctor/comments/patients/") && s.includes("/exercises")) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: EXERCISES_MIXED }) } as unknown as Response);
      }
      if (s.includes("/api/doctor/comments/patients")) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, patients: [PAT_A, PAT_B] }) } as unknown as Response);
      }
      if (s.includes("/api/doctor/exercise-comments")) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, items: [FEED_A, FEED_B], hasMore: false, nextCursor: null }) } as unknown as Response);
      }
      if (s.includes("exercise-metrics")) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, points: [] }) } as unknown as Response);
      }
      if (s.includes("program-day-activity")) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, days: [] }) } as unknown as Response);
      }
      // discussion + mark-read
      return Promise.resolve({ ok: true, json: async () => THREAD_RESPONSE } as unknown as Response);
    });
  }

  it("ранжирование: непрочитанное упражнение стоит выше прочитанного (новее)", async () => {
    vi.stubGlobal("fetch", stubMixedFetch());
    render(<DoctorCommentsTab {...defaultProps()} />);
    // Wait for all-mode patients to load
    await waitFor(() => screen.getAllByRole("button", { name: /Иванов Иван/i }).length >= 1);
    await clickPatientInLeftPane(/Иванов Иван/i);
    await waitFor(() => expect(screen.getByText("Приседания")).toBeInTheDocument());

    const unreadRow = screen.getByText("Приседания").closest("button")!;
    const readRow = screen.getByText("Планка").closest("button")!;
    // Непрочитанное («Приседания») идёт раньше прочитанного («Планка») в DOM,
    // несмотря на то что у прочитанного latestCommentAt новее.
    expect(
      unreadRow.compareDocumentPosition(readRow) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("просмотр треда отправляет POST mark-read", async () => {
    const fetchMock = stubMixedFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<DoctorCommentsTab {...defaultProps()} />);
    await waitFor(() => screen.getAllByRole("button", { name: /Иванов Иван/i }).length >= 1);
    await clickPatientInLeftPane(/Иванов Иван/i);
    await waitFor(() => screen.getByText("Приседания"));
    await userEvent.click(screen.getByRole("button", { name: /Приседания/i }));
    await waitFor(() => screen.getByText(/Болит колено/i));

    await waitFor(() => {
      const readCalls = fetchMock.mock.calls.filter((args: unknown[]) => {
        const [url, opts] = args as [string, RequestInit | undefined];
        return url.includes("/discussion/read") && opts?.method === "POST";
      });
      expect(readCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("после просмотра треда бейдж непрочитанных у упражнения сходится (исчезает), при закрытии упражнение уезжает вниз", async () => {
    vi.stubGlobal("fetch", stubMixedFetch());
    render(<DoctorCommentsTab {...defaultProps()} />);
    await waitFor(() => screen.getAllByRole("button", { name: /Иванов Иван/i }).length >= 1);
    await clickPatientInLeftPane(/Иванов Иван/i);
    await waitFor(() => screen.getByText("Приседания"));

    // До просмотра — у «Приседания» бейдж непрочитанных (destructive-цвет) присутствует.
    const unreadRowBefore = screen.getByText("Приседания").closest("button")!;
    expect(unreadRowBefore.querySelector(".text-destructive")).not.toBeNull();
    expect(unreadRowBefore.querySelector(".text-destructive")!.textContent).toBe("2");

    await userEvent.click(screen.getByRole("button", { name: /Приседания/i }));
    await waitFor(() => screen.getByText(/Болит колено/i));

    // Закрываем тред — возвращаемся в state B.
    await userEvent.click(screen.getByRole("button", { name: /^Закрыть$/i }));
    await waitFor(() => screen.getByText("Этап 1"));

    // Бейдж непрочитанных у «Приседания» снят (destructive-бейджа больше нет).
    const unreadRowAfter = screen.getByText("Приседания").closest("button")!;
    expect(unreadRowAfter.querySelector(".text-destructive")).toBeNull();

    // Без живой перетасовки: «Приседания» остаётся видимым (не пропало),
    // порядок заморожен до повторного входа в пациента.
    expect(screen.getByText("Приседания")).toBeInTheDocument();
    expect(screen.getByText("Планка")).toBeInTheDocument();
  });

  it("после просмотра треда у пациента уменьшается счётчик непрочитанных (сходимость бейджа пациента)", async () => {
    // Пациент с unreadCount=2 (= число непрочитанных у одного упражнения).
    vi.stubGlobal("fetch", stubMixedFetch());
    render(<DoctorCommentsTab {...defaultProps({ initialPatients: [PAT_A] })} />);

    // В левой панели у пациента бейдж «1» (unreadCount по умолчанию из makePatient).
    await waitFor(() => screen.getAllByRole("button", { name: /Иванов Иван/i }));

    await clickPatientInLeftPane(/Иванов Иван/i);
    await waitFor(() => screen.getByText("Приседания"));
    await userEvent.click(screen.getByRole("button", { name: /Приседания/i }));
    await waitFor(() => screen.getByText(/Болит колено/i));
    await userEvent.click(screen.getByRole("button", { name: /^Закрыть$/i }));
    await waitFor(() => screen.getByText("Этап 1"));

    // totalUnreadComments у пациента в шапке state B обнулился: «N новых» больше не показываем.
    expect(screen.queryByText(/новых/i)).not.toBeInTheDocument();
  });

  it("в режиме «Непрочитанные» прочитанный пациент выпадает из списка при возврате в state A", async () => {
    // PAT_A имеет unreadCount=1; после прочтения единственного упражнения он
    // должен исчезнуть из левого списка в режиме «Непрочитанные», когда врач возвращается в state A.
    // В режиме «Все» (дефолт) пациент остаётся — тест переключается в «Непрочитанные».
    vi.stubGlobal("fetch", stubMixedFetch());
    render(<DoctorCommentsTab {...defaultProps({ initialPatients: [PAT_A] })} />);
    // Switch to unread mode first so patients come from initialPatients
    // (allModePatients starts null, so in unread mode we use the `patients` local copy)
    await waitFor(() => screen.getAllByRole("button", { name: /Иванов Иван/i }).length >= 1);
    await userEvent.click(screen.getByRole("button", { name: /Непрочитанные/i }));
    // Wait for patients list to show PAT_A in unread mode
    await waitFor(() => screen.getAllByRole("button", { name: /Иванов Иван/i }).length >= 1);
    await clickPatientInLeftPane(/Иванов Иван/i);
    await waitFor(() => screen.getByText("Приседания"));
    await userEvent.click(screen.getByRole("button", { name: /Приседания/i }));
    await waitFor(() => screen.getByText(/Болит колено/i));

    // Закрываем тред (state C → B), затем сбрасываем пациента (B → A).
    await userEvent.click(screen.getByRole("button", { name: /^Закрыть$/i }));
    await waitFor(() => screen.getByText("Этап 1"));
    await userEvent.click(screen.getByLabelText(/сбросить выбор пациента/i));

    // В режиме «Непрочитанные»: пациент с unreadCount=0 выпал из левого списка.
    await waitFor(() => {
      const leftButtons = screen
        .queryAllByRole("button", { name: /Иванов Иван/i })
        .filter((b) => b.hasAttribute("aria-pressed"));
      expect(leftButtons.length).toBe(0);
    });
  });
});
