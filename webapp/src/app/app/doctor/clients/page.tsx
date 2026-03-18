/**
 * Список клиентов кабинета специалиста («/app/doctor/clients»).
 */
import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";

export default async function DoctorClientsPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const clients = await deps.doctorClients.listClients({});

  return (
    <AppShell title="Клиенты" user={session.user} titleSmall>
      <section className="panel stack">
        {clients.length === 0 ? (
          <p className="empty-state">Нет клиентов. Список заполняется из платформенных пользователей с ролью «клиент».</p>
        ) : (
          <ul className="list">
            {clients.map((c) => (
              <li key={c.userId} className="list-item">
                <Link href={`/app/doctor/clients/${c.userId}`}>
                  {c.displayName}
                  {c.phone ? ` — ${c.phone}` : ""}
                </Link>
                <span className="eyebrow">
                  {[c.bindings.telegramId && "Telegram", c.bindings.maxId && "MAX"].filter(Boolean).join(", ") || "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
