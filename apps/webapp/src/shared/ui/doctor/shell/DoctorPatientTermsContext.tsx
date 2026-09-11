'use client';

/**
 * Терминология кабинета для клиентских компонентов doctor-зоны: слово о человеке и слово о событии
 * записи.
 *
 * Источник — те же настройки `patient_label` и `appointment_label` (scope=doctor), что уже питают
 * меню и заголовки страниц: `loadDoctorWorkspaceShell()` → `DoctorWorkspaceShell` → этот провайдер.
 * Второго контекста и второго резолвера не заводим: резолвер один — `resolvePatientTerms` из
 * `modules/system-settings/patientTerms`.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { resolvePatientTerms, type PatientTerms } from '@/modules/system-settings/patientTerms';

const DoctorPatientTermsContext = createContext<PatientTerms>(resolvePatientTerms());

export function DoctorPatientTermsProvider({
  patientLabel,
  supportGroupLabel,
  appointmentLabel,
  children,
}: {
  patientLabel?: string;
  supportGroupLabel?: string;
  appointmentLabel?: string;
  children: ReactNode;
}) {
  const value = useMemo(
    () => resolvePatientTerms(patientLabel, supportGroupLabel, appointmentLabel),
    [patientLabel, supportGroupLabel, appointmentLabel],
  );
  return (
    <DoctorPatientTermsContext.Provider value={value}>
      {children}
    </DoctorPatientTermsContext.Provider>
  );
}

export function useDoctorPatientTerms(): PatientTerms {
  return useContext(DoctorPatientTermsContext);
}

/**
 * Вторая строка шапки модалки: «Пациент: Фамилия Имя» или «Клиент: Фамилия Имя».
 * Возвращает `undefined`, когда имени нет — тогда вторая строка не рисуется вовсе.
 */
export function useDoctorPatientSubjectLine(patientName?: string | null): string | undefined {
  const { patientSingularLabel } = useDoctorPatientTerms();
  const name = patientName?.trim();
  return name ? `${patientSingularLabel}: ${name}` : undefined;
}
