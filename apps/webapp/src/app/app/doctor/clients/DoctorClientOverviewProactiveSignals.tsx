"use client";

import Link from "next/link";
import { proactiveInsightKindLabelRu } from "@/modules/doctor-proactive-insights/computeProactiveInsights";
import type { ProactiveInsightRow } from "@/modules/doctor-proactive-insights/types";
import { mapProactiveInsightsForToday } from "../mapProactiveInsightsForToday";
import { doctorClientOverviewSecondaryCardClass, doctorClientSectionTitleClass } from "./doctorClientCardChrome";

type Props = {
  insights: ProactiveInsightRow[];
};

export function DoctorClientOverviewProactiveSignals({ insights }: Props) {
  if (insights.length === 0) return null;

  const items = mapProactiveInsightsForToday(insights);

  return (
    <section id="doctor-client-section-proactive-signals" className={doctorClientOverviewSecondaryCardClass}>
      <h3 className={doctorClientSectionTitleClass}>Сигналы</h3>
      <ul className="m-0 mt-3 list-none space-y-2 p-0">
        {items.map((item) => (
          <li key={`${item.kind}-${item.patientUserId}`} className="rounded-lg border border-border/70 bg-background/40 p-3 text-sm">
            <p className="text-xs text-muted-foreground">
              {proactiveInsightKindLabelRu(item.kind)} · {item.summary}
            </p>
            <p className="mt-2">
              <Link href={item.href} className="text-primary underline underline-offset-2">
                Перейти
              </Link>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
