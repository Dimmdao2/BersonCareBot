# Content

Тексты и клавиатуры для каналов (сейчас — Telegram). Реализация типа **WebhookContent** из domain.

**Правило:** domain не импортирует content напрямую — только через тип/порт (WebhookContent). Контент в ядро передаётся адаптером (channels/telegram) при вызове use-case.
