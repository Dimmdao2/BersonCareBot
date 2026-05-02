/** @vitest-environment jsdom */

import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { USAGE_CONFIRMATION_REQUIRED } from "@/modules/treatment-program/errors";
import {
  EMPTY_TREATMENT_PROGRAM_TEMPLATE_USAGE_SNAPSHOT,
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
  return {
    id: TEMPLATE_ID,
    title: "Шаблон",
    description: null,
    status: "draft",
    createdBy: null,
    createdAt: now,
    updatedAt: now,
    stages: [],
    ...over,
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
      expect(screen.getByRole("button", { name: /^в архив$/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /^в архив$/i }));

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
    await user.click(screen.getByRole("button", { name: /^в архив$/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /отправить шаблон в архив/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /в архив, с подтверждением/i }));

    await waitFor(() => {
      expect(screen.getByText(/Шаблон в архиве — изменение этапов и элементов отключено/i)).toBeInTheDocument();
    });
    expect(refreshMock).toHaveBeenCalled();
  });
});
