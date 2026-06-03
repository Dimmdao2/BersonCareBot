/** @vitest-environment jsdom */

import type { ComponentType, ReactNode } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import type { TreatmentProgramLibraryPickers } from "@/app/app/doctor/treatment-program-shared/treatmentProgramLibraryTypes";
import { TEST_EDITOR_PATIENT_PROFILE_HREF } from "../../../doctorClientProfileHref.testFixtures";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("./DoctorProgramItemDiscussionDialog", () => ({
  DoctorProgramItemDiscussionDialog: () => null,
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

function instanceDetailWithPipelineStages(): TreatmentProgramInstanceDetail {
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
      pipelineStage(STAGE_TWO, 2, "Этап 2", "locked"),
    ],
  };
}

function instanceDetailWithInProgressStage(): TreatmentProgramInstanceDetail {
  return {
    ...instanceDetailWithPipelineStages(),
    stages: [
      stageZeroRow(),
      pipelineStage(STAGE_ONE, 1, "Этап 1", "available"),
      pipelineStage(STAGE_TWO, 2, "Этап 2", "in_progress"),
    ],
  };
}

function instanceDetailWithLockedPipelineOnly(): TreatmentProgramInstanceDetail {
  return {
    ...instanceDetailWithPipelineStages(),
    stages: [
      stageZeroRow(),
      pipelineStage(STAGE_ONE, 1, "Этап 1", "locked"),
      pipelineStage(STAGE_TWO, 2, "Этап 2", "locked"),
    ],
  };
}

function instanceDetailAllTerminalPipelineStages(): TreatmentProgramInstanceDetail {
  return {
    ...instanceDetailWithPipelineStages(),
    stages: [
      stageZeroRow(),
      pipelineStage(STAGE_ONE, 1, "Этап 1", "completed"),
      pipelineStage(STAGE_TWO, 2, "Этап 2", "skipped"),
    ],
  };
}

let TreatmentProgramInstanceDetailClient: ComponentType<{
  patientProfileHref: string;
  patientDisplayName: string;
  initial: TreatmentProgramInstanceDetail;
  initialTestResults: [];
  initialAttemptAcceptMap: Record<string, boolean>;
  initialEvents: [];
  initialActionLog: [];
  currentUserId: string;
  appDisplayTimeZone: string;
  treatmentProgramLibrary: TreatmentProgramLibraryPickers;
  doctorReplyFromLogEnabled: boolean;
}>;

describe("TreatmentProgramInstanceDetailClient phase 5 collapsible stages", () => {
  beforeAll(async () => {
    ({ TreatmentProgramInstanceDetailClient } = await import("./TreatmentProgramInstanceDetailClient"));
  }, 25_000);

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  function renderClient(initial: TreatmentProgramInstanceDetail) {
    return render(
      <TreatmentProgramInstanceDetailClient
        patientProfileHref={TEST_EDITOR_PATIENT_PROFILE_HREF}
        patientDisplayName="Иван Т."
        initial={initial}
        initialTestResults={[]}
        initialAttemptAcceptMap={{}}
        initialEvents={[]}
        initialActionLog={[]}
        currentUserId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
        appDisplayTimeZone="Europe/Moscow"
        treatmentProgramLibrary={emptyLibrary}
        doctorReplyFromLogEnabled={false}
      />,
    );
  }

  it("expands available stage by default when no in_progress", () => {
    renderClient(instanceDetailWithPipelineStages());

    const stageOne = screen.getByTestId(`instance-editor-pipeline-stage-${STAGE_ONE}`);
    const stageTwo = screen.getByTestId(`instance-editor-pipeline-stage-${STAGE_TWO}`);

    expect(stageOne).toHaveAttribute("data-expanded", "true");
    expect(stageTwo).toHaveAttribute("data-expanded", "false");
    expect(within(stageOne).getByRole("button", { name: /этап 1/i })).toHaveAttribute("aria-expanded", "true");
    expect(within(stageTwo).getByRole("button", { name: /этап 2/i })).toHaveAttribute("aria-expanded", "false");
    expect(within(stageOne).getByRole("button", { name: /^старт этапа$/i })).toBeInTheDocument();
    expect(within(stageTwo).queryByRole("button", { name: /^открыть этап$/i })).not.toBeInTheDocument();
  });

  it("expands in_progress stage by default", () => {
    renderClient(instanceDetailWithInProgressStage());

    const stageOne = screen.getByTestId(`instance-editor-pipeline-stage-${STAGE_ONE}`);
    const stageTwo = screen.getByTestId(`instance-editor-pipeline-stage-${STAGE_TWO}`);

    expect(stageOne).toHaveAttribute("data-expanded", "false");
    expect(stageTwo).toHaveAttribute("data-expanded", "true");
    expect(within(stageTwo).getByRole("button", { name: /^завершить этап$/i })).toBeInTheDocument();
    expect(within(stageOne).queryByRole("button", { name: /^старт этапа$/i })).not.toBeInTheDocument();
  });

  it("toggles stage expansion manually from header trigger", async () => {
    const user = userEvent.setup();
    renderClient(instanceDetailWithPipelineStages());

    const stageTwo = screen.getByTestId(`instance-editor-pipeline-stage-${STAGE_TWO}`);
    expect(stageTwo).toHaveAttribute("data-expanded", "false");

    const trigger = within(stageTwo).getByRole("button", { name: /этап 2/i });
    await user.click(trigger);

    expect(stageTwo).toHaveAttribute("data-expanded", "true");
    expect(within(stageTwo).getByRole("button", { name: /^открыть этап$/i })).toBeInTheDocument();

    await user.click(trigger);
    expect(stageTwo).toHaveAttribute("data-expanded", "false");
    expect(within(stageTwo).queryByRole("button", { name: /^открыть этап$/i })).not.toBeInTheDocument();
  });

  it("expands first unfinished locked stage when none available or in_progress", () => {
    renderClient(instanceDetailWithLockedPipelineOnly());

    const stageOne = screen.getByTestId(`instance-editor-pipeline-stage-${STAGE_ONE}`);
    const stageTwo = screen.getByTestId(`instance-editor-pipeline-stage-${STAGE_TWO}`);

    expect(stageOne).toHaveAttribute("data-expanded", "true");
    expect(stageTwo).toHaveAttribute("data-expanded", "false");
  });

  it("expands first stage by sortOrder when all pipeline stages are completed or skipped", () => {
    renderClient(instanceDetailAllTerminalPipelineStages());

    const stageOne = screen.getByTestId(`instance-editor-pipeline-stage-${STAGE_ONE}`);
    const stageTwo = screen.getByTestId(`instance-editor-pipeline-stage-${STAGE_TWO}`);

    expect(stageOne).toHaveAttribute("data-expanded", "true");
    expect(stageTwo).toHaveAttribute("data-expanded", "false");
    expect(within(stageOne).getByRole("button", { name: /этап 1/i })).toHaveAttribute("aria-expanded", "true");
    expect(within(stageOne).getByRole("button", { name: /^открыть заново$/i })).toBeInTheDocument();
    expect(within(stageTwo).queryByRole("button", { name: /^открыть заново$/i })).not.toBeInTheDocument();
  });

  it("keeps both stages expandable at once", async () => {
    const user = userEvent.setup();
    renderClient(instanceDetailWithPipelineStages());

    const stageOne = screen.getByTestId(`instance-editor-pipeline-stage-${STAGE_ONE}`);
    const stageTwo = screen.getByTestId(`instance-editor-pipeline-stage-${STAGE_TWO}`);

    await user.click(within(stageTwo).getByRole("button", { name: /этап 2/i }));

    expect(stageOne).toHaveAttribute("data-expanded", "true");
    expect(stageTwo).toHaveAttribute("data-expanded", "true");
  });

  it("expands collapsed stage and opens new group dialog from + Группа", async () => {
    const user = userEvent.setup();
    renderClient(instanceDetailWithPipelineStages());

    const stageTwo = screen.getByTestId(`instance-editor-pipeline-stage-${STAGE_TWO}`);
    expect(stageTwo).toHaveAttribute("data-expanded", "false");

    await user.click(within(stageTwo).getByRole("button", { name: /^\+ группа$/i }));

    expect(stageTwo).toHaveAttribute("data-expanded", "true");
    expect(await screen.findByRole("dialog", { name: /новая группа/i })).toBeInTheDocument();
  });

  it("does not render inline pipeline stage DnD on the main list", () => {
    renderClient(instanceDetailWithPipelineStages());
    expect(screen.queryByTestId("pipeline-dnd")).not.toBeInTheDocument();
  });
});
