# user

Сценарии и шаблоны для обычного пользователя в Telegram: меню, запись на приём, кабинет, дневники, вопросы админу, уведомления. scripts.json, templates.json, menu.json, replyMenu.json.

Флаг **`sendMenuOnButtonPress`** (конфиг Telegram-интегратора): при `true` executor подмешивает строки из **replyMenu.json** к исходящим сообщениям пользователю без своей клавиатуры **только если** в доменном контексте **`linkedPhone === true`** (см. `executor/handlers/delivery.ts`).