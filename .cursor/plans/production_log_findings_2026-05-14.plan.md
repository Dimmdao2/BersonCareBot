---
name: Production log findings 2026-05-14
overview: "Чеклист проблем из journalctl bersoncarebot-api-prod / webapp-prod (14–15.05.2026): слоты Rubitime, timezone филиалов, HLS/stream, Next Server Actions, operator health, шум systemd/AWS — чтобы не потерять приоритеты."
status: pending
todos:
  - id: hls-controller-double-close
    content: "Webapp: TypeError Controller is already closed (ERR_INVALID_STATE) после playback_resolved — аудит hlsDeliveryProxy + HLS route; защита от double close при AbortSignal/обрыве клиента; тесты route.test"
    status: pending
  - id: next-server-action-mismatch
    content: "Webapp: Failed to find Server Action (x/dx) — выровнять кэш HTML/CDN, единый билд за LB; документировать обход для пользователей после деплоя"
    status: pending
  - id: online-consult-slots-rubitime-misroute
    content: "[prod подтверждено, ожидает решения в инициативе] slots_mapping_not_configured / getSlots failed при онлайн-записи на реабилитацию и нутрициологию — ошибочный вызов Rubitime; канон и работа — docs/ONLINE_CONSULT_REHAB_NUTRITION_BOOKING_INITIATIVE (README + LOG), не настройка rubitime_booking_profiles для этих категорий"
    status: pending
  - id: rubitime-slots-v1-mapping
    content: "Слоты 400 slots_mapping_not_configured для сценариев, где **должен** использоваться Rubitime (очная запись v1 и т.п.) — integrator rubitime_booking_profiles или M2M v2 с ID из каталога"
    status: pending
  - id: rubitime-schedule-malformed
    content: "Слоты 502 RUBITIME_SCHEDULE_MALFORMED_DATA — кейс **пустой массив `[]`** от Rubitime при отсутствии слотов: исправлено в `scheduleNormalizer` (→ 200, пустые slots). Непустой массив / иной shape — по-прежнему снять сырой ответ API и расширить парсер или данные Rubitime"
    status: pending
  - id: rubitime-branch-timezone
    content: "Integrator getBranchTimezone: читать public.booking_branches / public.branches (админка), не integrator.rubitime_branches — сделано в branchTimezone.ts (unified DB)"
    status: completed
  - id: operator-health-rubitime-skip
    content: "Operator probe rubitime skipped_not_configured / no_active_booking_profile — при желании реальной пробы добавить ≥1 активный rubitime_booking_profiles; иначе оставить как ожидаемое и зафиксировать в runbook"
    status: pending
  - id: systemd-143-noise
    content: "Операционно: status=143 при stop/restart — не путать с крашем; мониторить только неожиданные рестарты и pre-SIGTERM ошибки в журнале"
    status: pending
  - id: aws-sdk-node22-warning
    content: "Планирование: AWS SDK предупреждение про Node >=22 с 2027 — заложить апгрейд Node для webapp/integrator в дорожную карту инфраструктуры"
    status: pending
isProject: false
---

# План: найденные по логам prod — список к исправлению

Источник: `journalctl -u bersoncarebot-api-prod` / `bersoncarebot-webapp-prod`, фрагмент 14–15.05.2026.

**Связь:** онлайн-консультации реаб/нутри вне Rubitime — [`docs/ONLINE_CONSULT_REHAB_NUTRITION_BOOKING_INITIATIVE/README.md`](../docs/ONLINE_CONSULT_REHAB_NUTRITION_BOOKING_INITIATIVE/README.md) · журнал [`LOG.md`](../docs/ONLINE_CONSULT_REHAB_NUTRITION_BOOKING_INITIATIVE/LOG.md).

### Статус по онлайн-слотам (реаб / нутри)

| | |
|--|--|
| **Найдено в prod** | да — повторяющиеся `[booking/slots] getSlots failed` / `slots_mapping_not_configured` (журнал webapp 14–15.05.2026) |
| **Ожидает решения** | в инициативе **`ONLINE_CONSULT_REHAB_NUTRITION_BOOKING_INITIATIVE`** (отдельный контур записи, не Rubitime) |
| **Todo в этом плане** | `online-consult-slots-rubitime-misroute` |

## Definition of Done

- По каждому пункту с `pending` либо выполнено исправление/настройка с проверкой, либо явное решение «не делаем / отложено» с записью в теле пункта или в ops-док.
- Критичный баг **HLS Controller closed** закрыт или воспроизведение задокументировано в issue.
- Слоты: исчезли 400/502 на целевых сценариях: **онлайн реаб/нутри** — закрытие по [`ONLINE_CONSULT_REHAB_NUTRITION_BOOKING_INITIATIVE`](../docs/ONLINE_CONSULT_REHAB_NUTRITION_BOOKING_INITIATIVE/README.md); **очная Rubitime** — профили/v2 или явный отказ сценария в UI.

## Контекст в коде (якоря)

| Тема | Где смотреть |
|------|----------------|
| Слоты v1 маппинг | `apps/integrator/src/integrations/rubitime/bookingScheduleMapping.ts`, `db/bookingProfilesRepo.ts`, `recordM2mRoute.ts` |
| Нормализация расписания | `apps/integrator/src/integrations/rubitime/scheduleNormalizer.ts` |
| TZ филиала | `apps/integrator/src/infra/db/branchTimezone.ts` → `public.booking_branches` + `public.branches` |
| HLS прокси | `apps/webapp/src/app-layer/media/hlsDeliveryProxy`, `app/api/media/[id]/hls/[[...path]]/route.ts` |
| Operator probe Rubitime | `apps/integrator/src/app/operatorHealthProbeRunner.ts` |
| Legacy флаг | `apps/integrator/src/integrations/rubitime/LEGACY_BOOKING_PROFILES.md`, `legacyResolveFlag.ts` |

## SQL / хост

Прод-БД: только с преамбулой загрузки env из `docs/ARCHITECTURE/SERVER CONVENTIONS.md` (`set -a && source /opt/env/bersoncarebot/...`).
