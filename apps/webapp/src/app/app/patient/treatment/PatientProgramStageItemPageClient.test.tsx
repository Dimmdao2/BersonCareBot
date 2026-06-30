/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import { PatientProgramStageItemPageClient } from "./PatientProgramStageItemPageClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/shared/ui/patient/material-rating/MaterialRatingBlock", () => ({
  MaterialRatingBlock: () => null,
}));

vi.mock("@/app/app/patient/treatment/PatientStageCompositionList", () => ({
  PatientStageCompositionList: () => null,
}));

const now = "2026-01-01T00:00:00.000Z";
const instanceId = "11111111-1111-4111-8111-111111111111";
const itemId = "33333333-3333-4333-8333-333333333333";

function makeDetail(
  over: Partial<Pick<TreatmentProgramInstanceDetail, "assignmentSource">> = {},
): TreatmentProgramInstanceDetail {
  return {
    id: instanceId,
    patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    templateId: null,
    assignedBy: null,
    assignmentSource: "doctor",
    ...over,
    title: "Программа",
    status: "active",
    createdAt: now,
    updatedAt: now,
    patientPlanLastOpenedAt: null,
    stages: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        instanceId,
        sourceStageId: null,
        title: "Этап 1",
        description: null,
        sortOrder: 1,
        localComment: null,
        skipReason: null,
        status: "in_progress",
        startedAt: now,
        goals: null,
        objectives: null,
        expectedDurationDays: null,
        expectedDurationText: null,
        groups: [],
        items: [
          {
            id: itemId,
            stageId: "22222222-2222-4222-8222-222222222222",
            itemType: "exercise",
            itemRefId: "44444444-4444-4444-8444-444444444444",
            sortOrder: 0,
            comment: null,
            localComment: null,
            settings: { reps: 8, sets: 2 },
            snapshot: { title: "Подъем руки", media: [] },
            completedAt: null,
            isActionable: true,
            status: "active",
            groupId: null,
            createdAt: now,
            lastViewedAt: now,
            effectiveComment: "Держите спину ровно",
          },
        ],
      },
    ],
  };
}

