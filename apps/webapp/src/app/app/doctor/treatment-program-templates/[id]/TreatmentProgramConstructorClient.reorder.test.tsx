/** @vitest-environment jsdom */

import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EMPTY_TREATMENT_PROGRAM_TEMPLATE_USAGE_SNAPSHOT } from "@/modules/treatment-program/types";
import type { TreatmentProgramTemplateDetail } from "@/modules/treatment-program/types";
import {
  TreatmentProgramConstructorClient,
  type TreatmentProgramLibraryPickers,
} from "./TreatmentProgramConstructorClient";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

let capturedPipelineReorder: ((activeId: string, overId: string) => void | Promise<void>) | undefined;
let capturedItemsReorder: ((activeId: string, overId: string) => void | Promise<void>) | undefined;

vi.mock("@/app/app/doctor/treatment-program-shared/TreatmentProgramDndUi", () => ({
  TreatmentProgramPipelineStagesDnd: ({
    children,
    onReorder,
  }: {
    children: ReactNode;
    onReorder: (activeId: string, overId: string) => void | Promise<void>;
  }) => {
    capturedPipelineReorder = onReorder;
    return <div data-testid="pipeline-dnd">{children}</div>;
  },
  TreatmentProgramSortablePipelineStage: ({
    children,
    id,
  }: {
    children: (handle: ReactNode) => ReactNode;
    id: string;
  }) => <section data-stage-id={id}>{children(<span aria-hidden />)}</section>,
  TreatmentProgramStageItemsDnd: ({
    children,
    onReorder,
  }: {
    children: ReactNode;
    onReorder: (activeId: string, overId: string) => void | Promise<void>;
  }) => {
    capturedItemsReorder = onReorder;
    return <div data-testid="items-dnd">{children}</div>;
  },
  TreatmentProgramSortableItemShell: ({
    children,
    id,
  }: {
    children: (handle: ReactNode) => ReactNode;
    id: string;
  }) => <li data-item-id={id}>{children(<span aria-hidden />)}</li>,
}));

const TEMPLATE_ID = "11111111-1111-4111-8111-111111111111";
const STAGE_ZERO = "00000000-0000-4000-8000-000000000001";
const STAGE_A = "22222222-2222-4222-8222-222222222222";
const STAGE_B = "33333333-3333-4333-8333-333333333333";
const GROUP_G1 = "44444444-4444-4444-8444-444444444444";
const GROUP_G2 = "55555555-5555-4555-8555-555555555555";
const ITEM_REC = "66666666-6666-4666-8666-666666666666";
const ITEM_REC2 = "77777777-7777-4777-8777-777777777777";

