'use client';

import type { AppointmentTerms } from '@/modules/system-settings/patientTerms';
import { usePatientTerms } from './PatientOrganizationContext';

/** Любая готовая форма слова, кроме служебного рода: род согласуют `agreeWithAppointment` и соседи. */
export type AppointmentWordForm = Exclude<keyof AppointmentTerms, 'appointmentGender'>;

/**
 * Слово организации о событии записи внутри СЕРВЕРНОЙ разметки кабинета клиента.
 *
 * Серверный компонент не может позвать `usePatientTerms()`, а организацию на его странице никто не
 * резолвит: у `/app/patient/help`, `/app/patient/bind-phone` и заглушек гостя нет ни своего
 * загрузчика настроек, ни идентификатора клиники. Этот лист берёт слово из ЕДИНСТВЕННОГО
 * контекста кабинета (`PatientOrganizationContext`), который слой уже поставил над всем
 * `/app/patient/**`, — новой двери, нового чтения и второго резолвера не появляется.
 *
 * Падеж — параметр, а не отдельный компонент на каждую надпись: формы приходят готовыми из
 * `APPOINTMENT_TERMS_BY_LABEL`, поэтому новая форма в резолвере работает здесь сразу.
 * Вне контекста (гость без организации) остаётся «приём» — сегодняшнее поведение.
 */
export function PatientAppointmentWord({ form }: { form: AppointmentWordForm }) {
  return <>{usePatientTerms()[form]}</>;
}
