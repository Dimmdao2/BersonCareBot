/** @vitest-environment jsdom */

import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { USAGE_CONFIRMATION_REQUIRED } from "@/modules/treatment-program/errors";
import {
  EMPTY_TREATMENT_PROGRAM_TEMPLATE_USAGE_SNAPSHOT,
  treatmentProgramTemplateStageCountForList,
  type TreatmentProgramTemplateDetail,
} from "@/modules/treatment-program/types";
import {
  TreatmentProgramConstructorClient,
  type TreatmentProgramLibraryPickers,
} from "./TreatmentProgramConstructorClient";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const TEMPLATE_ID = "11111111-1111-4111-8111-111111111111";

function makeDetail(over: Partial<TreatmentProgramTemplateDetail> = {}): TreatmentProgramTemplateDetail {
  const now = "2026-01-01T00:00:00.000Z";
  const stageZero = {
    id: "00000000-0000-4000-8000-000000000001",
    templateId: TEMPLATE_ID,
    title: "Общие рекомендации",
    description: null,
    sortOrder: 0,
    goals: null,
    objectives: null,
    expectedDurationDays: null,
    expectedDurationText: null,
    groups: [] as TreatmentProgramTemplateDetail["stages"][number]["groups"],
    items: [] as TreatmentProgramTemplateDetail["stages"][number]["items"],
  };
  const merged: TreatmentProgramTemplateDetail = {
    id: TEMPLATE_ID,
    title: "Шаблон",
    description: null,
    status: "draft",
    stageCount: 0,
    itemCount: 0,
    listPreviewMedia: null,
    createdBy: null,
    createdAt: now,
    updatedAt: now,
    stages: [stageZero],
    ...over,
  };
  const itemCount = merged.stages.reduce((n, st) => n + st.items.length, 0);
  return {
    ...merged,
    stageCount: treatmentProgramTemplateStageCountForList(merged.stages),
    itemCount,
    listPreviewMedia: merged.listPreviewMedia ?? null,
  };
}

