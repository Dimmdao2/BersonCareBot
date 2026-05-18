"use client";

import Link from "next/link";
import { routePaths } from "@/app-layer/routes/paths";
import { cn } from "@/lib/utils";
import {
  patientBodyTextClass,
  patientCardClass,
  patientPrimaryActionClass,
  patientSectionTitleNormalClass,
} from "@/shared/ui/patientVisual";

/** Онлайн-запись на реабилитацию (intake), см. шаг «Реабилитация онлайн» в `/app/patient/booking/new`. */
const DEFAULT_REHAB_REQUEST_HREF = routePaths.intakeLfk;

export function PatientPlanPersonalProgramCtaCard(props: { rehabRequestHref?: string }) {
  const href = props.rehabRequestHref ?? DEFAULT_REHAB_REQUEST_HREF;
  return (
    <div className={cn(patientCardClass, "flex flex-col gap-2 p-3 shadow-sm")}>
      <h2 className={patientSectionTitleNormalClass}>Хочу персональную программу!</h2>
      <p className={cn(patientBodyTextClass, "m-0 text-sm leading-snug text-[var(--patient-text-primary)]")}>
        Получите индивидуальный план тренировок после консультации (доступно очно или онлайн).
      </p>
      <Link
        href={href}
        className={cn(patientPrimaryActionClass, "mt-1 min-h-9 w-full justify-center text-center text-sm font-medium no-underline sm:w-auto sm:self-start")}
      >
        Отправить заявку
      </Link>
    </div>
  );
}
