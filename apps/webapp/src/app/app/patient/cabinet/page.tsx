/**
 * Страница «Мои записи» («/app/patient/cabinet»): записи на приём, виджет Rubitime, история.
 */

import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { hasMessengerBinding, requirePatientAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { getPastAppointments } from "@/modules/appointments/service";
import { AppShell } from "@/shared/ui/AppShell";
import { InfoBlock } from "@/shared/ui/InfoBlock";
import { RubitimeWidget } from "@/shared/ui/RubitimeWidget";
import { PatientBindPhoneSection } from "../PatientBindPhoneSection";
import { AppointmentStatusBadge } from "./AppointmentStatusBadge";
import { CabinetUpcomingAppointments } from "./CabinetUpcomingAppointments";

const CLINIC_ADDRESS_HREF = "https://yandex.ru/maps/";
const PREPARE_HREF = routePaths.patientHelp;

export default async function PatientCabinetPage() {
  const session = await requirePatientAccess(routePaths.cabinet);
  const deps = buildAppDeps();
  const userId = session.user.userId;
  const needsPhone = !session.user.phone?.trim() && !hasMessengerBinding(session);
  const phoneChannel = session.user.bindings.telegramId ? ("telegram" as const) : ("web" as const);
  const phoneChatId = session.user.bindings.telegramId ?? "";

  if (needsPhone) {
    return (
      <AppShell title="Мои записи" user={session.user} backHref={routePaths.patient} backLabel="Меню" variant="patient">
        <InfoBlock className="mb-4">
          Для отображения записей на приём привяжите номер телефона.
        </InfoBlock>
        <PatientBindPhoneSection
          phoneChannel={phoneChannel}
          phoneChatId={phoneChatId}
          nextPath={routePaths.cabinet}
        />
      </AppShell>
    );
  }

  const [appointments, past] = await Promise.all([
    deps.patientCabinet.getUpcomingAppointments(userId),
    Promise.resolve(getPastAppointments(userId)),
  ]);

  return (
    <AppShell title="Мои записи" user={session.user} backHref={routePaths.patient} backLabel="Меню" variant="patient">
      <section className="stack gap-6">
        <div className="flex flex-col items-center gap-2">
          <h2 className="text-center text-base font-semibold">Записаться на приём</h2>
          <RubitimeWidget />
        </div>

        <div className="text-muted-foreground flex flex-col gap-2 text-sm">
          <a
            href={CLINIC_ADDRESS_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary font-medium underline-offset-2 hover:underline"
          >
            Адрес клиники на карте
          </a>
          <a href={PREPARE_HREF} className="text-primary font-medium underline-offset-2 hover:underline">
            Как подготовиться к приёму
          </a>
        </div>

        <div className="stack gap-2">
          <CabinetUpcomingAppointments appointments={appointments} />
        </div>

        <div className="stack gap-2">
          <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">История записей</h2>
          {past.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              История прошедших записей появится после интеграции с системой записи (Rubitime).
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-sm">
                <tbody>
                  {past.map((row, i) => (
                    <tr
                      key={row.id}
                      className={i % 2 === 0 ? "bg-muted/30" : "bg-background"}
                    >
                      <td className="px-3 py-2">{row.occurredAtLabel}</td>
                      <td className="px-3 py-2">{row.label}</td>
                      <td className="px-3 py-2">
                        <AppointmentStatusBadge status={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
