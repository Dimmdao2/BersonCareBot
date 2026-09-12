import { cache } from 'react';
import { getPatientRuntimeValue } from './configAdapter';
import { resolvePatientTerms, type AppointmentTerms } from './patientTerms';

/**
 * Слово организации о событии записи (`appointment_label`) готовыми падежными формами — для путей,
 * где текст сообщения собирается на сервере и контекста кабинета нет: уведомления о создании,
 * переносе и отмене записи (`patient-booking/patientMessageText.ts`).
 *
 * Второго резолвера и второго хранилища здесь нет: формы отдаёт тот же `resolvePatientTerms`, а
 * значение приходит той же дверью, которую открыл T-A, — seam `app.read_authenticated_runtime_setting`
 * (`configAdapter` → `runtimeConfig.getAuthenticatedString`). Отдельная функция — по образцу
 * соседнего `appDisplayTimezone.ts`: ключ один, читателей у него несколько.
 *
 * Читается ТОЛЬКО этот ключ: `patient_label` в текстах уведомлений не произносится (там, где стоит
 * литерал «Пациент», это подстановка вместо ОТСУТСТВУЮЩЕГО имени контакта, а не слово о роли), и
 * лишний вопрос базе на каждое событие записи ему не нужен.
 *
 * ⛔ Дверь открыта НЕ всякому принципалу, и это измерено живьём на DEV 12.09.2026:
 *   - принципал персонала (`/api/doctor/**`) — читает;
 *   - принципал пациента (`/api/booking/create`, `/cancel`, `/reschedule`, а также публичная запись:
 *     `createVerifiedPublicBooking` оборачивает создание в `withPatientOrganizationPrincipal`) — читает;
 *   - ОРГАНИЗАЦИОННЫЙ принципал (вебхук эквайринга, M2M-маршруты интегратора — web-push и
 *     материализация напоминаний) — `Missing declared webapp port capability: tenant_service`.
 *     Ему объявлены только именованные корни класса `tenant_service`, а этот seam требует
 *     аттестованную роль `app_patient`/`app_staff`. Звать отсюда под ним нельзя: такой путь
 *     остаётся на платформенном «приёме», как публичная запись в T-E.
 *
 * N2 (аудит T-F): `react.cache` живёт ровно один серверный запрос, как у соседнего
 * `getAppDisplayTimeZone()`. Без него один запрос спрашивал базу на КАЖДОЕ событие записи, включая
 * `booking.cancelled` (где слово в текст не попадает), и дважды в ветке предоплаты `canonicalCreate`.
 */
export const readOrganizationAppointmentTerms = cache(
  async (organizationId: string): Promise<AppointmentTerms> => {
    return resolvePatientTerms({
      appointmentLabel: await getPatientRuntimeValue('appointment_label', organizationId),
    });
  },
);