const emptyLibrary: TreatmentProgramLibraryPickers = {
  exercises: [],
  lfkComplexes: [],
  testSets: [],
  recommendations: [],
  lessons: [],
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

describe("TreatmentProgramConstructorClient", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    refreshMock.mockClear();
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as typeof fetch;
  });

  it("shows empty usage message after loading usage snapshot", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? "GET";
      if (method === "GET" && url.endsWith("/usage")) {
        return Promise.resolve(jsonResponse({ ok: true, usage: EMPTY_TREATMENT_PROGRAM_TEMPLATE_USAGE_SNAPSHOT }));
      }
      return Promise.resolve(new Response("unexpected", { status: 500 }));
    });

    render(
      <TreatmentProgramConstructorClient templateId={TEMPLATE_ID} initialDetail={makeDetail()} library={emptyLibrary} />,
    );

    expect(screen.getByRole("heading", { name: /где используется/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByText(/Пока не используется в программах пациентов и курсах/i),
      ).toBeInTheDocument();
    });
  });

  it("archives template without confirmation when usage is empty", async () => {
    const archived = makeDetail({ status: "archived" });
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? "GET";
      if (method === "GET" && url.endsWith("/usage")) {
        return Promise.resolve(
          jsonResponse({ ok: true, usage: EMPTY_TREATMENT_PROGRAM_TEMPLATE_USAGE_SNAPSHOT }),
        );
      }
      if (method === "DELETE") {
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      if (method === "GET" && url.includes(TEMPLATE_ID) && !url.endsWith("/usage")) {
        return Promise.resolve(jsonResponse({ ok: true, item: archived }));
      }
      return Promise.resolve(new Response("unexpected", { status: 500 }));
    });

    const user = userEvent.setup();
    render(
      <TreatmentProgramConstructorClient templateId={TEMPLATE_ID} initialDetail={makeDetail()} library={emptyLibrary} />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^архивировать$/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /^архивировать$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Шаблон в архиве — изменение этапов и элементов отключено/i)).toBeInTheDocument();
    });
    expect(refreshMock).toHaveBeenCalled();
  });

  it("opens confirmation dialog on 409 and archives with acknowledge flag", async () => {
    const usageHeavy = {
      ...EMPTY_TREATMENT_PROGRAM_TEMPLATE_USAGE_SNAPSHOT,
      activeTreatmentProgramInstanceCount: 1,
      activeTreatmentProgramInstanceRefs: [
        {
          kind: "treatment_program_instance" as const,
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          title: "Моя программа",
          patientUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        },
      ],
    };
    const archived = makeDetail({ status: "archived" });

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? "GET";
      if (method === "GET" && url.endsWith("/usage")) {
        return Promise.resolve(jsonResponse({ ok: true, usage: usageHeavy }));
      }
      if (method === "DELETE") {
        if (!url.includes("acknowledgeUsageWarning")) {
          return Promise.resolve(
            jsonResponse({ ok: false, code: USAGE_CONFIRMATION_REQUIRED, usage: usageHeavy }, 409),
          );
        }
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      if (method === "GET" && url.includes(TEMPLATE_ID) && !url.endsWith("/usage")) {
        return Promise.resolve(jsonResponse({ ok: true, item: archived }));
      }
      return Promise.resolve(new Response("unexpected", { status: 500 }));
    });

    const user = userEvent.setup();
    render(
      <TreatmentProgramConstructorClient templateId={TEMPLATE_ID} initialDetail={makeDetail()} library={emptyLibrary} />,
    );

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /моя программа/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /^архивировать$/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /отправить шаблон в архив/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /в архив, с подтверждением/i }));

    await waitFor(() => {
      expect(screen.getByText(/Шаблон в архиве — изменение этапов и элементов отключено/i)).toBeInTheDocument();
    });
    expect(refreshMock).toHaveBeenCalled();
  });

  it("calls router.refresh after publish when onArchived is provided (split-view parity)", async () => {
    const published = makeDetail({ status: "published" });
    let patchDone = false;
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? "GET";
      if (method === "GET" && url.endsWith("/usage")) {
        return Promise.resolve(jsonResponse({ ok: true, usage: EMPTY_TREATMENT_PROGRAM_TEMPLATE_USAGE_SNAPSHOT }));
      }
      if (
        method === "PATCH" &&
        url.includes(`/api/doctor/treatment-program-templates/${TEMPLATE_ID}`) &&
        !url.endsWith("/usage")
      ) {
        patchDone = true;
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      if (method === "GET" && url.includes(TEMPLATE_ID) && !url.endsWith("/usage")) {
        return Promise.resolve(jsonResponse({ ok: true, item: patchDone ? published : makeDetail() }));
      }
      return Promise.resolve(new Response("unexpected", { status: 500 }));
    });

    const user = userEvent.setup();
    const onArchived = vi.fn();
    render(
      <TreatmentProgramConstructorClient
        templateId={TEMPLATE_ID}
        initialDetail={makeDetail()}
        library={emptyLibrary}
        onArchived={onArchived}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^опубликовать$/i })).toBeInTheDocument();
    });
    refreshMock.mockClear();
    await user.click(screen.getByRole("button", { name: /^опубликовать$/i }));

    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalled();
    });
    expect(onArchived).not.toHaveBeenCalled();
  });

  it("добавляет комплекс ЛФК из модалки «Элемент из библиотеки» (POST from-lfk-complex, без второй модалки)", async () => {
    const stageId = "22222222-2222-4222-8222-222222222222";
    const complexId = "33333333-3333-4333-8333-333333333333";
    const groupId = "44444444-4444-4444-8444-444444444444";
    const detail = makeDetail({
      stages: [
        {
          id: "00000000-0000-4000-8000-000000000001",
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
          id: stageId,
          templateId: TEMPLATE_ID,
          title: "Этап 1",
          description: null,
          sortOrder: 1,
          goals: null,
          objectives: null,
          expectedDurationDays: null,
          expectedDurationText: null,
          groups: [
            {
              id: groupId,
              stageId,
              title: "Моя группа",
              description: null,
              scheduleText: null,
              sortOrder: 1,
              systemKind: null,
            },
          ],
          items: [],
        },
      ],
    });
    const library: TreatmentProgramLibraryPickers = {
      ...emptyLibrary,
      lfkComplexes: [
        {
          id: complexId,
          title: "Комплекс А",
          subtitle: "2 упражнений",
          thumbUrl: null,
          description: "Описание из каталога",
        },
      ],
    };

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? "GET";
      if (method === "GET" && url.endsWith("/usage")) {
        return Promise.resolve(jsonResponse({ ok: true, usage: EMPTY_TREATMENT_PROGRAM_TEMPLATE_USAGE_SNAPSHOT }));
      }
      if (method === "GET" && url.includes(TEMPLATE_ID) && !url.endsWith("/usage")) {
        return Promise.resolve(jsonResponse({ ok: true, item: detail }));
      }
      if (method === "POST" && url.includes("/items/from-lfk-complex")) {
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      return Promise.resolve(new Response("unexpected", { status: 500 }));
    });

    const user = userEvent.setup();
    render(<TreatmentProgramConstructorClient templateId={TEMPLATE_ID} initialDetail={detail} library={library} />);

    const addBtns = screen.getAllByRole("button", { name: /добавить элемент/i });
    await user.click(addBtns[1]!);

    const pickerDialog = await screen.findByRole("dialog", { name: /элемент из библиотеки/i });
    const picker = within(pickerDialog);
    await user.click(picker.getByRole("radio", { name: /Комплекс ЛФК/i }));

    expect(picker.getByText(/2 упражнений/)).toBeInTheDocument();

    await user.click(picker.getByRole("button", { name: /Комплекс А/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /элемент из библиотеки/i })).not.toBeInTheDocument();
    });
    const postFromLfk = fetchMock.mock.calls.some(([input, init]) => {
      const u = requestUrl(input as RequestInfo);
      return u.includes("from-lfk-complex") && (init as RequestInit | undefined)?.method === "POST";
    });
    expect(postFromLfk).toBe(true);
  });
});
