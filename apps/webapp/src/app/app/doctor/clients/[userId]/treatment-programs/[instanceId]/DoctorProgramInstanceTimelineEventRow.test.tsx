/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TreatmentProgramEventRow } from "@/modules/treatment-program/types";
import { DoctorProgramInstanceTimelineEventRow } from "./DoctorProgramInstanceTimelineEventRow";

const eventId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function programChangedEvent(): TreatmentProgramEventRow {
  return {
    id: eventId,
    instanceId: "11111111-1111-4111-8111-111111111111",
    actorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    eventType: "program_changed",
    targetType: "program",
    targetId: "11111111-1111-4111-8111-111111111111",
    payload: {
      scope: "editor_batch",
      diff: { stagesMetadataUpdated: 1, itemsAdded: 2, stagesReordered: true },
    },
    reason: null,
    createdAt: "2026-06-03T12:00:00.000Z",
  };
}

describe("DoctorProgramInstanceTimelineEventRow", () => {
  it("expands program_changed detail on click", async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();

    const { rerender } = render(
      <DoctorProgramInstanceTimelineEventRow
        event={programChangedEvent()}
        labels={{ itemTitle: () => undefined, stageTitle: () => undefined }}
        createdAtLabel="03.06.2026 15:00"
        whoLabel="Вы"
        expanded={false}
        onToggleExpand={onToggleExpand}
      />,
    );

    expect(screen.getByRole("button", { name: /программа изменена/i })).toBeInTheDocument();
    expect(screen.queryByText("Обновлено этапов: 1")).not.toBeInTheDocument();

    await user.click(screen.getByTestId(`doctor-program-timeline-event-${eventId}`));
    expect(onToggleExpand).toHaveBeenCalledTimes(1);

    rerender(
      <DoctorProgramInstanceTimelineEventRow
        event={programChangedEvent()}
        labels={{ itemTitle: () => undefined, stageTitle: () => undefined }}
        createdAtLabel="03.06.2026 15:00"
        whoLabel="Вы"
        expanded
        onToggleExpand={onToggleExpand}
      />,
    );

    expect(screen.getByTestId(`doctor-program-timeline-detail-${eventId}`)).toBeInTheDocument();
    expect(screen.getByText("Обновлено этапов: 1")).toBeInTheDocument();
    expect(screen.getByText("Добавлено элементов: 2")).toBeInTheDocument();
    expect(screen.getByText("Изменён порядок этапов")).toBeInTheDocument();
  });

  it("collapses expanded detail on second click", async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();

    const { rerender } = render(
      <DoctorProgramInstanceTimelineEventRow
        event={programChangedEvent()}
        labels={{ itemTitle: () => undefined, stageTitle: () => undefined }}
        createdAtLabel="03.06.2026 15:00"
        whoLabel="Вы"
        expanded
        onToggleExpand={onToggleExpand}
      />,
    );

    expect(screen.getByText("Обновлено этапов: 1")).toBeInTheDocument();
    await user.click(screen.getByTestId(`doctor-program-timeline-event-${eventId}`));
    expect(onToggleExpand).toHaveBeenCalledTimes(1);

    rerender(
      <DoctorProgramInstanceTimelineEventRow
        event={programChangedEvent()}
        labels={{ itemTitle: () => undefined, stageTitle: () => undefined }}
        createdAtLabel="03.06.2026 15:00"
        whoLabel="Вы"
        expanded={false}
        onToggleExpand={onToggleExpand}
      />,
    );

    expect(screen.queryByText("Обновлено этапов: 1")).not.toBeInTheDocument();
  });

  it("renders plain summary when program_changed has no diff detail", () => {
    render(
      <DoctorProgramInstanceTimelineEventRow
        event={{
          ...programChangedEvent(),
          payload: { scope: "editor_batch", diff: {} },
        }}
        labels={{ itemTitle: () => undefined, stageTitle: () => undefined }}
        createdAtLabel="03.06.2026 15:00"
        whoLabel={null}
        expanded={false}
        onToggleExpand={vi.fn()}
      />,
    );

    expect(screen.getByText("Программа изменена")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /программа изменена/i })).not.toBeInTheDocument();
  });
});
