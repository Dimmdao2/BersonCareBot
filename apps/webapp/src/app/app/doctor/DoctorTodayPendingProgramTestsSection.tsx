import Link from "next/link";
import type { TodayPendingProgramTestItem } from "./mapPendingProgramTestsForToday";

type Props = {
  items: TodayPendingProgramTestItem[];
  totalAttempts: number;
  truncated: boolean;
};

export function DoctorTodayPendingProgramTestsSection({ items, totalAttempts, truncated }: Props) {
  return (
    <section
      id="doctor-today-section-pending-tests"
      className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3"
    >
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold text-foreground">К проверке</h2>
        {totalAttempts > 0 ? (
          <p className="text-xs text-muted-foreground" id="doctor-today-pending-tests-count">
            Попыток без оценки: {totalAttempts}
          </p>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Нет тестов, ожидающих оценки</p>
      ) : (
        <>
          <ul className="m-0 list-none space-y-2 p-0">
            {items.map((item) => (
              <li
                key={item.attemptId}
                id={`doctor-today-pending-test-${item.attemptId}`}
                className="rounded-lg border border-border/70 bg-background/40 p-3 text-sm"
              >
                <p className="font-medium text-foreground">{item.patientDisplayName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {item.instanceTitle} · {item.stageTitle}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.submittedAtLabel} · без оценки: {item.pendingCount}
                </p>
                <p className="mt-2">
                  <Link href={item.href} className="text-primary underline underline-offset-2">
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
    </section>
  );
}
