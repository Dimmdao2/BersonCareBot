# РЕЕСТР ИНИЦИАТИВ — что активно / ждёт / архив

> Стратегический индекс для оркестратора. Канон процесса — `docs/AGENT_AUTORUN_SCHEME.md`. Входящие — `docs/_INBOX/`.
> **Правило оркестратора:** текущий пул кончился → смотри сюда. Есть ⏳ QUEUED → бери следующую по порядку → в работу. QUEUED пуст → смотри `docs/_INBOX/` → планируй новую (схема §3). Готовую → ✅ ARCHIVED (перенос в `docs/_ARCHIVE/`).
> Статусы: 📥 INBOX (сырьё) · ⏳ QUEUED (спланировано, ждёт) · ▶️ ACTIVE (в работе) · ✅ ARCHIVED.

## ▶️ ACTIVE
| Инициатива | Папка / очередь | Примечание |
|-----------|-----------------|-----------|
| **Round-3 doctor-UI fix wave** | `/home/dev/orch/round3/QUEUE.md` + `REBUILD_PLAN/ACCEPTANCE_ROUND3.md` | Все actionable items ✅ DONE (2026-06-17). BLOCKED-OWNER: ANL-10/11/13 (аналитика charts placement), Q-F5 (PaymentsPanel removal). Дальше без владельца не идём. |
| **Финансы (BIG-07) полный эквайринг** | `docs/ACQUIRING_INTEGRATION/` | Q-F1..F4 ✅ MERGED (provider settings, webhook route, timeline API+UI, pay-link). Q-F5 ⛔ BLOCKED-OWNER (удалить PaymentsPanel из Визиты — гейт: владелец подтверждает новую Финансы вкладку ОК). |
| **Аналитика** | `docs/ANALYTICS_*` | ANL-04+05+07+09+12+14 ✅. ANL-10/11/13 ⛔ BLOCKED-OWNER: подтверждение карточек первич./повторн.; monthly bars chart (отдельная секция vs toggle); branch cards (отдельно vs inline). |

## ⏳ QUEUED (спланировать/добить как инициативы)
_Пусто — все имевшиеся QUEUED инициативы либо выполнены, либо перенесены в ACTIVE (заблокированы)._

## ✅ ARCHIVED (2026-06-17)
| Инициатива | Выполнено | Примечание |
|-----------|-----------|-----------|
| **Страница пациента: SSR + табы load-once** | Q-C5 ✅ 2026-06-17 | Все ~100 client-фетчей убраны, SSR в page.tsx. PAT-01..PAT-05 merged. |
| **Напоминания о записи (Q-R)** | REM-01/04/05 ✅ 2026-06-17 | Настройки специалиста (переключатель + оффсеты) в Settings. Клиентский шаг — defer. |

## 📂 СУЩЕСТВУЮЩИЕ папки инициатив (требуют триажа статуса)
`docs/*_INITIATIVE/` (APP_RESTRUCTURE, BOOKING_REWORK, COURSES, COMMUNICATIONS_MD_V2, …) — оркестратор при простое триажит: что ✅ done → в `docs/_ARCHIVE/`; что ждёт → ⏳ QUEUED сюда.

## 📥 INBOX
Сейчас: см. `docs/_INBOX/` (новые задачи владельца). Пусто = бери из ⏳ QUEUED / ACTIVE-blocked.
