---
name: Production log findings 2026-05-14
overview: "Чеклист journalctl webapp/api prod (14–15.05.2026): закрыт 2026-06 — HLS, Rubitime/онлайн, ops (143, Server Actions, Node/AWS backlog)."
status: completed
todos:
  - id: hls-controller-double-close
    content: "Webapp: TypeError Controller is already closed (ERR_INVALID_STATE) после playback_resolved — аудит hlsDeliveryProxy + HLS route; защита от double close при AbortSignal/обрыве клиента; тесты route.test"
    status: completed
  - id: next-server-action-mismatch
    content: "Закрыто: prod curl — HTML no-store, static immutable; 143-рестарты штатные; x/dx — в основном боты; cutover — позже Docker blue/green; после деплоя — F5 вкладки"
    status: completed
  - id: online-consult-slots-rubitime-misroute
    content: "Отменено: автозапись онлайн реаб/нутри не делаем — только обращение/запрос; отдельный контур слотов не планируется (см. LOG инициативы ONLINE_CONSULT)"
    status: cancelled
  - id: rubitime-slots-v1-mapping
    content: "Отменено: Rubitime и маппинг проработаны в BOOKING_REWORK / prod; пункт из логов 14.05 не актуален"
    status: cancelled
  - id: rubitime-schedule-malformed
    content: "Закрыто: пустой `[]` → 200 в scheduleNormalizer; остальное — по факту не воспроизводится, Rubitime-слоты закрыты"
    status: completed
  - id: rubitime-branch-timezone
    content: "Integrator getBranchTimezone: читать public.booking_branches / public.branches (админка), не integrator.rubitime_branches — сделано в branchTimezone.ts (unified DB)"
    status: completed
  - id: operator-health-rubitime-skip
    content: "Отменено: не баг — синтетическая health-проба integrator; skipped при отсутствии активного профиля, ok при успешном get-schedule (см. operatorHealthProbeRunner.ts)"
    status: cancelled
  - id: systemd-143-noise
    content: "Закрыто: prod journalctl 14 дней — все webapp 143 только Stopping→Started (деплой); не алертить; journalctl -p err webapp/api пусто"
    status: completed
  - id: aws-sdk-node22-warning
    content: "Закрыто: корень монорепо engines node>=22; предупреждение AWS SDK к 2027 — отслеживать в docs/TODO.md §деплой/инфра при планировании хоста"
    status: completed
isProject: false
---

# План: найденные по логам prod — список к исправлению

**Статус: закрыт (2026-06).** Источник: `journalctl` `bersoncarebot-webapp-prod` / `bersoncarebot-api-prod`, фрагмент 14–15.05.2026.

## Definition of Done

- [x] Все пункты `todos` — `completed` или `cancelled` с записью в content.
- [x] HLS Controller closed — код + тесты.
- [x] Prod-проверка кэша и 143 (июнь 2026, хост).

## Rubitime и онлайн реаб/нутри (2026-06)

| Пункт | Решение |
|--------|---------|
| Онлайн реаб / нутри | Не делаем автозапись — только запрос пациента. |
| v1-мапинг / слоты Rubitime | BOOKING_REWORK; пункт снят. |
| `RUBITIME_SCHEDULE_MALFORMED` | Пустой `[]` в коде; далее не ведётся. |
| Operator probe | Ожидаемый skip без активного профиля — не баг. |

Журнал: [`docs/ONLINE_CONSULT_REHAB_NUTRITION_BOOKING_INITIATIVE/LOG.md`](../../docs/ONLINE_CONSULT_REHAB_NUTRITION_BOOKING_INITIATIVE/LOG.md).

## Ops: кэш, 143, Server Actions (закрыто 2026-06, prod)

| Пункт | Решение |
|--------|---------|
| **Кэш HTML / CDN** | `curl` на prod: `/app` — `no-store`; chunks — `immutable`. nginx `proxy_cache` на webapp не найден. Срочных действий нет. |
| **status=143** | За 14 дней: только цепочка `Stopping` → `status=143` → `Started` (рестарты при деплое). `Failed with result exit-code` при SIGTERM — норма. Не мониторить как crash. |
| **Server Action x/dx** | Постоянный шум в journal (боты/сканеры); не смешение билдов за CDN. После деплоя — полное обновление вкладки. Улучшение cutover — **Docker blue/green** (отдельная задача). |
| **Node 22 / AWS SDK** | В репо `package.json` уже `"node": ">=22"`. Напоминание AWS SDK 2027 — [`docs/TODO.md`](../../docs/TODO.md) (деплой webapp / инфра). |

Проверки на хосте (шаблон): [`deploy/HOST_DEPLOY_README.md`](../../deploy/HOST_DEPLOY_README.md) → «Кэширование (Next.js)», «Журнал webapp: 143 и Server Actions»; `journalctl -u bersoncarebot-webapp-prod.service` + grep `Stopping|status=143`.

## Вне этого плана (не закрывали здесь)

При разборе journal за май–июнь 2026 зафиксированы отдельно (по желанию): scheduler `status=1` (22–23.05), SQL `reminder_occurrence_history` (28.05), merge `user_subscriptions` (31.05), `ChunkLoadError` при деплое (28.05).

## Якоря в коде

| Тема | Где смотреть |
|------|----------------|
| Слоты / Rubitime | BOOKING_REWORK, `recordM2mRoute.ts` |
| HLS | `hlsDeliveryProxy`, HLS route |
| Operator probe | `operatorHealthProbeRunner.ts` |
| Server Actions / деплой | [`docs/TODO.md`](../../docs/TODO.md), [`deploy/HOST_DEPLOY_README.md`](../../deploy/HOST_DEPLOY_README.md) |

## SQL / хост

Прод-БД: преамбула env — [`docs/ARCHITECTURE/SERVER CONVENTIONS.md`](../../docs/ARCHITECTURE/SERVER CONVENTIONS.md).
