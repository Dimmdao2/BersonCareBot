/** @vitest-environment jsdom */

import type { ComponentType, ReactNode } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import type { TreatmentProgramLibraryPickers } from "@/app/app/doctor/treatment-program-shared/treatmentProgramLibraryTypes";

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

function minimalInstanceDetail(): TreatmentProgramInstanceDetail {
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
      {
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
      },
    ],
  };
}

function instanceDetailWithPipelineStages(): TreatmentProgramInstanceDetail {
  return {
    ...minimalInstanceDetail(),
    stages: [
      minimalInstanceDetail().stages[0]!,
      {
        id: STAGE_ONE,
        instanceId: INSTANCE_ID,
        sourceStageId: null,
        title: "Этап 1",
        description: null,
        sortOrder: 1,
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
      },
      {
        id: STAGE_TWO,
        instanceId: INSTANCE_ID,
        sourceStageId: null,
        title: "Этап 2",
        description: null,
        sortOrder: 2,
        status: "locked",
        skipReason: null,
        localComment: null,
        startedAt: null,
        goals: null,
        objectives: null,
        expectedDurationDays: null,
        expectedDurationText: null,
        groups: [],
        items: [],
      },
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

describe("TreatmentProgramInstanceDetailClient phase 4 toolbar", () => {
  const scrollIntoView = vi.fn();

  beforeAll(async () => {
    ({ TreatmentProgramInstanceDetailClient } = await import("./TreatmentProgramInstanceDetailClient"));
  }, 25_000);

  beforeEach(() => {
    scrollIntoView.mockReset();
    Element.prototype.scrollIntoView = scrollIntoView;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/discussion")) {
          return new Response(
            JSON.stringify({ ok: true, messages: [], pageInfo: { nextCursor: null } }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ ok: false }), { status: 404 });
      }),
    );
  });

  function renderClient(initial: TreatmentProgramInstanceDetail = minimalInstanceDetail()) {
    return render(
      <TreatmentProgramInstanceDetailClient
        patientProfileHref="/app/doctor/clients/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
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

  it("uses sticky toolbar instead of legacy SaveBar and drops duplicate summary header", () => {
    renderClient();

    const toolbar = screen.getByTestId("instance-editor-toolbar");
    expect(toolbar).toHaveClass("sticky", "-mx-3");
    expect(toolbar.className).toMatch(/top-\[calc\(3\.5rem/);

    expect(screen.getByRole("heading", { name: /план реабилитации/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /иван т\./i })).toBeInTheDocument();
    expect(screen.getByTestId("instance-editor-comments")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^сохранить изменения$/i })).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: /^сохранить$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/^статус программы:/i)).not.toBeInTheDocument();
    expect(document.getElementById("doctor-program-instance-comments")).toBeTruthy();
    expect(document.getElementById("doctor-program-instance-pipeline")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^добавить этап$/i })).toHaveLength(1);
    expect(screen.queryByTestId("pipeline-dnd")).not.toBeInTheDocument();
  });

  it("opens instance discussion dialog from toolbar comments button", async () => {
    const user = userEvent.setup();
    renderClient(instanceDetailWithPipelineStages());

    await user.click(screen.getByTestId("instance-editor-comments"));
    expect(await screen.findByRole("heading", { name: /обсуждения по программе/i })).toBeInTheDocument();
  });

  it("opens stage order dialog from toolbar", async () => {
    const user = userEvent.setup();
    renderClient(instanceDetailWithPipelineStages());

    await user.click(screen.getByTestId("instance-editor-change-stage-order"));
    const dialog = await screen.findByRole("dialog", { name: /изменить порядок этапов/i });
    expect(within(dialog).getByText("Этап 1")).toBeInTheDocument();
    expect(within(dialog).getByText("Этап 2")).toBeInTheDocument();
  });
});
