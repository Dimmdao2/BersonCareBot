import { cn } from "@/lib/utils";
import { patientListItemClass } from "@/shared/ui/patientVisual";

/**
 * Строки списков на странице программы лечения и на странице этапа (тот же клиентский модуль).
 * Плотнее {@link patientListItemClass}, чтобы не менять глобальный примитив для других экранов пациента.
 */
export const patientTreatmentProgramListItemClass = cn(patientListItemClass, "p-2 lg:p-2.5");
