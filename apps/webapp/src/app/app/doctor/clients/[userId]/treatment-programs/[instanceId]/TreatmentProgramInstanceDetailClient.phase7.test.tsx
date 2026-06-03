/** @vitest-environment jsdom */

import type { ComponentType, ReactNode } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  ProgramActionLogListRow,
  TreatmentProgramEventRow,
  TreatmentProgramInstanceDetail,
} from "@/modules/treatment-program/types";
import type { TreatmentProgramLibraryPickers } from "@/app/app/doctor/treatment-program-shared/treatmentProgramLibraryTypes";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("./DoctorProgramActionLogMediaPreview", () => ({
  DoctorProgramActionLogMediaPreview: () => null,
}));

vi.mock("./DoctorProgramItemDiscussionDialog", () => ({
  DoctorProgramItemDiscussionDialog: () => null,
}));

vi.mock("./DoctorProgramInstanceDiscussionDialog", () => ({
  DoctorProgramInstanceDiscussionDialog: () => null,
}));

vi.mock("@/app/app/doctor/treatment-program-shared/TreatmentProgramDndUi", () => ({
  TreatmentProgramPipelineStagesDnd: ({ children }: { children: ReactNode }) => (
    <div data-testid="pipeline-dnd">{children}</div>
  ),
  TreatmentProgramSortablePipelineStage: ({
    children,
    id,
  }: {
    children: (handle: ReactNode) => ReactNode;
    id: string;
  }) => <section data-stage-id={id}>{children(<span aria-hidden />)}</section>,
  TreatmentProgramStageItemsDnd: ({ children }: { children: ReactNode }) => (
    <div data-testid="items-dnd">{children}</div>
  ),
  TreatmentProgramSortableItemShell: ({
    children,
    id,
  }: {
    children: (handle: ReactNode) => ReactNode;
    id: string;
  }) => <li data-item-id={id}>{children(<span aria-hidden />)}</li>,
}));

vi.mock("react-hot-toast", () => {
  const toastFn = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  });
  return { default: toastFn };
});

vi.mock("@/app/app/doctor/treatment-program-shared/flushInstanceEditorDraft", () => ({
  flushInstanceEditorDraft: vi.fn(async () => ({ ok: true as const })),
}));

const INSTANCE_ID = "11111111-1111-4111-8111-111111111111";
const STAGE_ZERO = "00000000-0000-4000-8000-000000000001";
const STAGE_ONE = "00000000-0000-4000-8000-000000000002";
const STAGE_TWO = "00000000-0000-4000-8000-000000000003";
const EVENT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const emptyLibrary: TreatmentProgramLibraryPickers = {
  exercises: [],
  lfkComplexes: [],
  testSets: [],
  clinicalTests: [],
  recommendations: [],
  lessons: [],
};

function stageZeroRow(): TreatmentProgramInstanceDetail["stages"][number] {
  return {
    id: STAGE_ZERO,
    instanceId: INSTANCE_ID,
    sourceStageId: null,
    title: "Общие рекомендации",
    description: null,
    sortOrder: 0,
    status: "available",
    skipReason: null,
    localComment: null,
    startedAt: null,
    goals: null,
    objectives: null,
    expectedDurationDays: null,
    expectedDurationText: null,
    groups: [],
    items: [],
  };
}

function pipelineStage(
  id: string,
  sortOrder: number,
  title: string,
  status: TreatmentProgramInstanceDetail["stages"][number]["status"],
): TreatmentProgramInstanceDetail["stages"][number] {
  return {
    id,
    instanceId: INSTANCE_ID,
    sourceStageId: null,
    title,
    description: null,
    sortOrder,
    status,
    skipReason: null,
    localComment: null,
    startedAt: null,
    goals: null,
    objectives: null,
    expectedDurationDays: null,
    expectedDurationText: null,
    groups: [],
    items: [],
  };
}

function instanceWithPipeline(): TreatmentProgramInstanceDetail {
  return {
    id: INSTANCE_ID,
    patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    templateId: null,
    title: "План реабилитации",
    status: "active",
    assignmentSource: "doctor",
    assignedBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    patientPlanLastOpenedAt: null,
    stages: [
      stageZeroRow(),
      pipelineStage(STAGE_ONE, 1, "Этап 1", "available"),
      pipelineStage(STAGE_TWO, 2, "Этап 2", "in_progress"),
    ],
  };
}

function programChangedEvent(): TreatmentProgramEventRow {
  return {
    id: EVENT_ID,
    instanceId: INSTANCE_ID,
    actorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    eventType: "program_changed",
    targetType: "program",
    targetId: INSTANCE_ID,
    payload: {
      scope: "editor_batch",
      diff: { stagesMetadataUpdated: 1, itemsAdded: 1 },
    },
    reason: null,
    createdAt: "2026-06-03T12:00:00.000Z",
  };
}

let TreatmentProgramInstanceDetailClient: ComponentType<{
  patientProfileHref: string;
  patientDisplayName: string;
  initial: TreatmentProgramInstanceDetail;
  initialTestResults: [];
  initialAttemptAcceptMap: Record<string, boolean>;
  initialEvents: TreatmentProgramEventRow[];
  initialActionLog: ProgramActionLogListRow[];
  currentUserId: string;
  appDisplayTimeZone: string;
  treatmentProgramLibrary: TreatmentProgramLibraryPickers;
  doctorReplyFromLogEnabled: boolean;
}>;

