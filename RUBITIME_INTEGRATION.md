Задача (Cursor Agent): привязка Telegram ↔ Rubitime запись через /start <record_id> + request_contact, с отказом при несовпадении телефонов (уникальный phone)

Контекст:
- Уже есть: rubitime_records/rubitime_events, rubitime webhook, normalizePhone, find user by phone, tg notify + sms stub.
- В Telegram сейчас нет полноценного флоу привязки по record_id.
- Требование: телефон уникален. Никаких many-to-one.

Цель:
Добавить сценарий:
1) Пользователь кликает “Получать уведомления в Telegram” → открывает бот по deep-link `https://t.me/<bot>?start=<rubitime_record_id>`
2) Бот просит отправить контакт (request_contact).
3) Бот сравнивает телефон из contact с телефоном в rubitime_records по record_id:
   - совпало → сохранить phone_normalized в telegram_users для этого telegram_id/chat_id
   - не совпало → отказ пользователю + уведомление админу (детали записи и telegram user)

Шаги реализации (каждый шаг отдельным коммитом)

ШАГ 1 — DB/Repo: доступ к rubitime record по id
- В src/db/repos/rubitimeRecords.ts добавить:
  - getRecordByRubitimeId(rubitimeRecordId) -> { rubitimeRecordId, phoneNormalized, payloadJson, recordAt, status } | null
- Тест (если есть паттерн) или покроется на шаге 3.

Commit: feat(db): fetch rubitime record by id

ШАГ 2 — Domain: обработка start-payload (record_id) и запрос контакта
- В domain/usecases/handleMessage.ts (handleStart) добавить ветку:
  - если текст = "/start <payload>" и payload выглядит как rubitime_record_id:
    - вернуть OutgoingAction sendMessage с текстом “Подтвердите телефон” + reply keyboard с кнопкой request_contact
- Важно: request_contact — это telegram-specific. Поэтому:
  - либо в WebhookContent добавить клавиатуру "request_contact"
  - либо в channels/telegram/mapOut поддержать action типа SendMessageAction с флагом requestContactKeyboard
  Выбрать путь с минимальным вмешательством: добавить в content/telegram.ts готовую reply keyboard с request_contact и использовать её через WebhookContent.

Commit: feat(domain): start with record_id triggers phone confirmation request

ШАГ 3 — Channels/Telegram: принять contact и вызывать usecase привязки
- В channels/telegram/mapIn.ts (fromTelegram) обеспечить, что IncomingUpdate включает:
  - message.contact.phone_number (если пришёл contact)
- Добавить usecase в domain (например domain/usecases/linkTelegramByRubitimeRecord.ts):
  - input: { telegramId, chatId, username?, rubitimeRecordId, contactPhone }
  - logic:
    1) normalize contact phone
    2) load rubitime record by rubitimeRecordId (через rubitimeRecords repo)
    3) если нет записи → пользователю “Запись не найдена/устарела” + админу уведомление
    4) если phone_record != phone_contact:
       - пользователю отказ
       - админу уведомление:
         * rubitime_record_id
         * phone_record
         * payload summary (recordAt/service/name если есть)
         * telegram user: telegramId, username, chatId
    5) если совпало:
       - update telegram_users: set phone_normalized = phone_contact for telegramId/chatId
       - пользователю “Уведомления включены”
       - админу (опционально) “Привязка выполнена”
- Важно: enforce уникальность:
  - если phone_normalized уже привязан к другому telegramId → отказ пользователю + админу (конфликт)
  - если telegramId уже имеет другой phone_normalized → обновление по правилам (лучше отказ и админу, чтобы не ломать связь)

Commit: feat(linking): bind telegram user to rubitime record via contact (strict phone match)

ШАГ 4 — Tests
- Тесты уровня domain/usecase + webhook e2e (минимум unit):
  - /start <record_id> → бот просит контакт
  - contact совпал → запись в telegram_users обновляется
  - contact не совпал → отказ user + уведомление admin
  - запись не найдена → корректный ответ + admin
  - конфликт уникальности → отказ + admin

Commit: test(linking): rubitime record link via contact scenarios

Acceptance criteria:
- Deep-link /start <record_id> запускает запрос контакта.
- При совпадении телефонов telegram_users получает phone_normalized.
- При несовпадении телефонов: user получает отказ, admin получает полные детали (record + telegram user).
- Телефон остаётся уникальным, конфликты обрабатываются отказом.
- Все проверки проходят: pnpm typecheck && pnpm lint && pnpm test && pnpm build

Примечание:
- Deep-link формат: https://t.me/bersoncarebot?start=<rubitime_record_id>
- Никаких SMS на этом шаге.