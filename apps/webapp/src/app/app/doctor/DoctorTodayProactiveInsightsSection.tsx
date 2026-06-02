import Link from "next/link";
import { proactiveInsightKindLabelRu } from "@/modules/doctor-proactive-insights/computeProactiveInsights";
import type { TodayProactiveInsightItem } from "./mapProactiveInsightsForToday";

type Props = {
  items: TodayProactiveInsightItem[];
  totalCount: number;
  truncated: boolean;
};

export function DoctorTodayProactiveInsightsSection({ items, totalCount, truncated }: Props) {
  return (
    <section
      id="doctor-today-section-proactive-insights"
      className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3"
    >
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold text-foreground">Сигналы пациентов</h2>
        {totalCount > 0 ? (
          <p className="text-xs text-muted-foreground" id="doctor-today-proactive-insights-count">
            На сопровождении: {totalCount}
          </p>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Нет сигналов по самочувствию и активности программы</p>
      ) : (
        <>
          <ul className="m-0 list-none space-y-2 p-0">
            {items.map((item) => (
              <li
                key={`${item.kind}-${item.patientUserId}`}
                id={`doctor-today-proactive-${item.kind}-${item.patientUserId}`}
                className="rounded-lg border border-border/70 bg-background/40 p-3 text-sm"
              >
                <p className="font-medium text-foreground">{item.patientDisplayName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {proactiveInsightKindLabelRu(item.kind)} · {item.summary}
                </p>
                <p className="mt-2">
                  <Link href={item.href} className="text-primary underline underline-offset-2">
                    Открыть карточку
                  </Link>
                </p>
              </li>
            ))}
          </ul>
          {truncated ? (
            <p className="text-xs text-muted-foreground">
              Показаны первые {items.length} из {totalCount}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
