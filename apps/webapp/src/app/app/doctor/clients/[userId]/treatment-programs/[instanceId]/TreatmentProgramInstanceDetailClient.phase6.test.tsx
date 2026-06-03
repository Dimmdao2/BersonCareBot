/** @vitest-environment jsdom */

import type { ComponentType, ReactNode } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProgramActionLogListRow, TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import type { TreatmentProgramLibraryPickers } from "@/app/app/doctor/treatment-program-shared/treatmentProgramLibraryTypes";
import { TEST_EDITOR_PATIENT_PROFILE_HREF } from "../../../doctorClientProfileHref.testFixtures";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("./DoctorProgramActionLogMediaPreview", () => ({
  DoctorProgramActionLogMediaPreview: () => null,
}));

vi.mock("./DoctorProgramItemDiscussionDialog", () => ({
  DoctorProgramItemDiscussionDialog: ({
    itemId,
    itemLabel,
    open,
  }: {
    itemId: string;
    itemLabel?: string;
    open: boolean;
  }) => (open ? <div data-testid="per-item-discussion">{itemLabel ?? itemId}</div> : null),
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
const ITEM_A = "22222222-2222-4222-8222-222222222222";

const emptyLibrary: TreatmentProgramLibraryPickers = {
  exercises: [],
  lfkComplexes: [],
  testSets: [],
  clinicalTests: [],
  recommendations: [],
  lessons: [],
};

function instanceWithExerciseItem(): TreatmentProgramInstanceDetail {
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
        items: [
          {
            id: ITEM_A,
            stageId: STAGE_ZERO,
            itemType: "exercise",
            itemRefId: "33333333-3333-4333-8333-333333333333",
            sortOrder: 0,
            comment: null,
            localComment: null,
            settings: null,
            snapshot: { title: "Приседания" },
            effectiveComment: null,
            completedAt: null,
            isActionable: true,
            status: "active",
            groupId: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            lastViewedAt: null,
          },
        ],
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
  initialActionLog: ProgramActionLogListRow[];
  currentUserId: string;
  appDisplayTimeZone: string;
  treatmentProgramLibrary: TreatmentProgramLibraryPickers;
  doctorReplyFromLogEnabled: boolean;
  initialOpenDiscussionItemId?: string | null;
}>;

describe("TreatmentProgramInstanceDetailClient phase 6 discussions", () => {
  const fetchMock = vi.fn();

  beforeAll(async () => {
    ({ TreatmentProgramInstanceDetailClient } = await import("./TreatmentProgramInstanceDetailClient"));
  }, 25_000);

  beforeEach(() => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/discussion")) {
        return new Response(
          JSON.stringify({ ok: true, messages: [], pageInfo: { nextCursor: null }, summaryByStageItemId: {} }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    });
    global.fetch = fetchMock as typeof fetch;
  });

  function patientObservationLogRow(): ProgramActionLogListRow {
    return {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      instanceId: INSTANCE_ID,
      instanceStageItemId: ITEM_A,
      patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      sessionId: null,
      actionType: "note",
      payload: { source: "patient_observation" },
      note: "Болит колено",
      createdAt: "2026-06-01T10:00:00.000Z",
    };
  }

  function renderClient(options?: {
    initial?: TreatmentProgramInstanceDetail;
    initialOpenDiscussionItemId?: string;
    initialActionLog?: ProgramActionLogListRow[];
  }) {
    return render(
      <TreatmentProgramInstanceDetailClient
        patientProfileHref={TEST_EDITOR_PATIENT_PROFILE_HREF}
        patientDisplayName="Иван Т."
        initial={options?.initial ?? instanceWithExerciseItem()}
        initialTestResults={[]}
        initialAttemptAcceptMap={{}}
        initialEvents={[]}
        initialActionLog={options?.initialActionLog ?? []}
        currentUserId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
        appDisplayTimeZone="Europe/Moscow"
        treatmentProgramLibrary={emptyLibrary}
        doctorReplyFromLogEnabled={false}
        initialOpenDiscussionItemId={options?.initialOpenDiscussionItemId}
      />,
    );
  }

  it("opens per-item dialog from discussionItem deep link", async () => {
    renderClient({ initialOpenDiscussionItemId: ITEM_A });
    expect(await screen.findByTestId("per-item-discussion")).toHaveTextContent("Приседания");
    expect(screen.queryByRole("heading", { name: /обсуждения по программе/i })).not.toBeInTheDocument();
  });

  it("passes program items into instance discussion dialog from toolbar", async () => {
    const user = userEvent.setup();
    renderClient();

    await user.click(screen.getByTestId("instance-editor-comments"));
    expect(await screen.findByRole("heading", { name: /обсуждения по программе/i })).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: /пункт программы/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Приседания" })).toBeInTheDocument();
    });
  });

  it("opens per-item dialog from action log Обсуждение button", async () => {
    const user = userEvent.setup();
    renderClient({ initialActionLog: [patientObservationLogRow()] });

    await user.click(screen.getByRole("button", { name: /^обсуждение$/i }));
    expect(await screen.findByTestId("per-item-discussion")).toHaveTextContent("Приседания");
  });

  it("shows empty instance discussion when program has no items", async () => {
    const user = userEvent.setup();
    const emptyItemsInstance: TreatmentProgramInstanceDetail = {
      ...instanceWithExerciseItem(),
      stages: instanceWithExerciseItem().stages.map((stage) => ({ ...stage, items: [] })),
    };
    renderClient({ initial: emptyItemsInstance });

    await user.click(screen.getByTestId("instance-editor-comments"));
    expect(await screen.findByRole("heading", { name: /обсуждения по программе/i })).toBeInTheDocument();
    expect(await screen.findByText(/пока нет сообщений/i)).toBeInTheDocument();
  });
});
