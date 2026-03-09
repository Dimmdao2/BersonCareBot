# Отчет по диагностике Telegram callback-сценариев (BersonCareBot)

## Цель
Диагностировать причину зависания действий Telegram callback (например, `notifications.toggle.*`, `bookings.show`) на этапе "Loading..." и проверить корректность передачи параметров (`chatId`, `messageId`, `callbackQueryId`) по всему пайплайну обработки событий.

## Ход работы
1. **Добавлено логирование параметров callback**
    - В функцию `mapBodyToIncoming` (webhook Telegram) добавлены логи для всех параметров callback.
2. **Добавлено логирование в orchestrator**
    - В функции `buildPlan` и `toPlanStep` (`src/kernel/orchestrator/resolver.ts`) добавлены логи входных параметров, переменных и шагов сценария.
3. **Выполнен git push изменений**
    - Все изменения закоммичены и отправлены в репозиторий.
4. **Симуляция событий**
    - С помощью curl отправлены тестовые callback-события с корректным секретом.
    - Пример отправленного события:
       - Тип: POST /webhook/telegram
       - Параметры callback:
          - chatId: 2222
          - messageId: 3333
          - channelUserId: 1111
          - action: notifications.toggle.spb
          - callbackQueryId: cb-1
          - updateId: 123456
       - Пример тела запроса:
          ```json
          {
             "update_id": 123456,
             "callback_query": {
                "id": "cb-1",
                "from": { "id": 1111, "first_name": "Test User" },
                "message": { "message_id": 3333, "chat": { "id": 2222 } },
                "data": "notifications.toggle.spb"
             }
          }
          ```
5. **Проверка логов**
    - Проанализированы логи `/tmp/bot.log` для всех этапов обработки событий.
    - Логирование происходило на этапах:
       - [telegram][mapBodyToIncoming] — входящие параметры callback
       - [orchestrator][buildPlan] — входные данные, базовые переменные, переменные после запросов
       - [orchestrator][toPlanStep] — параметры каждого шага сценария
       - [orchestrator][buildPlan] — интерполированные шаги
    - Примеры логов:
       - Входящие параметры:
          ```
          [telegram][mapBodyToIncoming] callback params: { chatId: 2222, messageId: 3333, channelUserId: 1111, action: 'notifications.toggle.spb', callbackQueryId: 'cb-1' }
          ```
       - buildPlan input:
          ```
          [orchestrator][buildPlan] input: { ... "chatId": 2222, "messageId": 3333, ... "action": "notifications.toggle.spb", "callbackQueryId": "cb-1" ... }
          ```
       - toPlanStep шаги:
          ```
          [orchestrator][toPlanStep] step 0 action: notifications.toggle params: { channelUserId: 1111, toggleKey: 'notify_toggle_spb' }
          [orchestrator][toPlanStep] step 1 action: message.edit params: { chatId: 2222, messageId: 3333, ... }
          [orchestrator][toPlanStep] step 2 action: callback.answer params: { callbackQueryId: 'cb-1' }
          ```
       - Интерполированные шаги:
          ```
          [orchestrator][buildPlan] step 0 interpolated: { kind: 'notifications.toggle', payload: { channelUserId: 1111, toggleKey: 'notify_toggle_spb' } }
          [orchestrator][buildPlan] step 1 interpolated: { kind: 'message.edit', payload: { chatId: 2222, messageId: 3333, ... } }
          [orchestrator][buildPlan] step 2 interpolated: { kind: 'callback.answer', payload: { callbackQueryId: 'cb-1' } }
          ```
    - На каждом этапе параметры сохранялись корректно, потерь не обнаружено.
    - На выходе orchestrator формируются шаги с ожидаемыми параметрами.
    - Ошибки возникали только на этапе обращения к БД (getaddrinfo EAI_AGAIN base), что не влияло на сохранность параметров callback.

## Результаты
- Все параметры callback (`chatId`, `messageId`, `callbackQueryId`, `action`) корректно проходят через все этапы пайплайна:
   - Входящие параметры фиксируются в mapBodyToIncoming.
   - В orchestrator (buildPlan, toPlanStep) параметры сохраняются и корректно интерполируются в каждый шаг.
   - На выходе orchestrator формируются шаги с ожидаемыми параметрами.
- Потерь параметров или ошибок на этапе orchestrator не обнаружено.
- Ошибки подключения к БД (`getaddrinfo EAI_AGAIN base`) присутствуют, но не влияют на обработку и передачу callback-параметров.

## Выводы и рекомендации
- Проблема "Loading..." не связана с потерей параметров в пайплайне.
- Следующий шаг: устранить ошибки подключения к БД для полноценного завершения сценариев.
- Логирование оставить для дальнейшей диагностики.

---
Дата: 07.03.2026
Исполнитель: GitHub Copilot