const emptyLibrary: TreatmentProgramLibraryPickers = {
  exercises: [],
  lfkComplexes: [],
  testSets: [],
  clinicalTests: [],
  recommendations: [],
  lessons: [],
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeReorderDetail(): TreatmentProgramTemplateDetail {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: TEMPLATE_ID,
    title: "Шаблон reorder",
    description: null,
    status: "draft",
    stageCount: 3,
    itemCount: 2,
    listPreviewMedia: null,
    createdBy: null,
    createdAt: now,
    updatedAt: now,
    stages: [
      {
        id: STAGE_ZERO,
        templateId: TEMPLATE_ID,
        title: "Общие рекомендации",
        description: null,
        sortOrder: 0,
        goals: null,
        objectives: null,
        expectedDurationDays: null,
        expectedDurationText: null,
        groups: [],
        items: [],
      },
      {
        id: STAGE_A,
        templateId: TEMPLATE_ID,
        title: "Этап A",
        description: null,
        sortOrder: 1,
        goals: null,
        objectives: null,
        expectedDurationDays: null,
        expectedDurationText: null,
        groups: [
          {
            id: GROUP_G1,
            stageId: STAGE_A,
            title: "Группа 1",
            description: null,
            scheduleText: null,
            sortOrder: 0,
            systemKind: null,
          },
          {
            id: GROUP_G2,
            stageId: STAGE_A,
            title: "Группа 2",
            description: null,
            scheduleText: null,
            sortOrder: 1,
            systemKind: null,
          },
        ],
        items: [
          {
            id: ITEM_REC,
            stageId: STAGE_A,
            itemType: "recommendation",
            itemRefId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            sortOrder: 0,
            comment: null,
            settings: null,
            groupId: GROUP_G1,
          },
          {
            id: ITEM_REC2,
            stageId: STAGE_A,
            itemType: "recommendation",
            itemRefId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            sortOrder: 1,
            comment: null,
            settings: null,
            groupId: GROUP_G2,
          },
        ],
      },
      {
        id: STAGE_B,
        templateId: TEMPLATE_ID,
        title: "Этап B",
        description: null,
        sortOrder: 2,
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

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

describe("TreatmentProgramConstructorClient reorder", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    capturedPipelineReorder = undefined;
    capturedItemsReorder = undefined;
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as typeof fetch;
  });

  function mockDefaultFetch(detail: TreatmentProgramTemplateDetail) {
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? "GET";
      if (method === "GET" && url.endsWith("/usage")) {
        return Promise.resolve(jsonResponse({ ok: true, usage: EMPTY_TREATMENT_PROGRAM_TEMPLATE_USAGE_SNAPSHOT }));
      }
      if (method === "GET" && url.includes(TEMPLATE_ID) && !url.endsWith("/usage")) {
        return Promise.resolve(jsonResponse({ ok: true, item: detail }));
      }
      if (method === "POST" && url.includes("/stages/reorder")) {
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      if (method === "POST" && url.includes("/items/reorder")) {
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      if (method === "PATCH" && url.includes("/stage-items/")) {
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      return Promise.resolve(new Response("unexpected", { status: 500 }));
    });
  }

  it("pipeline DnD calls POST stages/reorder with stage zero first", async () => {
    const detail = makeReorderDetail();
    mockDefaultFetch(detail);
    render(
      <TreatmentProgramConstructorClient templateId={TEMPLATE_ID} initialDetail={detail} library={emptyLibrary} />,
    );
    await waitFor(() => expect(capturedPipelineReorder).toBeDefined());
    await capturedPipelineReorder!(STAGE_B, STAGE_A);
    await waitFor(() => {
      const hit = fetchMock.mock.calls.some(([input, init]) => {
        const url = requestUrl(input as RequestInfo);
        if ((init as RequestInit | undefined)?.method !== "POST" || !url.includes("/stages/reorder")) return false;
        const body = JSON.parse(String((init as RequestInit).body)) as { orderedStageIds: string[] };
        return (
          body.orderedStageIds[0] === STAGE_ZERO &&
          body.orderedStageIds[1] === STAGE_B &&
          body.orderedStageIds[2] === STAGE_A
        );
      });
      expect(hit).toBe(true);
    });
  });

  it("item DnD between custom groups PATCHes groupId then POST items/reorder", async () => {
    const detail = makeReorderDetail();
    mockDefaultFetch(detail);
    render(
      <TreatmentProgramConstructorClient templateId={TEMPLATE_ID} initialDetail={detail} library={emptyLibrary} />,
    );
    await waitFor(() => expect(capturedItemsReorder).toBeDefined());
    await capturedItemsReorder!(ITEM_REC2, ITEM_REC);
    await waitFor(() => {
      const patchHit = fetchMock.mock.calls.some(([input, init]) => {
        const url = requestUrl(input as RequestInfo);
        return (
          (init as RequestInit | undefined)?.method === "PATCH" &&
          url.includes(`/stage-items/${ITEM_REC2}`) &&
          JSON.parse(String((init as RequestInit).body)).groupId === GROUP_G1
        );
      });
      const reorderHit = fetchMock.mock.calls.some(([input, init]) => {
        const url = requestUrl(input as RequestInfo);
        if ((init as RequestInit | undefined)?.method !== "POST" || !url.includes("/items/reorder")) return false;
        const body = JSON.parse(String((init as RequestInit).body)) as { orderedItemIds: string[] };
        return body.orderedItemIds[0] === ITEM_REC2 && body.orderedItemIds[1] === ITEM_REC;
      });
      expect(patchHit).toBe(true);
      expect(reorderHit).toBe(true);
    });
  });

  it("item settings chevron uses POST items/reorder", async () => {
    const detail = makeReorderDetail();
    const stageA = detail.stages.find((s) => s.id === STAGE_A)!;
    stageA.items = [
      {
        id: ITEM_REC,
        stageId: STAGE_A,
        itemType: "recommendation",
        itemRefId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        sortOrder: 0,
        comment: null,
        settings: null,
        groupId: GROUP_G1,
      },
      {
        id: ITEM_REC2,
        stageId: STAGE_A,
        itemType: "recommendation",
        itemRefId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        sortOrder: 1,
        comment: null,
        settings: null,
        groupId: GROUP_G1,
      },
    ];
    mockDefaultFetch(detail);
    const user = userEvent.setup();
    render(
      <TreatmentProgramConstructorClient templateId={TEMPLATE_ID} initialDetail={detail} library={emptyLibrary} />,
    );
    const settingsButtons = await screen.findAllByRole("button", { name: /настройки элемента/i });
    await user.click(settingsButtons[0]!);
    const downBtn = await screen.findByRole("button", { name: /элемент ниже в списке/i });
    await user.click(downBtn);
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input, init]) => {
          const url = requestUrl(input as RequestInfo);
          return (init as RequestInit | undefined)?.method === "POST" && url.includes("/items/reorder");
        }),
      ).toBe(true);
    });
  });

  it("stage chevron down uses bulk stages/reorder", async () => {
    const detail = makeReorderDetail();
    mockDefaultFetch(detail);
    const user = userEvent.setup();
    render(
      <TreatmentProgramConstructorClient templateId={TEMPLATE_ID} initialDetail={detail} library={emptyLibrary} />,
    );
    const downButtons = await screen.findAllByRole("button", { name: /этап ниже/i });
    await user.click(downButtons[0]!);
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input, init]) => {
          const url = requestUrl(input as RequestInfo);
          return (init as RequestInit | undefined)?.method === "POST" && url.includes("/stages/reorder");
        }),
      ).toBe(true);
    });
  });
});
