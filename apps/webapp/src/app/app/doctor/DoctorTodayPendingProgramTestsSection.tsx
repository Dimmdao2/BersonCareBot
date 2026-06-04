import Link from "next/link";
import { DoctorEmptyState } from "@/shared/ui/doctor/DoctorEmptyState";
import { DoctorSection, DoctorSectionHeader, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { doctorInlineLinkClass, doctorSectionItemClass } from "@/shared/ui/doctor/doctorVisual";
import type { TodayPendingProgramTestItem } from "./mapPendingProgramTestsForToday";

type Props = {
  items: TodayPendingProgramTestItem[];
  totalAttempts: number;
  truncated: boolean;
};

export function DoctorTodayPendingProgramTestsSection({ items, totalAttempts, truncated }: Props) {
  return (
    <DoctorSection id="doctor-today-section-pending-tests" className="gap-2">
      <DoctorSectionHeader>
        <DoctorSectionTitle>К проверке</DoctorSectionTitle>
        {totalAttempts > 0 ? (
          <p className="text-xs text-muted-foreground" id="doctor-today-pending-tests-count">
            Попыток без оценки: {totalAttempts}
          </p>
        ) : null}
      </DoctorSectionHeader>
      {items.length === 0 ? (
        <DoctorEmptyState>
          <p>Нет тестов, ожидающих оценки</p>
        </DoctorEmptyState>
      ) : (
        <>
          <ul className="m-0 list-none space-y-2 p-0">
            {items.map((item) => (
              <li
                key={item.attemptId}
                id={`doctor-today-pending-test-${item.attemptId}`}
                className={doctorSectionItemClass}
              >
                <p className="font-medium text-foreground">{item.patientDisplayName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {item.instanceTitle} · {item.stageTitle}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.submittedAtLabel} · без оценки: {item.pendingCount}
                </p>
                <p className="mt-2">
                  <Link href={item.href} className={doctorInlineLinkClass}>
                    Оценить
                  </Link>
                </p>
              </li>
            ))}
          </ul>
          {truncated ? (
            <p className="text-xs text-muted-foreground">Показаны первые {items.length} из {totalAttempts}</p>
          ) : null}
        </>
      )}
    </DoctorSection>
  );
}
