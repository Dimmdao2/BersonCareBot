/**
 * Список клиентов кабинета специалиста («/app/doctor/clients»).
 */
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { ClientListLink } from "./ClientListLink";
import { ClientProfileCard } from "./ClientProfileCard";
import { ClientsFilters } from "./ClientsFilters";
import { ClientsSearchBar } from "./ClientsSearchBar";

type Props = {
  searchParams: Promise<{
    q?: string;
    telegram?: string;
    max?: string;
    appointment?: string;
    selected?: string;
  }>;
};

export default async function DoctorClientsPage({ searchParams }: Props) {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const params = await searchParams;
  const q = params.q;
  const selected = params.selected;
  const hasTelegram = params.telegram === "1";
  const hasMax = params.max === "1";
  const hasUpcomingAppointment = params.appointment === "1";
  const [clients, selectedData] = await Promise.all([
    deps.doctorClients.listClients({
      search: q?.trim() || undefined,
      hasTelegram: hasTelegram || undefined,
      hasMax: hasMax || undefined,
      hasUpcomingAppointment: hasUpcomingAppointment || undefined,
    }),
    selected
      ? Promise.all([
          deps.doctorClients.getClientProfile(selected),
          deps.doctorMessaging.prepareMessageDraft({ userId: selected }),
          deps.doctorMessaging.listMessageHistory(selected, 10),
        ]).then(([profile, messageDraft, messageHistory]) =>
          profile ? { profile, messageDraft, messageHistory } : null
        )
      : Promise.resolve(null),
  ]);

  const selectedProfile = selectedData?.profile ?? null;
  const selectedMessageDraft = selectedData?.messageDraft ?? null;
  const selectedMessageHistory = selectedData?.messageHistory ?? [];

  return (
    <AppShell title="Клиенты" user={session.user} variant="doctor">
      <div className="master-detail">
        <div className="master-detail__list">
          <section className="panel stack">
            <ClientsSearchBar key={q ?? ""} defaultValue={q} />
            <ClientsFilters
              defaults={{
                telegram: hasTelegram,
                max: hasMax,
                appointment: hasUpcomingAppointment,
              }}
            />
            {clients.length === 0 ? (
              <p className="empty-state">Нет клиентов. Список заполняется из платформенных пользователей с ролью «клиент».</p>
            ) : (
              <ul className="list">
                {clients.map((c) => (
                  <li key={c.userId} className="list-item">
                    <div className="client-row">
                      <div>
                        <ClientListLink userId={c.userId} searchParams={params}>
                          {c.displayName}
                        </ClientListLink>
                        {c.phone ? <span className="eyebrow" style={{ display: "block", marginTop: 2 }}>{c.phone}</span> : null}
                        {c.nextAppointmentLabel ? (
                          <span className="eyebrow" style={{ display: "block", marginTop: 2, color: "#5f6f86" }}>
                            {c.nextAppointmentLabel}
                          </span>
                        ) : null}
                      </div>
                      <div className="client-row__badges">
                        {c.bindings.telegramId ? <span className="badge badge--channel">TG</span> : null}
                        {c.bindings.maxId ? <span className="badge badge--channel">MAX</span> : null}
                        {c.cancellationCount30d > 0 ? (
                          <span className="badge badge--warning">
                            {c.cancellationCount30d} {c.cancellationCount30d === 1 ? "отмена" : "отмены"}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </li>
            ))}
          </ul>
        )}
        </section>
        </div>
        {selectedProfile ? (
          <div className="master-detail__detail">
            <ClientProfileCard
              profile={selectedProfile}
              messageDraft={selectedMessageDraft}
              messageHistory={selectedMessageHistory}
              userId={selected!}
              senderId={session.user.userId}
            />
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
