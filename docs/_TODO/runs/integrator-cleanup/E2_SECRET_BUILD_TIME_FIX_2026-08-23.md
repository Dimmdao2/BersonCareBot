# E2 — секрет отписки не исполняется при сборке

Дата: 2026-08-23  
Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, E2  
Статус этого bounded fix: PASS

## Что исправлено

- `createTopicUnsubscribeService` теперь получает ленивый `getSecret`, поэтому создание composition root при
  сборке не проверяет секрет.
- Единый `requireSecret` читает и проверяет секрет непосредственно перед подписью ссылки и перед проверкой
  маркера. Отсутствующее и короткое значение по-прежнему бросают
  `topic_unsubscribe_secret_unavailable`; пустая HMAC-подпись не допускается.
- Публичный маршрут не изменён: его одинаковый ответ для invalid/stale/unknown recipient сохраняет защиту от
  enumeration.

## Поведенческое доказательство

Команда:

```bash
pnpm --dir apps/webapp exec vitest --run src/modules/patient-notifications/topicUnsubscribe.acceptance.test.ts
```

Результат: EXIT=0, 1 файл, 4 теста прошли. Покрыты отсутствующий и короткий секрет для обеих операций,
подписанный рабочий flow и подмена маркера.

Fault injection: из `requireSecret` временно удалён отказ `secret.length < 16`, затем выполнена та же команда.
Результат: EXIT=1, красными стали оба теста отсутствующего/короткого секрета (`2 failed, 2 passed`), первое
красное утверждение — `createUrl` не бросил ошибку. Поломка удалена, отказ восстановлен, финальный прогон выше
зелёный.

## Сборка без секрета

Перед первым полноценным build в свежем worktree собраны обязательные workspace-пакеты, чьи `dist` отсутствовали
после установки зависимостей. После этого выполнено:

```bash
env -u SESSION_COOKIE_SECRET pnpm --dir apps/webapp run build
```

Результат: EXIT=0. Next.js скомпилировал приложение, выполнил TypeScript, собрал page data, сгенерировал 409/409
страниц и синхронизировал standalone assets. `/api/account/security/recovery/confirm` и
`/api/public/notifications/unsubscribe` присутствуют в итоговом route list. Осталось существующее Turbopack-
предупреждение об overly broad NFT trace из `next.config.ts`; оно не связано с E2 и сборку не роняет.

## Проверка соседних мест

Сначала выполнен смысловой поиск:

```bash
node /home/dev/brain/tools/code-search.mjs "route module level process.env secret required throw Error" --repo bcb -k 30
```

Затем точные поиски по `route.ts`, `modules`, `app-layer`, `infra` и `config` для
`SESSION_COOKIE_SECRET`, `INTERNAL_JOB_SECRET`, integrator secrets, `secret_unavailable`, `length < 16` и
module-scope присваиваний `env.*`/`process.env.*`.

Найдено и классифицировано:

- внутренние cron/worker routes читают `env.INTERNAL_JOB_SECRET` внутри `POST` или вызываемого из него
  `authorize`; отсутствие возвращает 503 во время запроса, не при импорте;
- `modules/saas-billing/seatOverageQuote.ts` читает и проверяет `SESSION_COOKIE_SECRET` внутри
  `requireSigningSecret`, вызываемого операцией подписи;
- `modules/auth/clientBootReportRateLimit.ts` читает секрет внутри
  `pseudonymizeClientBootRateLimitKey`, вызываемого на запросе, и без секрета возвращает `null`;
- `config/env.ts` содержит обязательные runtime-проверки session/integrator secrets, но явно пропускает их при
  `NEXT_PHASE=phase-production-build`;
- прямых module-scope чтений перечисленных секретов в `apps/webapp/src/app/**/route.ts` точный поиск не вернул.

Другого случая с тем же достижимым build-time отказом не найдено; соседний код не менялся по границе §24.6.

## Остальные проверки

```bash
pnpm --dir apps/webapp run typecheck
pnpm --dir apps/webapp run lint
```

Обе команды: EXIT=0. Lint оставил 2 существующих warning в
`app/app/doctor/calendar/AppointmentPaymentSection.tsx` (missing hook dependency и `<img>`), ошибок нет.

Full CI, TEST/live-проверка, deploy и push не выполнялись по brief. Поэтому общий пункт E2 в WORK_ORDER остаётся
открытым до milestone-gates, указанных в самом пункте.
