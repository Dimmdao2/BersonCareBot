/** @vitest-environment jsdom */

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getClientCategory, PatientsPageClient } from "./PatientsPageClient";
import type { ClientListItem, DoctorDashboardPatientMetrics } from "@/modules/doctor-clients/ports";
import type { PatientListWorkspaceState } from "./patientListWorkspaceState";
import {
  buildPatientListWorkspaceHref,
  parsePatientListWorkspaceState,
  sanitizePatientListReturnHref,
} from "./patientListWorkspaceState";

const routerPushMock = vi.hoisted(() => vi.fn());
const routerRefreshMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock, refresh: routerRefreshMock }),
}));

function client(overrides: Partial<ClientListItem> = {}): ClientListItem {
  return {
    userId: overrides.userId ?? "u1",
    displayName: overrides.displayName ?? "Пациент",
    firstName: overrides.firstName ?? null,
    lastName: overrides.lastName ?? null,
    patronymic: overrides.patronymic ?? null,
    phone: overrides.phone ?? null,
    bindings: overrides.bindings ?? {},
    hasEmail: overrides.hasEmail ?? false,
    hasApp: overrides.hasApp ?? false,
    hasWebPush: overrides.hasWebPush ?? false,
    nextAppointmentLabel: overrides.nextAppointmentLabel ?? null,
    hasAppointmentHistory: overrides.hasAppointmentHistory ?? false,
    lastAppointmentAt: overrides.lastAppointmentAt ?? null,
    activeAppointmentsCount: overrides.activeAppointmentsCount ?? 0,
    activeTreatmentProgram: overrides.activeTreatmentProgram ?? false,
    activeTreatmentProgramInstanceId: overrides.activeTreatmentProgramInstanceId ?? null,
    cancellationsCount: overrides.cancellationsCount ?? 0,
    reschedulesCount: overrides.reschedulesCount ?? 0,
    noShowCount: overrides.noShowCount ?? 0,
    visitedThisCalendarMonth: overrides.visitedThisCalendarMonth ?? false,
    hasConversation: overrides.hasConversation ?? false,
    unreadMessagesCount: overrides.unreadMessagesCount ?? 0,
    unreadExerciseCommentsCount: overrides.unreadExerciseCommentsCount ?? 0,
    isOnSupport: overrides.isOnSupport ?? false,
    hasMemberships: overrides.hasMemberships ?? false,
    hasActiveMemberships: overrides.hasActiveMemberships ?? overrides.hasMemberships ?? false,
    hasExpiredMemberships: overrides.hasExpiredMemberships ?? false,
  };
}

const metrics: DoctorDashboardPatientMetrics = {
  totalClients: 4,
  onSupportCount: 2,
  visitedThisCalendarMonthCount: 0,
  withProgramCount: 0,
  membershipsCount: 0,
  expiredMembershipsCount: 0,
  subscriberCount: 0,
  newCount: 0,
  formerCount: 0,
  cancellationsCount: 0,
  reschedulesCount: 0,
};

const defaultWorkspaceState: PatientListWorkspaceState = {
  q: "",
  segments: [],
  channel: null,
  archivedOnly: false,
  sort: "recent_appointments",
  sortDirection: "desc",
  selectedPatientId: null,
  scrollTop: 0,
};

