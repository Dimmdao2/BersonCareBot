/**
 * Сообщения кабинета специалиста («/app/doctor/messages»).
 * Журнал отправленных сообщений и форма отправки нового.
 */
import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
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
      <section id="doctor-messages-new-message-section" className="panel stack">
        <h2>Новое сообщение</h2>
        <NewMessageForm
          clients={clients.map((c) => ({ userId: c.userId, displayName: c.displayName }))}
        />
      </section>
      <section id="doctor-messages-log-section" className="panel stack">
        <h2>Журнал сообщений</h2>
        {entries.length === 0 ? (
          <p className="empty-state">Сообщений пока нет.</p>
        ) : (
          <ul id="doctor-messages-log-list" className="list">
            {entries.map((entry) => (
              <li key={entry.id} id={`doctor-messages-log-item-${entry.id}`} className="list-item">
                <span className="eyebrow">
                  {new Date(entry.sentAt).toLocaleString("ru")} · {entry.category}
                  {entry.outcome === "sent" ? (
                    <span className="badge badge--channel" style={{ marginLeft: 6 }}>доставлено</span>
                  ) : entry.outcome === "failed" ? (
                    <span className="badge badge--warning" style={{ marginLeft: 6 }}>ошибка</span>
                  ) : (
                    <span style={{ marginLeft: 6 }}>{entry.outcome}</span>
                  )}
                </span>
                <p style={{ margin: "4px 0 0" }}>
                  <Link href={`/app/doctor/clients/${entry.userId}`}>
                    {clientNames.get(entry.userId) ?? entry.userId}
                  </Link>
                  {" — "}
                  {entry.text.slice(0, 100)}
                  {entry.text.length > 100 ? "…" : ""}
                </p>
                {Object.keys(entry.channelBindingsUsed).length > 0 ? (
                  <span className="eyebrow" style={{ fontSize: "0.75rem" }}>
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
