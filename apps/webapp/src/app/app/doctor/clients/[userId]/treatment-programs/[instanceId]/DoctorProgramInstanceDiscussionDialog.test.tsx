/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DOCTOR_INSTANCE_DISCUSSION_ALL_ITEMS,
  DoctorProgramInstanceDiscussionDialog,
} from "./DoctorProgramInstanceDiscussionDialog";

const instanceId = "11111111-1111-4111-8111-111111111111";
const itemA = "22222222-2222-4222-8222-222222222222";
const itemB = "33333333-3333-4333-8333-333333333333";

describe("DoctorProgramInstanceDiscussionDialog", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/discussion/summary")) {
        return new Response(
          JSON.stringify({
            ok: true,
            summaryByStageItemId: {
              [itemA]: { totalCount: 1 },
              [itemB]: { totalCount: 2 },
            },
          }),
          { status: 200 },
        );
      }
      if (!url.includes("/discussion")) {
        return new Response(JSON.stringify({ ok: false }), { status: 404 });
      }
      if (url.includes(`stageItemId=${encodeURIComponent(itemB)}`)) {
        return new Response(
          JSON.stringify({
            ok: true,
            messages: [
              {
                id: "msg-b",
                instanceStageItemId: itemB,
                patientUserId: "00000000-0000-4000-8000-000000000001",
                senderRole: "patient",
                origin: "patient_observation",
                body: "Сообщение по мосту",
                mediaFileId: null,
                supportMessageId: null,
                createdAt: "2026-06-02T10:00:00.000Z",
              },
            ],
            pageInfo: { nextCursor: null, stageItemIdFilter: itemB },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          ok: true,
          messages: [
            {
              id: "msg-a",
              instanceStageItemId: itemA,
              patientUserId: "00000000-0000-4000-8000-000000000001",
              senderRole: "patient",
              origin: "patient_observation",
              body: "Сообщение по приседу",
              mediaFileId: null,
              supportMessageId: null,
              createdAt: "2026-06-01T10:00:00.000Z",
            },
            {
              id: "msg-b",
              instanceStageItemId: itemB,
              patientUserId: "00000000-0000-4000-8000-000000000001",
              senderRole: "admin",
              origin: "support_admin_reply",
              body: "Ответ по мосту",
              mediaFileId: null,
              supportMessageId: null,
              createdAt: "2026-06-02T10:00:00.000Z",
            },
          ],
          pageInfo: { nextCursor: null, stageItemIdFilter: null },
        }),
        { status: 200 },
      );
    });
    global.fetch = fetchMock as typeof fetch;
  });

  it("loads all-item thread by default and opens from toolbar scenario", async () => {
    render(
      <DoctorProgramInstanceDiscussionDialog
        instanceId={instanceId}
        programItems={[
          { id: itemA, label: "Приседания" },
          { id: itemB, label: "Мост" },
        ]}
        open
        onOpenChange={() => {}}
      />,
    );

    expect(await screen.findByRole("heading", { name: /обсуждения по программе/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Сообщение по приседу")).toBeInTheDocument();
      expect(screen.getByText("Ответ по мосту")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/discussion`),
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("stageItemId=");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/discussion/summary`),
    );
  });

  it("filters item options by search and reloads thread for selected item", async () => {
    const user = userEvent.setup();
    render(
      <DoctorProgramInstanceDiscussionDialog
        instanceId={instanceId}
        programItems={[
          { id: itemA, label: "Приседания" },
          { id: itemB, label: "Мост" },
        ]}
        open
        onOpenChange={() => {}}
      />,
    );

    await screen.findByText("Сообщение по приседу");

    await user.type(screen.getByTestId("doctor-instance-discussion-item-search"), "мост");
    await user.click(screen.getByTestId("doctor-instance-discussion-item-filter"));
    await user.click(await screen.findByRole("option", { name: "Мост (2)" }));

    await waitFor(() => {
      expect(screen.getByText("Сообщение по мосту")).toBeInTheDocument();
    });
    expect(screen.queryByText("Сообщение по приседу")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`stageItemId=${encodeURIComponent(itemB)}`),
    );
    expect(screen.getByTestId("doctor-instance-discussion-item-filter")).toHaveTextContent("Мост (2)");
  });

  it("shows message counts from summary in item filter", async () => {
    const user = userEvent.setup();
    render(
      <DoctorProgramInstanceDiscussionDialog
        instanceId={instanceId}
        programItems={[
          { id: itemA, label: "Приседания" },
          { id: itemB, label: "Мост" },
        ]}
        open
        onOpenChange={() => {}}
      />,
    );

    await screen.findByText("Сообщение по приседу");
    await user.click(screen.getByTestId("doctor-instance-discussion-item-filter"));
    expect(await screen.findByRole("option", { name: "Приседания (1)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Мост (2)" })).toBeInTheDocument();
  });

  it("loads older messages when next cursor is present", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/discussion/summary")) {
        return new Response(JSON.stringify({ ok: true, summaryByStageItemId: {} }), { status: 200 });
      }
      if (url.includes("cursor=older")) {
        return new Response(
          JSON.stringify({
            ok: true,
            messages: [
              {
                id: "msg-old",
                instanceStageItemId: itemA,
                patientUserId: "00000000-0000-4000-8000-000000000001",
                senderRole: "patient",
                origin: "patient_observation",
                body: "Старое сообщение",
                mediaFileId: null,
                supportMessageId: null,
                createdAt: "2026-05-31T10:00:00.000Z",
              },
            ],
            pageInfo: { nextCursor: null },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          ok: true,
          messages: [
            {
              id: "msg-new",
              instanceStageItemId: itemA,
              patientUserId: "00000000-0000-4000-8000-000000000001",
              senderRole: "patient",
              origin: "patient_observation",
              body: "Новое сообщение",
              mediaFileId: null,
              supportMessageId: null,
              createdAt: "2026-06-01T10:00:00.000Z",
            },
          ],
          pageInfo: { nextCursor: "older" },
        }),
        { status: 200 },
      );
    });

    render(
      <DoctorProgramInstanceDiscussionDialog
        instanceId={instanceId}
        programItems={[{ id: itemA, label: "Приседания" }]}
        open
        onOpenChange={() => {}}
      />,
    );

    await screen.findByText("Новое сообщение");
    await user.click(screen.getByRole("button", { name: /показать предыдущие/i }));
    expect(await screen.findByText("Старое сообщение")).toBeInTheDocument();
  });

  it("shows empty thread when program has no items", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/discussion/summary")) {
        return new Response(JSON.stringify({ ok: true, summaryByStageItemId: {} }), { status: 200 });
      }
      if (url.includes("/discussion")) {
        return new Response(
          JSON.stringify({ ok: true, messages: [], pageInfo: { nextCursor: null } }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    });

    render(
      <DoctorProgramInstanceDiscussionDialog
        instanceId={instanceId}
        programItems={[]}
        open
        onOpenChange={() => {}}
      />,
    );

    expect(await screen.findByText(/пока нет сообщений/i)).toBeInTheDocument();
  });
});
