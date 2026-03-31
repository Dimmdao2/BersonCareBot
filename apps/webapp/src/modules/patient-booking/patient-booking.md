# patient-booking

Нативный модуль записи пациента на прием.

Модуль инкапсулирует:
- чтение доступных слотов (`BookingSyncPort`, m2m через integrator),
- создание/отмену записи (локально в webapp + синхронизация в Rubitime),
- выдачу списка записей текущего пациента.

Порты модуля находятся в `modules/patient-booking/ports.ts`, инфраструктурные адаптеры — в `infra/repos/*` и `modules/integrator/*`, API-роуты — в `app/api/booking/*`.
