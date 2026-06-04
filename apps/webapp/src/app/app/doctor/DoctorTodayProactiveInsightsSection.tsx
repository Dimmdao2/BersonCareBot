import Link from "next/link";
import { DoctorEmptyState } from "@/shared/ui/doctor/DoctorEmptyState";
import { DoctorSection, DoctorSectionHeader, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { doctorInlineLinkClass, doctorSectionItemClass } from "@/shared/ui/doctorVisual";
import { proactiveInsightKindLabelRu } from "@/modules/doctor-proactive-insights/computeProactiveInsights";
import type { TodayProactiveInsightItem } from "./mapProactiveInsightsForToday";

type Props = {
  items: TodayProactiveInsightItem[];
  totalCount: number;
  truncated: boolean;
};

export function DoctorTodayProactiveInsightsSection({ items, totalCount, truncated }: Props) {
  return (
    <DoctorSection id="doctor-today-section-proactive-insights" className="gap-2">
      <DoctorSectionHeader>
        <DoctorSectionTitle>Сигналы пациентов</DoctorSectionTitle>
        {totalCount > 0 ? (
          <p className="text-xs text-muted-foreground" id="doctor-today-proactive-insights-count">
            На сопровождении: {totalCount}
          </p>
        ) : null}
      </DoctorSectionHeader>
      {items.length === 0 ? (
        <DoctorEmptyState>
          <p>Нет сигналов по самочувствию и активности программы</p>
        </DoctorEmptyState>
      ) : (
        <>
          <ul className="m-0 list-none space-y-2 p-0">
            {items.map((item) => (
              <li
                key={`${item.kind}-${item.patientUserId}`}
                id={`doctor-today-proactive-${item.kind}-${item.patientUserId}`}
                className={doctorSectionItemClass}
              >
                <p className="font-medium text-foreground">{item.patientDisplayName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {proactiveInsightKindLabelRu(item.kind)} · {item.summary}
                </p>
                <p className="mt-2">
                  <Link href={item.href} className={doctorInlineLinkClass}>
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
    </DoctorSection>
  );
}
