/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { DoctorProgramItemDiscussionDialog } from "./DoctorProgramItemDiscussionDialog";

const instanceId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";

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
    expect(screen.getByText("Пациент")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/items/${encodeURIComponent(itemId)}/discussion`,
      ),
    );
  });
});
