/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { DoctorProgramItemDiscussionDialog } from "./DoctorProgramItemDiscussionDialog";

const instanceId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
const itemId2 = "33333333-3333-4333-8333-333333333333";

describe("DoctorProgramItemDiscussionDialog", () => {
  beforeEach(() => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/discussion")) {
        return new Response(
          JSON.stringify({
            ok: true,
            messages: [
              {
                id: "msg-1",
                instanceStageItemId: itemId,
                patientUserId: "00000000-0000-4000-8000-000000000001",
                senderRole: "patient",
                origin: "patient_observation",
                body: "Болит колено",
                mediaFileId: null,
                supportMessageId: null,
                createdAt: "2026-06-01T10:00:00.000Z",
              },
            ],
            pageInfo: { nextCursor: null },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    }) as typeof fetch;
  });

  it("loads and shows read-only discussion thread when opened", async () => {
    render(
      <DoctorProgramItemDiscussionDialog
        instanceId={instanceId}
        itemId={itemId}
        itemLabel="Приседания"
        open
        onOpenChange={() => {}}
      />,
    );

    expect(await screen.findByRole("heading", { name: "Обсуждение: Приседания" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Болит колено")).toBeInTheDocument();
    });
    expect(screen.getByText(/^Пациент ·/)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/items/${encodeURIComponent(itemId)}/discussion`,
      ),
    );
  });

  it("ignores stale response after item switch", async () => {
    let resolveSlowItemA: (value: Response) => void = () => {};
    const slowItemAPromise = new Promise<Response>((resolve) => {
      resolveSlowItemA = resolve;
    });

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes(`/items/${encodeURIComponent(itemId)}/discussion`)) {
        return slowItemAPromise;
      }
      if (url.includes(`/items/${encodeURIComponent(itemId2)}/discussion`)) {
        return new Response(
          JSON.stringify({
            ok: true,
            messages: [
              {
                id: "msg-2",
                instanceStageItemId: itemId2,
                patientUserId: "00000000-0000-4000-8000-000000000001",
                senderRole: "patient",
                origin: "patient_observation",
                body: "Свежий пункт",
                mediaFileId: null,
                supportMessageId: null,
                createdAt: "2026-06-02T10:00:00.000Z",
              },
            ],
            pageInfo: { nextCursor: null },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    }) as typeof fetch;

    const { rerender } = render(
      <DoctorProgramItemDiscussionDialog
        instanceId={instanceId}
        itemId={itemId}
        itemLabel="Приседания"
        open
        onOpenChange={() => {}}
      />,
    );

    rerender(
      <DoctorProgramItemDiscussionDialog
        instanceId={instanceId}
        itemId={itemId2}
        itemLabel="Мост"
        open
        onOpenChange={() => {}}
      />,
    );

    expect(await screen.findByRole("heading", { name: "Обсуждение: Мост" })).toBeInTheDocument();
    expect(await screen.findByText("Свежий пункт")).toBeInTheDocument();

    resolveSlowItemA?.(
      new Response(
        JSON.stringify({
          ok: true,
          messages: [
            {
              id: "msg-stale",
              instanceStageItemId: itemId,
              patientUserId: "00000000-0000-4000-8000-000000000001",
              senderRole: "patient",
              origin: "patient_observation",
              body: "Устаревший ответ",
              mediaFileId: null,
              supportMessageId: null,
              createdAt: "2026-06-01T10:00:00.000Z",
            },
          ],
          pageInfo: { nextCursor: null },
        }),
        { status: 200 },
      ),
    );

    await waitFor(() => {
      expect(screen.getByText("Свежий пункт")).toBeInTheDocument();
    });
    expect(screen.queryByText("Устаревший ответ")).not.toBeInTheDocument();
  });
});