describe("TreatmentProgramInstanceDetailClient phase 7 history and unsaved gate", () => {
  const fetchMock = vi.fn();

  beforeAll(async () => {
    ({ TreatmentProgramInstanceDetailClient } = await import("./TreatmentProgramInstanceDetailClient"));
  }, 25_000);

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as typeof fetch;
  });

  function renderClient(options?: {
    initial?: TreatmentProgramInstanceDetail;
    initialEvents?: TreatmentProgramEventRow[];
  }) {
    return render(
      <TreatmentProgramInstanceDetailClient
        patientProfileHref="/app/doctor/clients/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        patientDisplayName="Иван Т."
        initial={options?.initial ?? instanceWithPipeline()}
        initialTestResults={[]}
        initialAttemptAcceptMap={{}}
        initialEvents={options?.initialEvents ?? []}
        initialActionLog={[]}
        currentUserId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
        appDisplayTimeZone="Europe/Moscow"
        treatmentProgramLibrary={emptyLibrary}
        doctorReplyFromLogEnabled={false}
      />,
    );
  }

  async function markMetadataDirty(user: ReturnType<typeof userEvent.setup>) {
    const stageSection = screen.getByTestId(`instance-editor-pipeline-stage-${STAGE_TWO}`);
    await user.click(within(stageSection).getByRole("button", { name: /^изменить$/i }));
    const titleInput = await screen.findByLabelText(/^название$/i);
    await user.clear(titleInput);
    await user.type(titleInput, "Этап 2 переименован");
    await user.click(screen.getByRole("button", { name: /^применить$/i }));
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/несохранённые изменения/i);
    });
  }

  it("expands program_changed diff in timeline", async () => {
    const user = userEvent.setup();
    renderClient({ initialEvents: [programChangedEvent()] });

    const timeline = screen.getByRole("heading", { name: /история правок программы/i }).closest("section");
    expect(timeline).toBeTruthy();
    expect(within(timeline as HTMLElement).queryByText("Обновлено этапов: 1")).not.toBeInTheDocument();

    await user.click(within(timeline as HTMLElement).getByTestId(`doctor-program-timeline-event-${EVENT_ID}`));

    expect(within(timeline as HTMLElement).getByText("Обновлено этапов: 1")).toBeInTheDocument();
    expect(within(timeline as HTMLElement).getByText("Добавлено элементов: 1")).toBeInTheDocument();
  });

  it("blocks complete program when metadata draft is dirty", async () => {
    const user = userEvent.setup();
    renderClient();

    await markMetadataDirty(user);
    await user.click(screen.getByRole("button", { name: /завершить программу лечения/i }));

    expect(
      screen.getByText(/для изменения статуса этапа \(программы\) необходимо сохранить изменения/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /завершить программу лечения\?/i })).not.toBeInTheDocument();
  });

  it("allows complete program when only structural draft is dirty", async () => {
    const user = userEvent.setup();
    renderClient();

    await user.click(within(screen.getByTestId("instance-editor-toolbar")).getByTestId("instance-editor-add-stage"));
    const titleInput = await screen.findByLabelText(/название/i);
    await user.type(titleInput, "Черновой этап");
    await user.click(screen.getByRole("button", { name: /^добавить$/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/несохранённые изменения/i);
    });

    await user.click(screen.getByRole("button", { name: /завершить программу лечения/i }));

    expect(await screen.findByRole("heading", { name: /завершить программу лечения\?/i })).toBeInTheDocument();
    expect(
      screen.queryByText(/для изменения статуса этапа \(программы\) необходимо сохранить изменения/i),
    ).not.toBeInTheDocument();
  });

  it("blocks stage status change when metadata draft is dirty", async () => {
    const user = userEvent.setup();
    renderClient();

    await markMetadataDirty(user);

    const stageSection = screen.getByTestId(`instance-editor-pipeline-stage-${STAGE_ONE}`);
    await user.click(within(stageSection).getByRole("button", { name: /этап 1/i }));
    await user.click(within(stageSection).getByRole("button", { name: /старт этапа/i }));

    expect(
      screen.getByText(/для изменения статуса этапа \(программы\) необходимо сохранить изменения/i),
    ).toBeInTheDocument();
  });

  it("collapses program_changed diff on second timeline click", async () => {
    const user = userEvent.setup();
    renderClient({ initialEvents: [programChangedEvent()] });

    const timeline = screen.getByRole("heading", { name: /история правок программы/i }).closest("section");
    expect(timeline).toBeTruthy();
    const eventButton = within(timeline as HTMLElement).getByTestId(`doctor-program-timeline-event-${EVENT_ID}`);

    await user.click(eventButton);
    expect(within(timeline as HTMLElement).getByText("Обновлено этапов: 1")).toBeInTheDocument();

    await user.click(eventButton);
    expect(within(timeline as HTMLElement).queryByText("Обновлено этапов: 1")).not.toBeInTheDocument();
  });
});
