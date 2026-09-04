import { cn } from '@/lib/utils';
import { AppContentLoading } from '@/shared/ui/AppContentLoading';
import {
  PATIENT_SHELL_CONTAINER_CLASS,
  PATIENT_SHELL_DESKTOP_MAX_CLASS,
  PATIENT_SHELL_MOBILE_MAX_CLASS,
  patientShellMaxWidthDataAttribute,
} from '@/shared/ui/patient/pwaLayoutClasses';

/** Классы из `patient.css` (#app-shell-patient); не дублировать keyframes в route-файлах. */
export const patientShimmerSheenClass = 'patient-shimmer-sheen patient-shimmer-sheen-motion';

/**
 * Плейсхолдер-полоска для pending-состояния **пользовательского действия** (busy-кнопка, отправленный
 * запрос mute). Контентное ожидание — только {@link AppContentLoading}, не эта полоска.
 */
export function PatientShimmerLine({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        patientShimmerSheenClass,
        'h-3.5 w-full max-w-full overflow-hidden rounded-md md:h-4',
        className,
      )}
      aria-hidden
    />
  );
}

/**
 * `loading.tsx` пациентского маршрута: колонка shell (фон, safe-area, ширины) и общий контентный
 * loader по центру. Собственного визуала ожидания не добавляет.
 */
export function PatientRouteLoadingShell() {
  return (
    <div
      id="app-shell-patient"
      {...patientShellMaxWidthDataAttribute()}
      className={cn(
        PATIENT_SHELL_CONTAINER_CLASS,
        'safe-padding-patient',
        PATIENT_SHELL_MOBILE_MAX_CLASS,
        PATIENT_SHELL_DESKTOP_MAX_CLASS,
      )}
      aria-busy="true"
    >
      <AppContentLoading className="flex-1" />
    </div>
  );
}
