# B3, круг 3 — fallback origin и манифест

## Итог

`PATIENT_APP_ORIGIN`, если он не задан, теперь получает `APP_BASE_URL` в единственном config-seam
`apps/webapp/src/config/env.ts`. Явно заданный patient origin не меняется. На `platform_admin`
`/manifest.webmanifest` теперь отвечает определённым `404`, а не бросает исключение и не даёт `500`.

## Живой production build и HTTP

Сборка: `NODE_ENV=production ALLOW_DEV_AUTH_BYPASS=false ENV_FILE=apps/webapp/.env.dev /home/dev/brain/host-orch/run-tests.sh "pnpm run build:webapp"`;
`BUILD_ID=2SJtPHxnKbFdNrQih_xgf`. Standalone запущен только на `127.0.0.1:6310`.
Для runtime использован существующий DEV env главного дерева (worktree не хранит игнорируемый `.env.dev`),
без печати секретов; `PATIENT_APP_ORIGIN` в A удалён из окружения.

| Конфигурация | Host | Путь | HTTP / байт |
| --- | --- | --- | --- |
| A: один host, `PATIENT_APP_ORIGIN` unset | `127.0.0.1:6310` | `/app/patient/login` | 200 / 40202 |
| A | тот же | `/app/patient/cabinet` | 307 / 50 |
| A | тот же | `/book` | 200 / 21802 |
| A | тот же | `/book/embed.js` | 200 / 1774 |
| A | тот же | `/join/start` | 200 / 16685 |
| A | тот же | `/clinic-a` | 404 / 15541 (app-level) |
| A | тот же | `/manifest.webmanifest` | 200 / 668 |
| A | тот же | `/maintenance.html` | 200 / 2923 |
| A | тот же | `/api/health` | 200 / 21 (`db: up`) |
| A: platform admin | `admin.127.0.0.1:6310` | `/manifest.webmanifest` | 404 / 0 |

| Конфигурация C: два host | staff `staff.local:6310` | patient `patient.local:6310` |
| --- | ---: | ---: |
| `/app/patient/login` | 404 / 0 | 200 / 40275 |
| `/app/patient/cabinet` | 404 / 0 | 307 / 50 |
| `/book` | 404 / 0 | 200 / 21878 |
| `/book/embed.js` | 404 / 0 | 200 / 1774 |
| `/join/start` | 404 / 0 | 200 / 16761 |
| `/clinic-a` | 404 / 0 | 404 / 15617 (app-level) |
| `/manifest.webmanifest` | 404 / 0 | 200 / 668 |
| `/maintenance.html` | 404 / 0 | 200 / 2923 |
| `/app/doctor/login` | 200 / 40241 | 404 / 0 |
| `/api/health` | 200 / 21 | 200 / 21 |

## Регрессии и проверки

- Новый unit вызывает production `parseWebappEnv()` без `PATIENT_APP_ORIGIN`; явное значение проверено отдельно.
- Инъекция возврата `https://therapygo.ru`: **1 красный из 5** (`envDatabaseRuntime.unit.test.ts`), затем откат; убито 1 из 1, непойманного в этом новом классе 0.
- Route-тест манифеста подтверждает `404` для `platform_admin`.
- Целевые проверки: unit 5/5, route 42/42; `typecheck` и scoped ESLint выполнены. Полный CI приведён после этого отчёта.

## НЕ СДЕЛАНО

- `R-2` (пер-запросный, а не глобальный гейт на общем origin) не трогался: вне B3 по брифу.
- `R-4` не трогался: владелец 22.08 решил не строить отдельное поведение общего host.
- `N-2` остаётся owner question; новый гейт единственности резолвера не добавлялся.
- PROD, TEST, БД, deploy, push и порт 5200 не трогались.
