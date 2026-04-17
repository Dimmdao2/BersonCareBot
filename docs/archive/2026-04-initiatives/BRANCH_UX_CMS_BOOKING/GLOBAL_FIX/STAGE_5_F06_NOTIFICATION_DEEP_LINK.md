# Stage 5: F-06 - Deep-link на конкретную заявку

Цель этапа: уведомления в Telegram/MAX должны вести сразу на конкретную карточку online-intake (`requestId`), а не на общий список.

## S5.T01 - Зафиксировать deep-link контракт

**Цель:** закрепить единый формат ссылок.

**Файлы:**

- `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_9_ONLINE_INTAKE.md`
- `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/API_CONTRACT_ONLINE_INTAKE_V1.md`
- `apps/webapp/src/modules/online-intake/intakeNotificationRelay.ts`

**Шаги:**

1. Зафиксировать обязательный `requestId` в ссылке.
2. Зафиксировать формат URL для TG/MAX.
3. Проверить зависимость от `APP_BASE_URL` (bootstrap deploy; см. `API_CONTRACT_ONLINE_INTAKE_V1.md`).

**Тесты:** не требуются (док+contract).

**Критерии готовности:**

- deep-link контракт однозначен.

---

## S5.T02 - Генерация deep-link в notification relay

**Цель:** формировать ссылку на detail view конкретной заявки.

**Файлы:**

- `apps/webapp/src/modules/online-intake/intakeNotificationRelay.ts`
- `apps/webapp/src/modules/online-intake/*`

**Шаги:**

1. Изменить генерацию link: добавить request id.
2. Проверить корректность для всех типов intake.
3. Сохранить backward-safe поведение при missing base URL.

**Тесты:**

- [x] relay builds URL with requestId — `apps/webapp/src/modules/online-intake/intakeNotificationRelay.test.ts` (path с `requestId`, TG/MAX).

**Критерии готовности:**

- каждое новое уведомление содержит deep-link на заявку.

---

## S5.T03 - Обновить шаблоны каналов TG/MAX

**Цель:** убедиться, что оба канала используют новый deep-link.

**Файлы:**

- `apps/integrator/src/content/telegram/user/templates.json`
- `apps/integrator/src/content/max/user/templates.json`

`scripts.json` для этого потока не требуется: текст уведомления целиком формирует webapp и уходит в integrator через relay-outbound; шаблоны `doctor.onlineIntake.notify` держат паритет формата на случай reuse.

**Шаги:**

1. Встроить `requestId`-ссылку в уведомление.
2. Проверить рендер шаблона и escaping.
3. Убедиться, что ссылка не ломает existing message layout.

**Тесты:**

- [x] Ожидаемый URL в исходящем тексте — тот же контракт, что и шаблон: `intakeNotificationRelay.test.ts` (строка «Карточка:» + path с id); паритет ключей TG/MAX — ручной diff шаблонов.

**Критерии готовности:**

- TG и MAX сообщения консистентны по ссылке.

---

## S5.T04 - Проверка doctor routing

**Цель:** переход по ссылке открывает нужную карточку напрямую.

**Файлы:**

- `apps/webapp/src/app/app/doctor/online-intake/*`
- `apps/webapp/src/app/app/doctor/*`

**Шаги:**

1. Проверить/добавить route для details page.
2. Обработать not-found и unauthorized.
3. Подтвердить открытие нужной записи по id.

**Тесты:**

- [x] route opens expected intake request — `apps/webapp/src/app/app/doctor/online-intake/DoctorOnlineIntakeClient.test.tsx` (`initialOpenRequestId`, блок «Заявка по ссылке»).

**Критерии готовности:**

- deep-link воспроизводимо ведет на нужный request.

---

## S5.T05 - Финальный smoke и gate фиксация

**Шаги:**

1. Trigger intake notification.
2. Клик из Telegram и MAX (на задеплоенном стенде — опционально; в CI/gate принимаются автотесты relay + doctor UI, см. `AGENT_EXECUTION_LOG.md`).
3. Проверка открытия правильной карточки.
4. Записать evidence в `AGENT_EXECUTION_LOG.md`.

---

## Audit Gate Stage 5 (обязательный)

`PASS` только если:

1. в уведомлении есть deep-link с `requestId`;
2. переход из TG/MAX открывает конкретную заявку;
3. нет регрессии шаблонов уведомлений;
4. Composer 2 выдал `verdict: pass`.
