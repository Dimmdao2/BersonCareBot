# Платформенные учётные данные телеграма — поля в админке

Решение владельца 20.08, дословно: «секрет я внесу когда дашь мне поля в админке».

## Что сломано сегодня (замерено, не по памяти)

На TEST телеграм-канал мёртв: в `public.outgoing_delivery_queue` за 20.08 — 13 строк с
`last_error='TELEGRAM_RUNTIME_CONFIG_UNAVAILABLE'` (12 `failed_retryable` по 4 попытки, 1 `dead`),
накопленных мёртвых телеграм-строк 116. Почта в тот же день 2/2 отправлено, 0 отказов — канал почты жив.

Причина цепочкой:

1. `apps/integrator/src/integrations/telegram/client.ts:20` бросает `TELEGRAM_RUNTIME_CONFIG_UNAVAILABLE`,
   если `enabled=false`.
2. `enabled` считается как `Boolean(botToken && webhookSecret)`
   (`apps/integrator/src/infra/adapters/integrationRuntimeConfig.ts:45`), источник — только база.
3. В `public.system_settings` на TEST по `key like 'telegram%'` ровно три строки: `telegram_bot_token`,
   `telegram_bot_username`, `telegram_login_bot_username`. Строки `telegram_webhook_secret` нет ни в одном
   scope.
4. Исторически секрет лежал в env; чтение env убрано коммитом `5fb8f28f0`
   («fix(integrator): read provider runtime config from db»), а строку в базу не перенесли. Прод работает
   на старом env — поэтому дефект виден только на TEST. Владелец 20.08: «секрет на тесте в енв нет, он есть
   на проде (это другой сервер со старым енв)».
5. Положить секрет некуда: страница `/app/admin/integrations` состоит из одного блока рубильников
   (`PlatformIntegrationAvailabilitySection.tsx`, 107 строк, единственный ключ
   `platform_integration_availability`), а `/api/platform/settings` принимает строго 15 ключей по белому
   списку `PLATFORM_GLOBAL_SETTINGS_API_KEYS` — телеграмовских среди них нет, схема отвергнет ключ.

В реестре настроек оба ключа УЖЕ объявлены как секреты:
`registry.ts:141-142` — `telegram_bot_token` и `telegram_webhook_secret`,
оба `restricted('admin', 'global', 'secret_envelope')`. Не хватает только пути ввода.

## Чек-лист

- [ ] Блок «Телеграм» на `/app/admin/integrations`: токен бота и секрет вебхука, оба как секреты —
      значение наружу не отдаётся, показывается только признак «задано», ввод перезаписывает.
      Переиспользовать существующий приём для `secret_envelope`, а не заводить второй.
- [ ] `PLATFORM_GLOBAL_SETTINGS_API_KEYS` расширен двумя ключами; нормализация значения — та же, что у
      остальных секретов.
- [ ] GET по `/api/platform/settings` НЕ возвращает сами значения секретов — тест на это.
- [ ] Живая проверка на TEST после внесения владельцем: `enabled` становится true, новые строки очереди
      уходят в `sent`, мёртвые не растут.

## Приёмка

Готово = галочки выше + зелёные целевые тесты + живая проверка владельцем на TEST. «Тесты зелёные» само
по себе не приёмка.
