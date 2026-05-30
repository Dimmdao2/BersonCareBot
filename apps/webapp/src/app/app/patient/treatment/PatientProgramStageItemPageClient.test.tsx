/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import { PatientProgramStageItemPageClient } from "./PatientProgramStageItemPageClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/shared/ui/material-rating/MaterialRatingBlock", () => ({
  MaterialRatingBlock: () => null,
}));

vi.mock("@/app/app/patient/treatment/PatientStageCompositionList", () => ({
  PatientStageCompositionList: () => null,
}));

const now = "2026-01-01T00:00:00.000Z";
const instanceId = "11111111-1111-4111-8111-111111111111";
const itemId = "33333333-3333-4333-8333-333333333333";

function makeDetail(): TreatmentProgramInstanceDetail {
  return {
    id: instanceId,
    patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    templateId: null,
    assignedBy: null,
    assignmentSource: "doctor",
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
        patientProgramDiscussionUiEnabled
      />,
    );

    expect(await screen.findByText("Инструкция от специалиста")).toBeInTheDocument();
    expect(screen.queryByText("Комментарий специалиста")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Камера" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Оставить комментарий к выполнению/i })).toBeInTheDocument();

    const completeButton = screen.getByRole("button", { name: /Отметить выполнение/i });
    fireEvent.click(completeButton);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Отметить выполнение")).toBeInTheDocument();
  });

  it("hides discussion controls when patientProgramDiscussionUiEnabled is false", async () => {
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
        patientProgramDiscussionUiEnabled={false}
      />,
    );

    expect(await screen.findByText("Инструкция от специалиста")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Камера" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Оставить комментарий к выполнению/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Открыть комментарии/i })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/discussion"))).toBe(false);
  });
});
