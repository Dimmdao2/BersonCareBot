/**
 * Сообщения кабинета специалиста («/app/doctor/messages»).
 * Поддержка: чаты с пациентами (webapp) + журнал рассылок.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { Badge } from "@/components/ui/badge";
import { AppShell } from "@/shared/ui/AppShell";
import { DoctorSupportInbox } from "./DoctorSupportInbox";
import { DoctorMessagesLogFilters } from "./DoctorMessagesLogFilters";
import { DoctorMessagesLogPager } from "./DoctorMessagesLogPager";
import { NewMessageForm } from "./NewMessageForm";
import { parseMessagesLogClientId } from "./parseMessagesLogClientId";

const MESSAGES_PATH = "/app/doctor/messages";

type Props = {
  searchParams?: Promise<{
    page?: string;
    pageSize?: string;
    clientId?: string;
    category?: string;
    dateFrom?: string;
    dateTo?: string;
    reset?: string;
  }>;
};

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}

function toIsoOrUndefined(raw: string, endOfDay: boolean): string | undefined {
  if (!raw) return undefined;
  const suffix = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
  const d = new Date(`${raw}${suffix}`);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export default async function DoctorMessagesPage({ searchParams }: Props) {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const params = (await searchParams) ?? {};
  const resetRequested = params.reset === "1";
  const page = parsePositiveInt(params.page, 1);
  const pageSize = Math.min(100, parsePositiveInt(params.pageSize, 20));

  const { clientId: parsedClientId, invalidClientIdPresent } = parseMessagesLogClientId(
    params.clientId,
    resetRequested,
  );
  if (invalidClientIdPresent) {
    const sp = new URLSearchParams();
    if (params.page) sp.set("page", params.page);
    if (params.pageSize) sp.set("pageSize", params.pageSize);
    if (params.category?.trim()) sp.set("category", params.category.trim());
    if (params.dateFrom?.trim()) sp.set("dateFrom", params.dateFrom.trim());
    if (params.dateTo?.trim()) sp.set("dateTo", params.dateTo.trim());
    redirect(sp.size > 0 ? `${MESSAGES_PATH}?${sp.toString()}` : MESSAGES_PATH);
  }
  const clientId = parsedClientId;
  const category = resetRequested ? "" : (params.category ?? "").trim();
  const dateFromRaw = resetRequested ? "" : (params.dateFrom ?? "").trim();
  const dateToRaw = resetRequested ? "" : (params.dateTo ?? "").trim();

  const dateFrom = toIsoOrUndefined(dateFromRaw, false);
  const dateTo = toIsoOrUndefined(dateToRaw, true);

  const [result, clients] = await Promise.all([
    deps.doctorMessaging.listAllMessages({
      page,
      pageSize,
      filters: {
        userId: clientId || undefined,
        category: category || undefined,
        dateFrom,
        dateTo,
      },
    }),
    deps.doctorClients.listClients({}),
  ]);
  const entries = result.items;
  const clientNames = new Map(clients.map((c) => [c.userId, c.displayName]));
  const baseQuery = new URLSearchParams();
  if (clientId) baseQuery.set("clientId", clientId);
  if (category) baseQuery.set("category", category);
  if (dateFromRaw) baseQuery.set("dateFrom", dateFromRaw);
  if (dateToRaw) baseQuery.set("dateTo", dateToRaw);

  return (
    <AppShell title="Сообщения" user={session.user} variant="doctor">
      <DoctorSupportInbox />
      <section id="doctor-messages-new-message-section" className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4 mt-8">
        <h2 className="text-lg font-semibold">Рассылки и журнал</h2>
        <h3 className="text-base font-medium">Новое сообщение</h3>
        <NewMessageForm
          clients={clients.map((c) => ({ userId: c.userId, displayName: c.displayName }))}
        />
      </section>
      <section id="doctor-messages-log-section" className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
        <h3 className="text-base font-medium">Журнал сообщений</h3>
        <DoctorMessagesLogFilters
          clients={clients.map((c) => ({ userId: c.userId, displayName: c.displayName }))}
          selectedClientId={clientId || undefined}
          selectedCategory={category || undefined}
          dateFrom={dateFromRaw || undefined}
          dateTo={dateToRaw || undefined}
          pageSize={pageSize}
        />
        {entries.length === 0 ? (
          <p className="text-muted-foreground">Сообщений по текущим фильтрам пока нет.</p>
        ) : (
          <ul id="doctor-messages-log-list" className="m-0 list-none space-y-3 p-0">
            {entries.map((entry) => (
              <li key={entry.id} id={`doctor-messages-log-item-${entry.id}`} className="rounded-lg border border-border bg-card p-3">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {new Date(entry.sentAt).toLocaleString("ru")} · {entry.category}
                  {entry.outcome === "sent" ? (
                    <Badge variant="secondary" className="ml-1.5 font-normal">
                      доставлено
                    </Badge>
                  ) : entry.outcome === "failed" ? (
                    <Badge variant="destructive" className="ml-1.5 font-normal">
                      ошибка
                    </Badge>
                  ) : (
                    <span className="ml-1.5">{entry.outcome}</span>
                  )}
                </span>
                <p className="mt-1">
                  <Link href={`/app/doctor/clients/${entry.userId}`}>
                    {clientNames.get(entry.userId) ?? entry.userId}
                  </Link>
                  {" — "}
                  {entry.text.slice(0, 100)}
                  {entry.text.length > 100 ? "…" : ""}
                </p>
                {Object.keys(entry.channelBindingsUsed).length > 0 ? (
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground text-xs">
                    Каналы: {Object.keys(entry.channelBindingsUsed).join(", ")}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <DoctorMessagesLogPager page={result.page} pageSize={result.pageSize} total={result.total} baseQuery={baseQuery} />
      </section>
    </AppShell>
  );
}
