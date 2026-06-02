/** @vitest-environment jsdom */

import type React from "react";
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

function renderProgramSection(
  overrides: Partial<React.ComponentProps<typeof PatientTreatmentProgramStagePageProgramSection>> = {},
) {
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, summaryByItemId: {} }))) as typeof fetch;

  return render(
    <PatientTreatmentProgramStagePageProgramSection
      instanceId="11111111-1111-4111-8111-111111111111"
      stage={makeStage()}
      base="/api/patient/treatment-program-instances/11111111-1111-4111-8111-111111111111/items"
      busy={null}
      setBusy={() => {}}
      setError={() => {}}
      refresh={async () => {}}
      contentBlocked={false}
      itemInteraction="full"
      doneItemIds={[]}
      onDoneItemIds={() => {}}
      lastDoneAtIsoByItemId={{}}
      doneTodayCountByItemId={{}}
      appDisplayTimeZone="Europe/Moscow"
      planItemDoneRepeatCooldownMinutes={60}
      programCommentsInteraction={{ visible: true, enabled: true }}
      programMediaInteraction={{ visible: false, enabled: false }}
      {...overrides}
    />,
  );
}

describe("PatientTreatmentProgramStagePageProgramSection readOnly", () => {
  it("does not render comment, complete, or camera actions on archive tile", () => {
    renderProgramSection({ itemInteraction: "readOnly" });

    const section = screen.getByRole("heading", { name: "Программа этапа" }).closest("section")!;
    expect(within(section).queryByRole("button", { name: /Комментарии/i })).not.toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: /Отметить выполнение/i })).not.toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: "Камера" })).not.toBeInTheDocument();
  });
});

describe("PatientTreatmentProgramStagePageProgramSection tile footer", () => {
  it("disables comment button when visible but support policy denies", () => {
    const stage = makeStage();
    stage.items[0] = { ...stage.items[0]!, completedAt: null };

    renderProgramSection({
      stage,
      programCommentsInteraction: { visible: true, enabled: false },
    });

    const section = screen.getByRole("heading", { name: "Программа этапа" }).closest("section")!;
    const commentBtn = within(section).getByRole("button", { name: /Комментарии/i });
    expect(commentBtn).toBeDisabled();
    expect(commentBtn).toHaveAttribute("aria-disabled", "true");
  });

  it("renders both comment and complete buttons when observation comments are allowed", () => {
    const stage = makeStage();
    stage.items[0] = { ...stage.items[0]!, completedAt: null };

    renderProgramSection({ stage });

    const section = screen.getByRole("heading", { name: "Программа этапа" }).closest("section")!;
    expect(within(section).getByRole("button", { name: /Комментарии/i })).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: /Отметить выполнение/i })).toBeInTheDocument();
  });
});
