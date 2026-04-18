/**
 * Главная миниаппа для пациента с tier patient: предстоящие записи и быстрые ссылки.
 * Браузерный standalone остаётся на прежней разметке {@link PatientHomePage}.
 */

import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { cn } from "@/lib/utils";
import { CabinetActiveBookings } from "@/app/app/patient/cabinet/CabinetActiveBookings";

const cardClass = cn(
  "rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow",
  "block hover:border-primary/30 hover:shadow-md active:scale-[0.98] md:hover:-translate-y-px",
);

type Props = { platformUserId: string };

export async function PatientMiniAppPatientHome({ platformUserId }: Props) {
  const deps = buildAppDeps();
  const [records, appDisplayTimeZone] = await Promise.all([
    deps.patientBooking.listMyBookings(platformUserId),
    getAppDisplayTimeZone(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <section id="patient-miniapp-upcoming" className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Предстоящие записи на приём</h2>
        <CabinetActiveBookings bookings={records.upcoming} appDisplayTimeZone={appDisplayTimeZone} />
      </section>
      <section id="patient-miniapp-quick-links" className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Быстрый доступ</h2>
        <div className="grid grid-cols-2 gap-3">
          <Link href={routePaths.cabinet} className={cardClass} id="patient-miniapp-link-cabinet">
            <span className="text-base font-semibold">Мои записи</span>
            <p className="mt-2 text-sm text-muted-foreground">Приёмы и история</p>
          </Link>
          <Link href={routePaths.diary} className={cardClass} id="patient-miniapp-link-diary">
            <span className="text-base font-semibold">Дневник</span>
            <p className="mt-2 text-sm text-muted-foreground">Симптомы и ЛФК</p>
          </Link>
          <Link href={routePaths.patientReminders} className={cardClass} id="patient-miniapp-link-assistant">
            <span className="text-base font-semibold">Помощник</span>
            <p className="mt-2 text-sm text-muted-foreground">Напоминания</p>
          </Link>
          <Link href={routePaths.patientSectionsIndex} className={cardClass} id="patient-miniapp-link-lessons">
            <span className="text-base font-semibold">Уроки и тренировки</span>
            <p className="mt-2 text-sm text-muted-foreground">Материалы по разделам</p>
          </Link>
          <Link
            href={routePaths.patientTreatmentPrograms}
            className={cardClass}
            id="patient-miniapp-link-treatment-programs"
          >
            <span className="text-base font-semibold">Программы лечения</span>
            <p className="mt-2 text-sm text-muted-foreground">План и тесты</p>
          </Link>
          <Link href={routePaths.patientCourses} className={cardClass} id="patient-miniapp-link-courses">
            <span className="text-base font-semibold">Курсы</span>
            <p className="mt-2 text-sm text-muted-foreground">Каталог программ</p>
          </Link>
        </div>
      </section>
    </div>
  );
}
