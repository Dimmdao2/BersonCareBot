/** @vitest-environment jsdom */

import type { ComponentType, ReactNode } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

const FORBIDDEN_EDITOR_FETCH_SNIPPETS = [
  "stage-items/",
  "stage-groups/",
  "from-test-set",
  "from-lfk-complex",
  "from-freeform-recommendation",
  "groups/reorder",
  "stages/reorder",
] as const;

const emptyLibrary: TreatmentProgramLibraryPickers = {
  exercises: [],
  lfkComplexes: [],
  testSets: [],
  clinicalTests: [],
  recommendations: [],
  lessons: [],
};

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

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

describe("TreatmentProgramInstanceDetailClient phase 2 draft smoke", () => {
  const fetchMock = vi.fn();

  beforeAll(async () => {
    ({ TreatmentProgramInstanceDetailClient } = await import("./TreatmentProgramInstanceDetailClient"));
  }, 25_000);

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as typeof fetch;
  });

  function renderClient() {
    return render(
      <TreatmentProgramInstanceDetailClient
        patientProfileHref="/app/doctor/clients/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        patientDisplayName="Иван Т."
        initial={minimalInstanceDetail()}
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

  function assertNoForbiddenEditorFetch() {
    for (const [input, init] of fetchMock.mock.calls) {
      const url = requestUrl(input as RequestInfo);
      const method = (init as RequestInit | undefined)?.method ?? "GET";
      if (method === "GET") continue;
      for (const snippet of FORBIDDEN_EDITOR_FETCH_SNIPPETS) {
        expect(url.includes(snippet), `unexpected editor fetch ${method} ${url}`).toBe(false);
      }
    }
  }

  it("add pipeline stage updates draft without immediate editor mutation fetch", async () => {
    const user = userEvent.setup();
    renderClient();

    await user.click(screen.getByRole("button", { name: /^добавить этап$/i }));
    const titleInput = await screen.findByLabelText(/название/i);
    await user.type(titleInput, "Этап 2");
    await user.click(screen.getByRole("button", { name: /^добавить$/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/несохранённые изменения/i);
    });
    expect(screen.getByText("Этап 2")).toBeInTheDocument();
    assertNoForbiddenEditorFetch();
  });
});