async function renderPatientsPage(
  clients: ClientListItem[],
  initialFilters: Partial<PatientListWorkspaceState> = {},
) {
  await act(async () => {
    render(
      <PatientsPageClient
        listPromise={Promise.resolve(clients)}
        metricsPromise={Promise.resolve(metrics)}
        initialFilters={{ ...defaultWorkspaceState, ...initialFilters }}
        patientPluralLabel="Клиенты"
        displayIana="Europe/Moscow"
      />,
    );
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/");
});

describe("PatientsPageClient", () => {
  it("shows all organization people by default and keeps factual KPI and channel filters on the desktop right panel", async () => {
    const user = userEvent.setup();
    await renderPatientsPage([
      client({
        userId: "with-appointment-support",
        displayName: "С записью и сопровождением",
        activeAppointmentsCount: 1,
        isOnSupport: true,
      }),
      client({
        userId: "support-only",
        displayName: "Только сопровождение",
        isOnSupport: true,
      }),
      client({
        userId: "appointment-only",
        displayName: "Только запись",
        activeAppointmentsCount: 1,
      }),
      client({
        userId: "subscriber-only",
        displayName: "Подписчик",
      }),
      client({
        userId: "membership-only",
        displayName: "Только абонемент",
        hasMemberships: true,
      }),
    ]);

    const search = await screen.findByRole("searchbox", { name: "Поиск: клиенты" });
    const pageHeader = search.closest("[data-doctor-page-header]");
    expect(pageHeader).not.toBeNull();
    expect(search.closest("[data-doctor-page-header-tabs]")).toHaveClass("w-full");
    expect(pageHeader?.querySelector("[data-doctor-page-header-toolbar]")).toBeNull();
    expect(pageHeader).not.toContainElement(screen.getByRole("button", { name: "Новый визит" }));
    expect(screen.queryByRole("group", { name: "Фильтр: пациенты или все" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Категория клиентов" })).not.toBeInTheDocument();
    expect(screen.getByText("Подписчик")).toBeInTheDocument();
    expect(screen.getByText("Только абонемент")).toBeInTheDocument();
    expect(screen.getByText("Каналы связи")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Фильтр записей" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Фильтр программы упражнений" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Фильтр сопровождения" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Фильтр абонементов" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Пуш-уведомления" })).toBeInTheDocument();
    const allClientsCard = screen.getByRole("button", { name: /^Все клиенты/i });
    expect(allClientsCard.parentElement).toHaveClass("grid-cols-3", "xl:grid-cols-3", "2xl:grid-cols-3");
    expect(screen.getByRole("button", { name: /^Все/i })).toHaveAttribute("aria-pressed", "true");
    const rightPanel = screen.getByText("Каналы связи").closest("section");
    expect(rightPanel).toBeVisible();
    const splitLayout = Array.from(document.querySelectorAll("div")).find((element) => element.className.includes("lg:grid-cols-2"));
    expect(splitLayout).toBeDefined();
    expect(document.getElementById("doctor-patients-card-with-appointment-support")).toHaveClass(
      "px-[var(--doctor-list-inline-padding,18px)]",
      "text-base",
      "font-normal",
    );
    expect(document.getElementById("doctor-patients-card-support-only")).toHaveClass(
      "border-t",
      "border-[var(--doctor-flat-list-divider,#f0efeb)]",
    );
    expect(document.getElementById("doctor-patients-card-support-only")).not.toHaveClass("border-0");
    expect(document.getElementById("doctor-patients-list")).toHaveClass(
      "mx-[var(--doctor-block-padding,18px)]",
    );

    await user.click(screen.getByRole("button", { name: /С записями/i }));

    expect(screen.getByRole("button", { name: /^Все/i })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /С записями/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /С записями/i })).toHaveClass("bg-primary/15", "text-primary");
    expect(screen.getByRole("button", { name: /С записями/i })).not.toHaveClass("bg-destructive/5");

    const supportCard = document.getElementById("doctor-patients-segment-on_support");
    expect(supportCard).not.toBeNull();
    expect(within(supportCard as HTMLElement).getByText("1")).toBeInTheDocument();
    expect(within(supportCard as HTMLElement).getByText("2")).toBeInTheDocument();
    expect(within(supportCard as HTMLElement).getByLabelText("После фильтров: 1")).toBeInTheDocument();
    expect(within(supportCard as HTMLElement).queryByText("/")).not.toBeInTheDocument();
    expect(within(supportCard as HTMLElement).queryByText("всего")).not.toBeInTheDocument();

    expect(screen.getByText("С записью и сопровождением")).toBeInTheDocument();
    expect(screen.getByText("Только запись")).toBeInTheDocument();
    expect(screen.queryByText("Только сопровождение")).not.toBeInTheDocument();

    await user.click(supportCard as HTMLElement);

    expect(screen.getByText("С записью и сопровождением")).toBeInTheDocument();
    expect(screen.queryByText("Только запись")).not.toBeInTheDocument();
    expect(screen.queryByText("Только сопровождение")).not.toBeInTheDocument();

    const appointmentsCard = document.getElementById("doctor-patients-segment-appointments");
    const membershipsCard = document.getElementById("doctor-patients-segment-memberships");
    expect(appointmentsCard).not.toBeNull();
    expect(membershipsCard).not.toBeNull();
    expect(within(appointmentsCard as HTMLElement).getByText("1")).toBeInTheDocument();
    expect(within(appointmentsCard as HTMLElement).getByText("2")).toBeInTheDocument();
  });

  it("separates all-time records, occurred visits, and visit history without future appointments", async () => {
    const user = userEvent.setup();
    await renderPatientsPage([
      client({ userId: "future", displayName: "Только будущая", activeAppointmentsCount: 1 }),
      client({
        userId: "past",
        displayName: "Только прошлый визит",
        hasAppointmentHistory: true,
        lastAppointmentAt: "2026-07-01T09:00:00.000Z",
      }),
      client({
        userId: "both",
        displayName: "Прошлый и будущий",
        hasAppointmentHistory: true,
        lastAppointmentAt: "2026-07-02T09:00:00.000Z",
        activeAppointmentsCount: 1,
      }),
      client({ userId: "none", displayName: "Без записей" }),
    ]);

    expect(screen.getByRole("button", { name: /С визитами/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Новые/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Без будущих/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Бывшие/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /С записями/i }));
    expect(screen.getByText("Только будущая")).toBeInTheDocument();
    expect(screen.getByText("Только прошлый визит")).toBeInTheDocument();
    expect(screen.getByText("Прошлый и будущий")).toBeInTheDocument();
    expect(screen.queryByText("Без записей")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /С записями/i }));
    await user.click(screen.getByRole("button", { name: /С визитами/i }));
    expect(screen.queryByText("Только будущая")).not.toBeInTheDocument();
    expect(screen.getByText("Только прошлый визит")).toBeInTheDocument();
    expect(screen.getByText("Прошлый и будущий")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /С визитами/i }));
    await user.click(screen.getByRole("button", { name: /Без будущих/i }));
    expect(screen.getByText("Только прошлый визит")).toBeInTheDocument();
    expect(screen.queryByText("Прошлый и будущий")).not.toBeInTheDocument();
  });

  it("separates active and expired memberships and filters lifetime cancellations and reschedules", async () => {
    const user = userEvent.setup();
    await renderPatientsPage([
      client({
        userId: "active-membership",
        displayName: "Действующий абонемент",
        hasMemberships: true,
        hasActiveMemberships: true,
      }),
      client({
        userId: "awaiting-membership",
        displayName: "Ожидает оплаты",
        hasMemberships: true,
        hasActiveMemberships: false,
      }),
      client({
        userId: "expired-membership",
        displayName: "Истёкший абонемент",
        hasExpiredMemberships: true,
      }),
      client({ userId: "cancelled", displayName: "Старые отмены", cancellationsCount: 2 }),
      client({ userId: "rescheduled", displayName: "Старые переносы", reschedulesCount: 3 }),
    ]);

    const activeMemberships = screen.getByRole("button", { name: /С абонементами/i });
    await user.click(activeMemberships);
    expect(screen.getByText("Действующий абонемент")).toBeInTheDocument();
    expect(screen.queryByText("Ожидает оплаты")).not.toBeInTheDocument();
    expect(screen.queryByText("Истёкший абонемент")).not.toBeInTheDocument();

    await user.click(activeMemberships);
    await user.click(screen.getByRole("button", { name: /Истёкшие абонементы/i }));
    expect(screen.getByText("Истёкший абонемент")).toBeInTheDocument();
    expect(screen.queryByText("Действующий абонемент")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Истёкшие абонементы/i }));
    await user.click(screen.getByRole("button", { name: /С отменами/i }));
    expect(screen.getByText("Старые отмены")).toBeInTheDocument();
    expect(screen.queryByText("Старые переносы")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /С отменами/i }));
    await user.click(screen.getByRole("button", { name: /С переносами/i }));
    expect(screen.getByText("Старые переносы")).toBeInTheDocument();
    expect(screen.queryByText("Старые отмены")).not.toBeInTheDocument();
  });

  it("filters channel buttons client-side without reloading the list", async () => {
    const user = userEvent.setup();
    await renderPatientsPage([
      client({
        userId: "telegram",
        displayName: "Telegram client",
        bindings: { telegramId: "tg-1" },
      }),
      client({ userId: "push", displayName: "Push client", hasWebPush: true }),
      client({ userId: "plain", displayName: "Plain client" }),
    ]);

    expect(await screen.findByText("Telegram client")).toBeInTheDocument();
    expect(screen.getByText("Push client")).toBeInTheDocument();
    expect(screen.getByText("Plain client")).toBeInTheDocument();
    expect(window.location.search).toBe("");

    await user.click(screen.getByRole("button", { name: "Пуш-уведомления" }));

    expect(screen.queryByText("Telegram client")).not.toBeInTheDocument();
    expect(screen.getByText("Push client")).toBeInTheDocument();
    expect(screen.queryByText("Plain client")).not.toBeInTheDocument();
    expect(window.location.search).toBe("?channel=web_push");
  });

  it("sorts recent occurred appointments first, supports FIO sorting, and preserves search", async () => {
    const user = userEvent.setup();
    await renderPatientsPage([
      client({ userId: "null", displayName: "Яна", lastName: "Яна" }),
      client({
        userId: "same-b",
        displayName: "Борис",
        lastName: "Борис",
        lastAppointmentAt: "2026-07-01T09:00:00.000Z",
      }),
      client({
        userId: "newest",
        displayName: "Вера",
        lastName: "Вера",
        lastAppointmentAt: "2026-07-02T09:00:00.000Z",
      }),
      client({
        userId: "same-a",
        displayName: "Алексей",
        lastName: "Алексей",
        lastAppointmentAt: "2026-07-01T09:00:00.000Z",
      }),
    ]);

    const listIds = () => Array.from(document.querySelectorAll("#doctor-patients-list > li")).map((item) => item.id);
    expect(listIds()).toEqual(["doctor-patients-item-newest", "doctor-patients-item-same-a", "doctor-patients-item-same-b", "doctor-patients-item-null"]);

    const recentSort = screen.getByRole("button", { name: "Недавние: недавние сверху" });
    expect(recentSort).toHaveAttribute("aria-pressed", "true");
    await user.click(recentSort);
    expect(listIds()).toEqual(["doctor-patients-item-same-a", "doctor-patients-item-same-b", "doctor-patients-item-newest", "doctor-patients-item-null"]);

    const fioSort = screen.getByRole("button", { name: "По фамилии: А–Я" });
    await user.click(fioSort);
    expect(listIds()).toEqual(["doctor-patients-item-same-a", "doctor-patients-item-same-b", "doctor-patients-item-newest", "doctor-patients-item-null"]);

    await user.click(screen.getByRole("button", { name: "По фамилии: А–Я" }));
    expect(listIds()).toEqual(["doctor-patients-item-null", "doctor-patients-item-newest", "doctor-patients-item-same-b", "doctor-patients-item-same-a"]);

    await user.type(screen.getByRole("searchbox", { name: "Поиск: клиенты" }), "Вера");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 220));
    });

    expect(listIds()).toEqual(["doctor-patients-item-newest"]);
  });

  it("keeps membership-only classification dormant and shows only approved informational row indicators", async () => {
    await renderPatientsPage([
      client({ userId: "subscriber", displayName: "Подписчик" }),
      client({ userId: "history", displayName: "Только история", hasAppointmentHistory: true }),
      client({ userId: "future", displayName: "Будущая запись", activeAppointmentsCount: 3 }),
      client({ userId: "support", displayName: "Только сопровождение", isOnSupport: true }),
      client({ userId: "program", displayName: "Только программа", activeTreatmentProgram: true }),
      client({
        userId: "program-support",
        displayName: "Программа и сопровождение",
        activeTreatmentProgram: true,
        isOnSupport: true,
      }),
      client({ userId: "membership", displayName: "С абонементом", hasMemberships: true }),
    ]);

    expect(getClientCategory(client({ hasMemberships: true }))).toBe("client");
    expect(screen.getByText("Подписчик")).toBeInTheDocument();

    const historyRow = within(document.getElementById("doctor-patients-item-history") as HTMLElement);
    const futureRow = within(document.getElementById("doctor-patients-item-future") as HTMLElement);
    const supportRow = within(document.getElementById("doctor-patients-item-support") as HTMLElement);
    const programRow = within(document.getElementById("doctor-patients-item-program") as HTMLElement);
    const programSupportRow = within(document.getElementById("doctor-patients-item-program-support") as HTMLElement);
    const membershipRow = within(document.getElementById("doctor-patients-item-membership") as HTMLElement);

    expect(historyRow.queryByLabelText(/Будущие записи/)).not.toBeInTheDocument();
    expect(futureRow.getByLabelText("Будущие записи: 3")).toBeInTheDocument();
    expect(supportRow.getByLabelText("Клиент на сопровождении")).toBeInTheDocument();
    expect(programRow.getByLabelText("Назначенная программа")).toBeInTheDocument();
    expect(programSupportRow.getByLabelText("Клиент на сопровождении")).toBeInTheDocument();
    expect(programSupportRow.queryByLabelText("Назначенная программа")).not.toBeInTheDocument();
    expect(membershipRow.getByLabelText("Есть абонемент")).toBeInTheDocument();
    expect(membershipRow.getByLabelText("Есть абонемент")).not.toHaveClass("bg-muted/40", "border-border/60");

    for (const row of [historyRow, futureRow, supportRow, programRow, programSupportRow, membershipRow]) {
      expect(row.queryByLabelText(/Переписка|История|Telegram|MAX|Телефон|email|приложение/i)).not.toBeInTheDocument();
      const indicatorRail = row.getByLabelText("Статусы клиента");
      expect(indicatorRail).toHaveClass("grid", "w-[5.75rem]", "grid-cols-3");
      expect(indicatorRail.children).toHaveLength(3);
    }

    const combinedRow = programSupportRow.getByLabelText("Статусы клиента");
    expect(combinedRow.children[0]).not.toHaveAttribute("aria-label");
    expect(within(combinedRow.children[1] as HTMLElement).getByLabelText("Клиент на сопровождении")).toBeInTheDocument();
    expect(combinedRow.children[2]).not.toHaveAttribute("aria-label");
  });

  it("shows one structured FIO line without repeating the legacy display name", async () => {
    await renderPatientsPage([
      client({
        userId: "structured-fio",
        displayName: "Старая строка",
        lastName: "Петров",
        firstName: "Иван",
        patronymic: "Сергеевич",
      }),
    ]);

    expect(await screen.findByText("Петров Иван Сергеевич")).toBeInTheDocument();
    expect(screen.queryByText("Старая строка")).not.toBeInTheDocument();
  });

  it("uses the existing preview before opening the standalone full-workspace patient card", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        header: {
          identity: {
            userId: "u1",
            displayName: "Петров Иван",
            firstName: "Иван",
            lastName: "Петров",
            patronymic: null,
            phone: "+79990000001",
            email: "patient@example.com",
            bindings: { telegramId: "123456", maxId: "max-1" },
            hasConversation: true,
            isArchived: false,
            isBlocked: false,
            birthDate: null,
            age: null,
            gender: null,
          },
          support: { isOnSupport: true, startedAt: null, supportMonthsApprox: null },
          lastVisit: null,
          nextAppointment: null,
          totalVisits: 1,
          cancellationsCount: 0,
          reschedulesCount: 0,
          firstVisitDate: null,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await renderPatientsPage([
      client({
        userId: "u1",
        displayName: "Петров Иван",
        firstName: "Иван",
        lastName: "Петров",
        phone: "+79990000001",
        bindings: { telegramId: "123456", maxId: "max-1" },
        hasEmail: true,
        hasApp: true,
        hasWebPush: true,
        hasConversation: true,
        activeAppointmentsCount: 1,
        activeTreatmentProgram: true,
        isOnSupport: true,
        hasMemberships: true,
      }),
    ]);

    expect(screen.getByText("Выберите пациента, чтобы открыть превью")).toBeInTheDocument();
    const patientRow = screen.getByRole("button", { name: /Петров Иван/i });
    expect(patientRow).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: "Закрыть" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Сортировка: клиенты")).toHaveClass(
      "w-full",
      "min-w-0",
      "flex-wrap",
      "lg:w-auto",
      "lg:shrink-0",
    );

    await user.click(screen.getByRole("button", { name: "Фильтры" }));
    expect(screen.getByRole("button", { name: "← Назад" })).toBeInTheDocument();
    expect(screen.getByText("Каналы связи")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "← Назад" }));
    expect(screen.queryByRole("button", { name: "← Назад" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /С записями/i }));
    await user.click(screen.getByRole("button", { name: "По фамилии: А–Я" }));
    await user.type(screen.getByRole("searchbox", { name: "Поиск: клиенты" }), "Петров");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 220));
    });
    const list = document.getElementById("doctor-patients-list") as HTMLUListElement;
    list.scrollTop = 64;
    fireEvent.scroll(list);
    await user.click(patientRow);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/doctor/patients/u1", expect.any(Object)));
    expect(patientRow).toHaveAttribute("aria-pressed", "true");
    const fullCardLink = await screen.findByRole("link", { name: "Открыть карточку" });
    const cardUrl = new URL(fullCardLink.getAttribute("href") ?? "", "https://bersoncare.local");
    expect(cardUrl.pathname).toBe("/app/doctor/patients/u1");
    const returnTo = new URL(cardUrl.searchParams.get("returnTo") ?? "", "https://bersoncare.local");
    expect(returnTo.pathname).toBe("/app/doctor/patients");
    expect(returnTo.searchParams.get("q")).toBe("Петров");
    expect(returnTo.searchParams.get("segments")).toBe("appointments");
    expect(returnTo.searchParams.get("sort")).toBe("fio");
    expect(returnTo.searchParams.get("selected")).toBe("u1");
    expect(returnTo.searchParams.get("scroll")).toBe("64");
  });

  it("restores search, sort, selected preview, and list scroll from the list URL state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ ok: false }) }));
    await renderPatientsPage(
      [client({ userId: "u1", displayName: "Петров Иван", firstName: "Иван", lastName: "Петров" })],
      {
        q: "Петров",
        sort: "fio",
        sortDirection: "asc",
        selectedPatientId: "u1",
        scrollTop: 42,
      },
    );

    expect(screen.getByRole("searchbox", { name: "Поиск: клиенты" })).toHaveValue("Петров");
    expect(screen.getByRole("button", { name: "По фамилии: А–Я" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Петров Иван/i })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(document.getElementById("doctor-patients-list")).toHaveProperty("scrollTop", 42));
    const fullCardLink = await screen.findByRole("link", { name: "Открыть карточку" });
    expect(fullCardLink.getAttribute("href")).toContain("returnTo=");
    expect(window.location.search).toContain("selected=u1");
    expect(window.location.search).toContain("scroll=42");
  });

  it("round-trips only validated list workspace state and rejects non-list return targets", () => {
    const parsed = parsePatientListWorkspaceState({
      q: " Иван ",
      segments: "appointments,on_support,unknown",
      channel: "telegram",
      archived: "true",
      sort: "fio",
      direction: "asc",
      selected: "patient-1",
      scroll: "75",
    });
    const href = buildPatientListWorkspaceHref(parsed);

    expect(href).toBe(
      "/app/doctor/patients?q=%D0%98%D0%B2%D0%B0%D0%BD&segments=appointments%2Con_support&channel=telegram&archived=true&sort=fio&direction=asc&selected=patient-1&scroll=75",
    );
    expect(sanitizePatientListReturnHref(href)).toBe(href);
    expect(sanitizePatientListReturnHref("/app/doctor/patients/patient-1")).toBe("/app/doctor/patients");
    expect(sanitizePatientListReturnHref("https://example.com/app/doctor/patients")).toBe("/app/doctor/patients");
  });

  it("creates a structured walk-in without sending organization or specialist authority", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        visitKind: "walk_in",
        portalStatus: "not_activated",
        client: { id: "created-patient" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await renderPatientsPage([]);

    await user.click(screen.getByRole("button", { name: "Новый визит" }));
    await user.type(screen.getByLabelText("Фамилия"), "Петров");
    await user.type(screen.getByLabelText("Имя"), "Иван");
    await user.type(screen.getByLabelText("Отчество"), "Сергеевич");
    await user.type(screen.getByLabelText("Телефон, если есть"), "+7 999 000-00-00");
    await user.type(screen.getByLabelText("Email, если есть"), "patient@example.com");
    expect(screen.getByLabelText("Дата и время визита")).toHaveAttribute("max");
    await user.click(screen.getByRole("button", { name: "Создать визит" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [, init] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      kind: "walk_in",
      lastName: "Петров",
      firstName: "Иван",
      patronymic: "Сергеевич",
      phone: "+7 999 000-00-00",
      email: "patient@example.com",
    });
    expect(body).not.toHaveProperty("organizationId");
    expect(body).not.toHaveProperty("specialistId");
    expect(routerPushMock).toHaveBeenCalledWith("/app/doctor/patients/created-patient");
  });
});
