/** @vitest-environment jsdom */

import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { USAGE_CONFIRMATION_REQUIRED } from "@/modules/courses/errors";
import type { CourseRecord, CourseUsageSnapshot } from "@/modules/courses/types";
import { DoctorCourseEditForm } from "./DoctorCourseEditForm";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const COURSE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TEMPLATE_ID = "11111111-1111-4111-8111-111111111111";

function makeCourse(over: Partial<CourseRecord> = {}): CourseRecord {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: COURSE_ID,
    title: "Курс тест",
    description: null,
    programTemplateId: TEMPLATE_ID,
    introLessonPageId: null,
    accessSettings: {},
    status: "draft",
    priceMinor: 0,
    currency: "RUB",
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

function makeUsageSnapshot(over: Partial<CourseUsageSnapshot> = {}): CourseUsageSnapshot {
  return {
    programTemplateId: TEMPLATE_ID,
    programTemplateTitle: "Шаблон тест",
    programTemplateRef: { kind: "treatment_program_template", id: TEMPLATE_ID, title: "Шаблон тест" },
    activeTreatmentProgramInstanceCount: 0,
    completedTreatmentProgramInstanceCount: 0,
    activeTreatmentProgramInstanceRefs: [],
    completedTreatmentProgramInstanceRefs: [],
    publishedLinkedContentPageCount: 0,
    draftLinkedContentPageCount: 0,
    archivedLinkedContentPageCount: 0,
    publishedLinkedContentPageRefs: [],
    draftLinkedContentPageRefs: [],
    archivedLinkedContentPageRefs: [],
    ...over,
  };
}

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

const templates = [{ id: TEMPLATE_ID, title: "Шаблон тест", status: "published" }];
const introPageOptions: { id: string; title: string }[] = [];

describe("DoctorCourseEditForm", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    refreshMock.mockClear();
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as typeof fetch;
  });

  it("shows usage summary when externalUsageSnapshot is provided (no fetch)", () => {
    const usage = makeUsageSnapshot();
    render(
      <DoctorCourseEditForm
        courseId={COURSE_ID}
        initial={makeCourse()}
        templates={templates}
        introPageOptions={introPageOptions}
        externalUsageSnapshot={usage}
      />,
    );

    expect(screen.getByRole("heading", { name: /где используется курс/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /шаблон тест/i })).toHaveAttribute(
      "href",
      `/app/doctor/treatment-program-templates/${TEMPLATE_ID}`,
    );
    expect(
      screen.getByText(/Нет опубликованных промо-страниц с привязкой к этому курсу/i),
    ).toBeInTheDocument();
  });

  it("loads usage via GET when externalUsageSnapshot is omitted", async () => {
    const usage = makeUsageSnapshot();
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? "GET";
      if (method === "GET" && url.includes(`/courses/${COURSE_ID}/usage`)) {
        return Promise.resolve(jsonResponse({ ok: true, usage }));
      }
      return Promise.resolve(new Response("unexpected", { status: 500 }));
    });

    render(
      <DoctorCourseEditForm
        courseId={COURSE_ID}
        initial={makeCourse()}
        templates={templates}
        introPageOptions={introPageOptions}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /шаблон тест/i })).toBeInTheDocument();
    });
  });

  it("archives course without confirmation when usage does not require acknowledgement", async () => {
    const usage = makeUsageSnapshot({
      draftLinkedContentPageCount: 1,
      draftLinkedContentPageRefs: [
        { kind: "content_page", id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", title: "Черновик страницы" },
      ],
    });
    const archived = makeCourse({ status: "archived" });

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? "GET";
      if (method === "GET" && url.includes(`/courses/${COURSE_ID}/usage`)) {
        return Promise.resolve(jsonResponse({ ok: true, usage }));
      }
      if (method === "PATCH" && url.endsWith(`/courses/${COURSE_ID}`)) {
        return Promise.resolve(jsonResponse({ ok: true, item: archived }));
      }
      return Promise.resolve(new Response("unexpected", { status: 500 }));
    });

    const user = userEvent.setup();
    render(
      <DoctorCourseEditForm
        courseId={COURSE_ID}
        initial={makeCourse()}
        templates={templates}
        introPageOptions={introPageOptions}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /черновик страницы/i })).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText(/статус/i), "archived");
    await user.click(screen.getByRole("button", { name: /^сохранить$/i }));

    await waitFor(() => {
      expect(screen.getByText(/^сохранено$/i)).toBeInTheDocument();
    });
    expect(refreshMock).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/api/doctor/courses/${COURSE_ID}`),
      expect.objectContaining({ method: "PATCH" }),
    );
    const patchBodies = fetchMock.mock.calls
      .filter(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    expect(patchBodies[0]).not.toHaveProperty("acknowledgeUsageWarning");
  });

  it("opens confirmation dialog on 409 and archives with acknowledgeUsageWarning", async () => {
    const usageHeavy = makeUsageSnapshot({
      activeTreatmentProgramInstanceCount: 1,
      activeTreatmentProgramInstanceRefs: [
        {
          kind: "treatment_program_instance",
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          title: "Программа пациента",
          patientUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        },
      ],
    });
    const archived = makeCourse({ status: "archived" });

    let patchCount = 0;
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? "GET";
      if (method === "GET" && url.includes(`/courses/${COURSE_ID}/usage`)) {
        return Promise.resolve(jsonResponse({ ok: true, usage: usageHeavy }));
      }
      if (method === "PATCH" && url.endsWith(`/courses/${COURSE_ID}`)) {
        patchCount += 1;
        const body = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
        if (!body.acknowledgeUsageWarning) {
          return Promise.resolve(
            jsonResponse({ ok: false, code: USAGE_CONFIRMATION_REQUIRED, usage: usageHeavy }, 409),
          );
        }
        return Promise.resolve(jsonResponse({ ok: true, item: archived }));
      }
      return Promise.resolve(new Response("unexpected", { status: 500 }));
    });

    const user = userEvent.setup();
    render(
      <DoctorCourseEditForm
        courseId={COURSE_ID}
        initial={makeCourse()}
        templates={templates}
        introPageOptions={introPageOptions}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /программа пациента/i })).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText(/статус/i), "archived");
    await user.click(screen.getByRole("button", { name: /^сохранить$/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /отправить курс в архив/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /в архив, с подтверждением/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/сохранено/i);
    });
    expect(refreshMock).toHaveBeenCalled();
    expect(patchCount).toBe(2);
    const patchBodies = fetchMock.mock.calls
      .filter(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    expect(patchBodies[0]).not.toHaveProperty("acknowledgeUsageWarning");
    expect(patchBodies[1].acknowledgeUsageWarning).toBe(true);
  });
});