describe("PatientProgramStageItemPageClient", () => {
  beforeEach(() => {
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("shows instruction label and discussion CTA variants with feature-gated discussion UI", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/checklist-today")) {
        return new Response(
          JSON.stringify({
            ok: true,
            doneItemIds: [],
            doneTodayCountByItemId: {},
            lastDoneAtIsoByItemId: {},
            doneTodayCountByActivityKey: {},
            lastDoneAtIsoByActivityKey: {},
          }),
          { status: 200 },
        );
      }
      if (url.includes("/discussion")) {
        return new Response(
          JSON.stringify({
            ok: true,
            messages: [],
            pageInfo: { direction: "backward", limit: 1, nextCursor: null, hasMore: false },
            totalCount: 0,
            unreadCount: 0,
            lastMessage: null,
            lastDoneSummary: null,
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/progress/complete/metrics")) {
        return new Response(
          JSON.stringify({
            ok: true,
            metrics: { perceivedDifficulty: "hard", reps: 12, sets: 3, weightKg: 2.5 },
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/progress/complete")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.endsWith(`/api/patient/treatment-program-instances/${instanceId}`)) {
        return new Response(JSON.stringify({ ok: true, item: makeDetail() }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <PatientProgramStageItemPageClient
        instanceId={instanceId}
        itemId={itemId}
        navMode="exec"
        backHref="/app/patient/treatment"
        initialDetail={makeDetail()}
        appDisplayTimeZone="Europe/Moscow"
        itemLinksPlanTab="program"
        planItemDoneRepeatCooldownMinutes={60}
        programCommentsInteraction={{ visible: true, enabled: true }}
        programMediaInteraction={{ visible: false, enabled: false }}
      />,
    );

    expect(await screen.findByText("Инструкция от специалиста")).toBeInTheDocument();
    expect(screen.queryByText("Комментарий специалиста")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Камера" })).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Комментарии/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Записать/i })).not.toBeInTheDocument();

    const completeButton = screen.getByRole("button", { name: /Отметить выполнение/i });
    fireEvent.click(completeButton);
    await waitFor(() => {
      expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith("/progress/complete"))).toBe(true);
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByDisplayValue("12")).toBeInTheDocument();
    expect(screen.getByDisplayValue("3")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2.5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Записать/i }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Записать/i })).not.toBeInTheDocument();
    });
  });

  it("shows comments and complete actions in the exercise action row, with video upload hint below instruction", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/checklist-today")) {
        return new Response(
          JSON.stringify({
            ok: true,
            doneItemIds: [],
            doneTodayCountByItemId: {},
            lastDoneAtIsoByItemId: {},
            doneTodayCountByActivityKey: {},
            lastDoneAtIsoByActivityKey: {},
          }),
          { status: 200 },
        );
      }
      if (url.includes("/discussion")) {
        return new Response(
          JSON.stringify({
            ok: true,
            messages: [],
            pageInfo: { direction: "backward", limit: 1, nextCursor: null, hasMore: false },
            totalCount: 0,
            unreadCount: 0,
            lastMessage: null,
            lastDoneSummary: null,
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/progress/complete/metrics")) {
        return new Response(JSON.stringify({ ok: true, metrics: null }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <PatientProgramStageItemPageClient
        instanceId={instanceId}
        itemId={itemId}
        navMode="exec"
        backHref="/app/patient/treatment"
        initialDetail={makeDetail()}
        appDisplayTimeZone="Europe/Moscow"
        itemLinksPlanTab="program"
        planItemDoneRepeatCooldownMinutes={60}
        programCommentsInteraction={{ visible: true, enabled: true }}
        programMediaInteraction={{ visible: true, enabled: true }}
      />,
    );

    const commentsButton = await screen.findByRole("button", { name: /Комментарии/i });
    const completeButton = screen.getByRole("button", { name: /Отметить выполнение/i });
    expect(commentsButton.parentElement).toBe(completeButton.parentElement);
    expect(screen.queryByRole("button", { name: /Записать/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Прикрепить видео/i })).toBeInTheDocument();
    expect(screen.getByText(/Если у вас есть вопросы по технике выполнения/i)).toBeInTheDocument();
  });

  it("shows unread count on discussion preview block", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/checklist-today")) {
        return new Response(
          JSON.stringify({
            ok: true,
            doneItemIds: [],
            doneTodayCountByItemId: {},
            lastDoneAtIsoByItemId: {},
            doneTodayCountByActivityKey: {},
            lastDoneAtIsoByActivityKey: {},
          }),
          { status: 200 },
        );
      }
      if (url.includes("/discussion")) {
        return new Response(
          JSON.stringify({
            ok: true,
            messages: [],
            pageInfo: { direction: "backward", limit: 1, nextCursor: null, hasMore: false },
            totalCount: 2,
            unreadCount: 3,
            lastMessage: {
              id: "msg-1",
              instanceStageItemId: itemId,
              patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              senderRole: "admin",
              origin: "support_admin_reply",
              body: "Ответ специалиста",
              mediaFileId: null,
              supportMessageId: null,
              createdAt: now,
            },
            lastDoneSummary: null,
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <PatientProgramStageItemPageClient
        instanceId={instanceId}
        itemId={itemId}
        navMode="exec"
        backHref="/app/patient/treatment"
        initialDetail={makeDetail()}
        appDisplayTimeZone="Europe/Moscow"
        itemLinksPlanTab="program"
        planItemDoneRepeatCooldownMinutes={60}
        programCommentsInteraction={{ visible: true, enabled: true }}
        programMediaInteraction={{ visible: false, enabled: false }}
      />,
    );

    const commentsButton = await screen.findByRole("button", { name: /Комментарии/i });
    expect(within(commentsButton).getByText("2")).toBeInTheDocument();
    expect(within(commentsButton).getByLabelText("Есть новые комментарии")).toBeInTheDocument();
  });

  it("opens discussion dialog from comments CTA and marks it read", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/checklist-today")) {
        return new Response(
          JSON.stringify({
            ok: true,
            doneItemIds: [],
            doneTodayCountByItemId: {},
            lastDoneAtIsoByItemId: {},
            doneTodayCountByActivityKey: {},
            lastDoneAtIsoByActivityKey: {},
          }),
          { status: 200 },
        );
      }
      if (url.includes("/discussion/read")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.includes("/discussion")) {
        return new Response(
          JSON.stringify({
            ok: true,
            messages: [],
            pageInfo: { direction: "backward", limit: 1, nextCursor: null, hasMore: false },
            totalCount: 0,
            unreadCount: 0,
            lastMessage: null,
            lastDoneSummary: null,
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <PatientProgramStageItemPageClient
        instanceId={instanceId}
        itemId={itemId}
        navMode="exec"
        backHref="/app/patient/treatment"
        initialDetail={makeDetail()}
        appDisplayTimeZone="Europe/Moscow"
        itemLinksPlanTab="program"
        planItemDoneRepeatCooldownMinutes={60}
        programCommentsInteraction={{ visible: true, enabled: true }}
        programMediaInteraction={{ visible: false, enabled: false }}
      />,
    );

    const cta = await screen.findByRole("button", { name: /Комментарии/i });
    fireEvent.click(cta);
    expect(await screen.findByRole("heading", { name: "Комментарии" })).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/discussion/read"))).toBe(true);
    });
  });

  it("disables discussion CTA when visible but policy denies", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/checklist-today")) {
        return new Response(
          JSON.stringify({
            ok: true,
            doneItemIds: [],
            doneTodayCountByItemId: {},
            lastDoneAtIsoByItemId: {},
            doneTodayCountByActivityKey: {},
            lastDoneAtIsoByActivityKey: {},
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <PatientProgramStageItemPageClient
        instanceId={instanceId}
        itemId={itemId}
        navMode="exec"
        backHref="/app/patient/treatment"
        initialDetail={makeDetail()}
        appDisplayTimeZone="Europe/Moscow"
        itemLinksPlanTab="program"
        planItemDoneRepeatCooldownMinutes={60}
        programCommentsInteraction={{ visible: true, enabled: false }}
        programMediaInteraction={{ visible: false, enabled: false }}
      />,
    );

    const cta = await screen.findByRole("button", { name: /Комментарии/i });
    expect(cta).toBeDisabled();
    expect(cta).toHaveAttribute("aria-disabled", "true");
  });

  it("hides discussion controls when comments interaction is not visible", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/checklist-today")) {
        return new Response(
          JSON.stringify({
            ok: true,
            doneItemIds: [],
            doneTodayCountByItemId: {},
            lastDoneAtIsoByItemId: {},
            doneTodayCountByActivityKey: {},
            lastDoneAtIsoByActivityKey: {},
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <PatientProgramStageItemPageClient
        instanceId={instanceId}
        itemId={itemId}
        navMode="exec"
        backHref="/app/patient/treatment"
        initialDetail={makeDetail()}
        appDisplayTimeZone="Europe/Moscow"
        itemLinksPlanTab="program"
        planItemDoneRepeatCooldownMinutes={60}
        programCommentsInteraction={{ visible: false, enabled: false }}
        programMediaInteraction={{ visible: false, enabled: false }}
      />,
    );

    expect(await screen.findByText("Инструкция от специалиста")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Камера" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Оставить комментарий к выполнению/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Открыть комментарии/i })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/discussion"))).toBe(false);
  });

  it.each(["promo", "course"] as const)(
    "hides discussion controls for %s programs when discussion flags are on (P1)",
    async (assignmentSource) => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/checklist-today")) {
          return new Response(
            JSON.stringify({
              ok: true,
              doneItemIds: [],
              doneTodayCountByItemId: {},
              lastDoneAtIsoByItemId: {},
              doneTodayCountByActivityKey: {},
              lastDoneAtIsoByActivityKey: {},
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ ok: false }), { status: 404 });
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      render(
        <PatientProgramStageItemPageClient
          instanceId={instanceId}
          itemId={itemId}
          navMode="exec"
          backHref="/app/patient/treatment"
          initialDetail={makeDetail({ assignmentSource })}
          appDisplayTimeZone="Europe/Moscow"
          itemLinksPlanTab="program"
          planItemDoneRepeatCooldownMinutes={60}
          programCommentsInteraction={{ visible: true, enabled: true }}
          programMediaInteraction={{ visible: true, enabled: true }}
        />,
      );

      expect(await screen.findByText("Инструкция от специалиста")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Камера" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Отметить выполнение/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Комментарии/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Прикрепить видео/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Оставить комментарий к выполнению/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Открыть комментарии/i })).not.toBeInTheDocument();
      expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/discussion"))).toBe(false);
    },
  );
});
