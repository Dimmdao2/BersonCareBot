/**
 * Страница «Мои записи» («/app/patient/cabinet»): записи на приём, ссылка на виджет Rubitime, история (EXEC I.9–I.10).
 */

import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { CabinetGuestAccess, patientHasPhoneOrMessenger } from "@/shared/ui/patient/guestAccess";
import { getPastAppointments } from "@/modules/appointments/service";
import { AppShell } from "@/shared/ui/AppShell";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AppointmentStatusBadge } from "./AppointmentStatusBadge";
import { CabinetUpcomingAppointments } from "./CabinetUpcomingAppointments";

export default async function PatientCabinetPage() {
  const session = await getOptionalPatientSession();

  if (!session || !patientHasPhoneOrMessenger(session)) {
    return (
      <AppShell
        title="Мои записи"
        user={session?.user ?? null}
        backHref={routePaths.patient}
        backLabel="Меню"
        variant="patient"
      >
        <CabinetGuestAccess session={session} />
      </AppShell>
    );
  }

  const deps = buildAppDeps();
  const userId = session.user.userId;

  const [appointments, past] = await Promise.all([
    deps.patientCabinet.getUpcomingAppointments(userId),
    Promise.resolve(getPastAppointments(userId)),
  ]);

  return (
    <AppShell
      title="Мои записи"
      user={session.user}
      backHref={routePaths.patient}
      backLabel="Меню"
      variant="patient"
    >
      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Link
            href={routePaths.patientBooking}
            className={cn(
              buttonVariants({ variant: "default", size: "default" }),
              "min-h-11 w-full justify-center rounded-lg text-center text-primary-foreground hover:text-primary-foreground active:text-primary-foreground"
            )}
          >
            Записаться на приём
          </Link>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Информация</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <Link
              href={routePaths.patientHelp}
              className="text-primary font-medium underline-offset-2 hover:underline"
            >
              Как подготовиться к приёму
            </Link>
            <Link
              href={routePaths.patientAddress}
              className="text-primary font-medium underline-offset-2 hover:underline"
            >
              Адрес кабинета
            </Link>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2">
          <CabinetUpcomingAppointments appointments={appointments} />
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-muted-foreground text-sm font-semibold uppercase tracking-wide">История записей</h2>
          {past.length === 0 ? (
            <p className="text-muted-foreground text-sm">У вас нет записей.</p>
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
