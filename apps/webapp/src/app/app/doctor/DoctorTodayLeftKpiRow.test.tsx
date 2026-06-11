/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { DoctorTodayLeftKpiRow } from "./DoctorTodayLeftKpiRow";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string; className?: string; id?: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

function emptyProps() {
  return {
    intakeCount: 0,
    pendingTestsTotal: 0,
    newIntakeRequests: [],
    unreadConversations: [],
    unreadTotal: 0,
    pendingProgramTests: [],
    pendingProgramTestsTotal: 0,
    pendingProgramTestsTruncated: false,
    proactiveInsights: [],
    proactiveInsightsTotal: 0,
    proactiveInsightsTruncated: false,
    exerciseCommentAttentionItems: [],
    exerciseCommentAttentionTotal: 0,
    exerciseCommentAttentionTruncated: false,
  };
}

describe("DoctorTodayLeftKpiRow", () => {
  it("renders 4 KPI cards with zero values (zeros are informative)", () => {
    render(<DoctorTodayLeftKpiRow {...emptyProps()} />);
    expect(screen.getByRole("link", { name: /Сообщения/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Комментарии/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Заявки/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Тесты/i })).toBeInTheDocument();
  });

  it("Сообщения link points to doctorCommunications route", () => {
    render(<DoctorTodayLeftKpiRow {...emptyProps()} />);
    expect(screen.getByRole("link", { name: /Сообщения/i })).toHaveAttribute(
      "href",
      "/app/doctor/communications",
    );
  });

  it("shows unread count on Сообщения", () => {
    render(<DoctorTodayLeftKpiRow {...emptyProps()} unreadTotal={7} />);
    expect(screen.getByRole("link", { name: /Сообщения/i })).toHaveTextContent("7");
  });

  it("clicking Заявки opens intake dialog", async () => {
    const user = userEvent.setup();
    render(
      <DoctorTodayLeftKpiRow
        {...emptyProps()}
        intakeCount={2}
        newIntakeRequests={[
          {
            id: "i1",
            patientName: "Тест",
            patientPhone: "+7",
            typeLabel: "ЛФК",
            summary: null,
            summaryPreview: null,
            createdAtLabel: "01.01.2026",
            href: "/app/doctor/online-intake/i1",
          },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Заявки/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Тест")).toBeInTheDocument();
  });

  it("clicking Тесты opens pending tests dialog", async () => {
    const user = userEvent.setup();
    render(
      <DoctorTodayLeftKpiRow
        {...emptyProps()}
        pendingTestsTotal={3}
        pendingProgramTestsTotal={3}
        pendingProgramTests={[
          {
            attemptId: "a1",
            patientUserId: "u1",
            patientDisplayName: "Иванова",
            instanceId: "i1",
            instanceTitle: "Программа",
            stageTitle: "Этап",
            pendingCount: 1,
            submittedAtLabel: "01.06.2026",
            href: "/app/doctor/clients/u1",
          },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Тесты/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("clicking Комментарии opens exercise comments dialog", async () => {
    const user = userEvent.setup();
    render(
      <DoctorTodayLeftKpiRow
        {...emptyProps()}
        exerciseCommentAttentionTotal={1}
        exerciseCommentAttentionItems={[
          {
            patientUserId: "u1",
            patientDisplayName: "Клиент",
            instanceId: "inst-1",
            stageItemId: "item-1",
            stageItemTitle: "Приседания",
            latestMessage: {
              id: "m1",
              instanceStageItemId: "item-1",
              patientUserId: "u1",
              senderRole: "patient",
              origin: "patient_observation",
              body: "Боль",
              mediaFileId: null,
              supportMessageId: null,
              createdAt: "2026-06-06T10:00:00.000Z",
            },
            latestMessageAtLabel: "06.06.2026, 13:00",
            href: "/app/doctor/clients/u1/treatment-programs/inst-1",
          },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Комментарии/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Клиент")).toBeInTheDocument();
  });
});
