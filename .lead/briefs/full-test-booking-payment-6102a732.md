# Тест или взгляд

Это живая функциональная приёмка записи и оплаты на TEST. Формы/list/calendar/status проверяются UI и reload,
денежные/state transitions — только через штатные product actions и Network; внешнюю оплату нельзя объявлять
успешной без реального TEST-provider evidence. Никаких product fixes или UI-shape tests.

# TEST acceptance: appointments, availability horizon and prepayment

## Обязательная коррекция повторного прохода

Предыдущий проход ошибочно нажал одноимённую верхнюю кнопку `Новый клиент` на странице `Сегодня`, а не кнопку
внутри открытой правой панели `Создать запись`. Это доказано его же screenshot: после клика открылась самостоятельная
панель `Новый клиент` с текстом про карточку и визит. В этом проходе локализуй действие внутри DOM-контейнера
открытой панели `Создать запись` и нажимай только её внутреннюю кнопку `Новый клиент`; ожидаемый результат — замена
поля поиска встроенной подформой в той же панели. Верхнюю кнопку страницы не используй в этом сценарии.

Один найденный дефект не завершает проход: продолжи все независимые пункты маршрута, используя существующую запись
или другой штатный UI-путь, когда это не подменяет проверяемое поведение. Останавливай только конкретный зависимый
сценарий, а остальные помечай PASS/FAIL/UNPROVED по фактическому выполнению. Никаких API/DB/webhook-симуляций.

Прочитай карту `AGENTS.md`, затем полностью §1a, §1b, §10a, §16–§17, §21–§22 и §24,
`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`, разделы G–K/L
`docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md`, весь
`docs/_TODO/BOOKING_AVAILABILITY_HORIZON_2026-09-04.md` и финальный PASS/«НЕ СДЕЛАНО» в
`docs/_TODO/APPOINTMENT_PREPAYMENT_CORE_INDEPENDENT_AUDIT_2026-09-06.md`. TEST SHA
`c0690ddaac7d2abcf2f531ac0e585a405589f515`. Используй существующие doctor/patient accounts и данные; отдельные
profiles. Не создавать accounts/clinics. Все временные appointments имеют заметку `ACCEPTANCE c0690ddaa` и после
прохода удаляются/отменяются штатно; перечисли IDs и финальные состояния. PROD не трогать.

## Точные owner-пункты

- `APPT-FORM-01..14`, `APPT-LIST-01..04`, `APPT-DETAIL-01..11`, `CANCEL-01..06`, `PICKER-01..06` — единая
  create/edit форма, корректная prefill/validation, list/calendar/detail/cancel и mobile picker.
- `BAH-01..04` — per-org horizon вместо 14-day hardcode; existing org uses saved value, new-org default 30 дней
  не проверяется созданием fixture.
- `PAY-APPT-05`, `10..12`, `18..20` и финальный prepayment audit: awaiting-payment редактируется/переносится без
  500 и без silent confirm; cash atomic/idempotent гасит expiry; link/QR amount = uncovered required prepayment
  snapshot; duplicate webhook idempotent; expiry releases slot.
- `MONEY-03..12`: единый payment action, только реально доступные QR/link/channels, entitlement hides unavailable.
- Не считать дефектом отсутствие второй ссылки на остаток после уже покрытой предоплаты: `PAY-APPT-06` остаётся
  owner decision. Real provider/webhook/expiry может быть UNPROVED, но не симулируется.

## Механический маршрут

1. Doctor desktop: Schedule list/calendar/working-hours. Создай future appointment existing patient без
   prepayment; проверь required name/new-patient subform без фактического создания нового person, service→duration
   and price, editable duration/price, location/session selectors, optional note. Save, reload list/calendar/detail.
2. Edit той же записи: date/time/duration/service/comment/status; verify one form, reschedule path and detail/list/
   calendar sync. Cancel через second modal, основной comment не заменяется cancellation comment. Удали/оставь
   однозначно cancelled с ID в cleanup.
3. Проверить public booking as patient: available days/slots at the saved horizon boundary and immediately outside
   it. Если безопасно, временно изменить horizon через owner UI, Save+reload/public check, затем вернуть baseline.
   Не создавать новую clinic для проверки default 30.
4. Создай doctor appointments с percentage и full prepayment only if UI exposes normal override. Проверяй price,
   required amount/deadline, awaiting status and occupied slot. Измени/перенеси неоплаченную awaiting запись:
   no 500, остаётся awaiting если requirement uncovered.
5. Из details запроси payment link/QR только если TEST provider настроен; сумма должна равняться uncovered required
   prepayment snapshot, не total. Не отправляй link во внешний канал. Если provider безопасно не настроен —
   UNPROVED с visible reason, не подменять.
6. На одной TEST appointment проверь штатную cash action и повтор того же действия, если UI/API защищает repeat;
   status confirmed/paid, paid amount не удваивается, expiry не отменяет. Не выполнять manual DB write.
7. Patient self-booking with required prepayment и реальный webhook/repeat/expiry выполняй только при безопасном
   TEST-provider/product flow. Иначе каждый подпункт честно UNPROVED. Не вызывай webhook вручную с придуманной
   подписью. Если доступен короткий штатный deadline, можно дождаться foreground и доказать release; не менять
   system clock/DB.
8. Mobile 390×844: create/edit/details/cancel/payment layer/date-time picker/list status. Restore horizon and clean
   all temporary appointments/payment intents через штатные действия; reload proof.

Artifacts: `/home/dev/dev-projects/.lead/runs/test-full-acceptance-c0690ddaa/booking-payment/`.
Отчёт: action, appointment ID, before/after/reload state, screenshot, Network, console, provider limitation,
cleanup. Сначала все findings, без исправлений. Не запускать tests/CI/migration/deploy/server, не менять code.
