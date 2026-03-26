/**
 * Сообщения кабинета специалиста («/app/doctor/messages»).
 * Поддержка: чаты с пациентами (webapp) + журнал рассылок.
 */
import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { Badge } from "@/components/ui/badge";
import { AppShell } from "@/shared/ui/AppShell";
import { DoctorSupportInbox } from "./DoctorSupportInbox";
import { NewMessageForm } from "./NewMessageForm";

export default async function DoctorMessagesPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const [entries, clients] = await Promise.all([
    deps.doctorMessaging.listAllMessages(50),
    deps.doctorClients.listClients({}),
  ]);
  const clientNames = new Map(clients.map((c) => [c.userId, c.displayName]));

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
        {entries.length === 0 ? (
          <p className="text-muted-foreground">Сообщений пока нет.</p>
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
      </section>
    </AppShell>
  );
}
