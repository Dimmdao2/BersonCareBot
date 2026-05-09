"use client";

import { cn } from "@/lib/utils";
import type { WarmupWeekImpactSummary } from "@/modules/diaries/buildWarmupWeekImpactSummary";
import {
  patientSurfaceInfoClass,
  patientSurfaceNeutralClass,
  patientSurfaceSuccessClass,
  patientSurfaceWarningClass,
} from "@/shared/ui/patientVisual";

function formatDeltaAbsRu(delta: number): string {
  return Math.abs(delta).toFixed(1).replace(".", ",");
}

/** Согласование числа со словом «балл» для среднего по шкале 1–5. */
function ballPhrase(deltaAbs: number): string {
  const formatted = formatDeltaAbsRu(deltaAbs);
  const v = Math.round(deltaAbs * 10) / 10;
  const isWhole = Math.abs(v - Math.round(v)) < 1e-6;
  const n = Math.round(v);
  if (!isWhole) {
    return `${formatted} балла`;
  }
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) {
    return `${formatted} баллов`;
  }
  if (mod10 === 1) {
    return `${formatted} балл`;
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return `${formatted} балла`;
  }
  return `${formatted} баллов`;
}

function bannerCopy(summary: WarmupWeekImpactSummary): string {
  switch (summary.kind) {
    case "no_warmups":
      return "Выполняйте разминки и отмечайте самочувствие одним касанием - вы сами удивитесь, как быстро почувствуете позитивный эффект!";
    case "insufficient_pairs":
      return "Рядом по времени с разминками пока мало отметок самочувствия — сложно оценить их влияние. Когда отметок станет больше, здесь появится среднее изменение.";
    case "improved":
      return `Разминка улучшала ваше самочувствие — в среднем на ${ballPhrase(summary.avgDelta!)} за эту неделю.`;
    case "worse":
      return `По отметкам недели после разминок самочувствие в среднем снижалось на ${ballPhrase(summary.avgDelta!)}. Имеет смысл разобраться в причинах самочувствия и при необходимости скорректировать нагрузку.`;
    case "neutral":
      return "По отметкам недели разминки не показывают заметного изменения самочувствия — можно разобраться в причинах и при необходимости обсудить это с врачом.";
  }
}

function bannerSurfaceClass(summary: WarmupWeekImpactSummary): string {
  switch (summary.kind) {
    case "improved":
      return patientSurfaceSuccessClass;
    case "worse":
      return patientSurfaceWarningClass;
    case "insufficient_pairs":
      return patientSurfaceInfoClass;
    default:
      return patientSurfaceNeutralClass;
  }
}

export function PatientWarmupWeekImpactBanner({ summary }: { summary: WarmupWeekImpactSummary }) {
  const isImproved = summary.kind === "improved";
  return (
    <p
      className={cn(
        bannerSurfaceClass(summary),
        "text-[13px] leading-snug",
        isImproved && "py-2.5 text-[#222]",
      )}
      style={
        isImproved
          ? {
              background:
                "linear-gradient(to bottom left, #b0cf6e 0%, #d6ec92 42%, #f2f7df 100%)",
            }
          : undefined
      }
    >
      {bannerCopy(summary)}
    </p>
  );
}
