'use client';

/**
 * Терминология пациента/клиента кабинета для клиентских компонентов doctor-зоны.
 *
 * Источник — та же настройка `patient_label` (scope=doctor), что уже питает меню и заголовки страниц:
 * `loadDoctorWorkspaceShell()` → `DoctorWorkspaceShell` → этот провайдер. Второй настройки терминологии
 * не заводим: резолвер один — `resolvePatientTerms` из `modules/system-settings/patientTerms`.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { resolvePatientTerms, type PatientTerms } from '@/modules/system-settings/patientTerms';

const DoctorPatientTermsContext = createContext<PatientTerms>(resolvePatientTerms());

export function DoctorPatientTermsProvider({
  patientLabel,
  children,
}: {
  patientLabel?: string;
  children: ReactNode;
}) {
  const value = useMemo(() => resolvePatientTerms(patientLabel), [patientLabel]);
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
