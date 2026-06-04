"use client";

import type { ClientProfile } from "@/modules/doctor-clients/service";
import { ClientBookingHistoryPanel } from "./ClientBookingHistoryPanel";
import { DoctorClientMembershipsPanel } from "./DoctorClientMembershipsPanel";
import {
  doctorClientSectionTitleClass,
  doctorClientStackedCardClass,
  doctorClientTabSectionClass,
} from "./doctorClientCardChrome";

type Props = {
  userId: string;
  profile: Pick<
    ClientProfile,
    "upcomingAppointments" | "appointmentHistory" | "appointmentStats" | "symptomTrackings" | "recentSymptomEntries"
  >;
};

export function DoctorClientRecordsTab({ userId, profile }: Props) {
  const { upcomingAppointments, appointmentHistory, appointmentStats, symptomTrackings, recentSymptomEntries } =
    profile;

  const appointmentOptions = [...upcomingAppointments, ...appointmentHistory].map((a) => ({
    id: a.id,
    label: a.label,
  }));

  return (
    <div className="flex flex-col gap-0">
      <section id="doctor-client-section-memberships" className={doctorClientTabSectionClass}>
        <div className="flex flex-col gap-3">
          <h2 className={doctorClientSectionTitleClass}>Абонементы</h2>
          <DoctorClientMembershipsPanel platformUserId={userId} appointments={appointmentOptions} />
        </div>
      </section>

      <section id="doctor-client-section-appointments" className={doctorClientTabSectionClass}>
        <div className="flex flex-col gap-3">
          {upcomingAppointments.length === 0 ? (
            <p className="text-muted-foreground">Нет предстоящих записей.</p>
          ) : (
            <ul id="doctor-client-upcoming-appointments-list" className="m-0 list-none space-y-3 p-0">
              {upcomingAppointments.map((a) => (
                <li
                  key={a.id}
                  id={`doctor-client-upcoming-appointment-${a.id}`}
                  className={doctorClientStackedCardClass}
                >
                  {a.link && /^https?:\/\//i.test(a.link) ? (
                    <a href={a.link} target="_blank" rel="noopener noreferrer">
                      {a.label}
                    </a>
                  ) : (
                    a.label
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Статистика: всего {appointmentStats.total}, отмен за 30 дн.: {appointmentStats.cancellations30d}
          </p>
        </div>
      </section>

      <section id="doctor-client-section-appointment-history" className={doctorClientTabSectionClass}>
        <details className="group">
          <summary className="cursor-pointer list-none text-sm font-medium [&::-webkit-details-marker]:hidden">
            История записей ({appointmentHistory.length})
          </summary>
          <div className="mt-3">
            {appointmentHistory.length === 0 ? (
              <p className="text-muted-foreground">Нет записей в projection.</p>
            ) : (
              <ul id="doctor-client-appointment-history-list" className="m-0 list-none space-y-3 p-0">
                {appointmentHistory.map((row) => (
                  <li key={row.id} className={doctorClientStackedCardClass}>
                    {row.label}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      </section>

      <div className={doctorClientTabSectionClass}>
        <ClientBookingHistoryPanel userId={userId} embedded />
      </div>

      <section id="doctor-client-section-symptoms" className={doctorClientTabSectionClass}>
        {symptomTrackings.length === 0 ? (
          <p className="text-muted-foreground">Нет отслеживаемых симптомов.</p>
        ) : (
          <>
            <p className="text-sm">Симптомы: {symptomTrackings.map((t) => t.symptomTitle).join(", ")}</p>
            {recentSymptomEntries.length > 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Последние записи: {recentSymptomEntries.slice(0, 5).map((e) => `${e.value0_10}`).join(", ")}
              </p>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
