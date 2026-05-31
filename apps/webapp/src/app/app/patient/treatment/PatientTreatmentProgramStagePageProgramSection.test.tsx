/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PatientTreatmentProgramStagePageProgramSection } from "./PatientTreatmentProgramStagePageProgramSection";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";

const now = "2026-06-01T00:00:00.000Z";
const itemId = "aaaaaaaa-1111-4111-8111-111111111111";
const stageId = "33333333-3333-4333-8333-333333333333";

function makeStage(): TreatmentProgramInstanceDetail["stages"][number] {
  return {
    id: stageId,
    instanceId: "11111111-1111-4111-8111-111111111111",
    sourceStageId: null,
    title: "Этап 1",
    description: null,
    sortOrder: 1,
    localComment: null,
    skipReason: null,
    status: "completed",
    startedAt: now,
    goals: null,
    objectives: null,
    expectedDurationDays: null,
    expectedDurationText: null,
    groups: [],
    items: [
      {
        id: itemId,
        stageId,
        itemType: "exercise",
        itemRefId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        sortOrder: 0,
        comment: null,
        localComment: null,
        settings: null,
        snapshot: { title: "Упражнение", media: [] },
        completedAt: now,
        isActionable: true,
        status: "active",
        groupId: null,
        createdAt: now,
        lastViewedAt: now,
        effectiveComment: null,
      },
    ],
  };
}

describe("PatientTreatmentProgramStagePageProgramSection readOnly", () => {
  it("does not render comment, complete, or camera actions on archive tile", () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, summaryByItemId: {} }))) as typeof fetch;

    render(
      <PatientTreatmentProgramStagePageProgramSection
        instanceId="11111111-1111-4111-8111-111111111111"
        stage={makeStage()}
        base="/api/patient/treatment-program-instances/11111111-1111-4111-8111-111111111111/items"
        busy={null}
        setBusy={() => {}}
        setError={() => {}}
        refresh={async () => {}}
        contentBlocked={false}
        itemInteraction="readOnly"
        doneItemIds={[]}
        onDoneItemIds={() => {}}
        lastDoneAtIsoByItemId={{}}
        doneTodayCountByItemId={{}}
        appDisplayTimeZone="Europe/Moscow"
        planItemDoneRepeatCooldownMinutes={60}
        allowPatientObservationComment
        mediaSubmissionEnabled
      />,
    );

    const section = screen.getByRole("heading", { name: "Программа этапа" }).closest("section")!;
    expect(within(section).queryByRole("button", { name: /Комментарии/i })).not.toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: /Отметить выполнение/i })).not.toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: "Камера" })).not.toBeInTheDocument();
  });
});
