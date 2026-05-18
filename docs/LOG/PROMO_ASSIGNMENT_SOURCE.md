# LOG: источник назначения программы + промо по умолчанию

## Решения

- **Один активный инстанс на пациента:** partial unique index в миграции `0072_treatment_program_assignment_source.sql` + retry в `assignTemplateToPatient` для `promo` при `23505` / `SECOND_ACTIVE_TREATMENT_PROGRAM_MESSAGE`.
- **Метрики использования шаблонов/курсов** (`activeTreatmentProgramInstanceCount` и т.п.): в v1 не исключали `promo`/`course` из агрегатов; клиническая нагрузка на шаблон в кабинете врача отделена фильтром `assignment_source = 'doctor'` в `pgDoctorClients` и `onSupportCount`.
- **Напоминание rehab без инстанса:** клиент передаёт `PATIENT_REHAB_PROGRAM_LINKED_PLACEHOLDER`; `POST /api/patient/reminders/create` подставляет id активного плана или вызывает `ensureDefaultPromoProgramForPatient`.
- **Транзакции (v1):** завершение активного `promo` при врачебном `assignTemplateToPatient` и цепочка «материализация промо → действие пациента» выполняются **последовательными** вызовами порта/сервиса, а не одной обёрткой `db.transaction` на весь сценарий. Согласованность «один active» обеспечивает БД (partial unique) и повторное чтение при коллизии. Объединение шагов в одну SQL-транзакцию — отдельный техдолг, если понадобится строгая атомарность при сбоях между шагами.
- **Покрытие тестами:** contract-тест на фильтр `assignment_source = 'doctor'` в `pgDoctorClients.ts`; `instance-service.test.ts` — авто-complete промо при назначении врача, параллельный `ensureDefaultPromoProgramForPatient`, отсутствие ключа промо; `reminders/create/route.test.ts` — placeholder `rehab_program` + ensure / существующий active; `courses/service.test.ts` — `assignmentSource: "course"` при enroll.

## Вынесено из v1

- Смена глобального промо-шаблона: уведомление пациентам, согласие, миграция существующих виртуальных/инстансных связей и напоминаний — отдельная постановка.
