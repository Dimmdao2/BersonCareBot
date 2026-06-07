# PWA — дорожная карта (индекс)

Краткий указатель: детальные планы вынесены **в отдельные файлы по фазам**. Общие принципы, scope и DoD первой волны — в **[фазе 0](PHASE_00_PRINCIPLES_AND_SCOPE.md)**.

## Планы по этапам

| Этап | Файл | Статус |
|------|------|--------|
| 0 — принципы, границы, DoD, порядок работ | [PHASE_00_PRINCIPLES_AND_SCOPE.md](PHASE_00_PRINCIPLES_AND_SCOPE.md) | done |
| 1 — лендинг на `/` | [PHASE_01_ROOT_LANDING.md](PHASE_01_ROOT_LANDING.md) | done |
| 2 — установка (Chrome + iOS + SW при необходимости) | [PHASE_02_INSTALL_FLOW.md](PHASE_02_INSTALL_FLOW.md) | done |
| 3 — аудит manifest после лендинга | [PHASE_03_MANIFEST_AUDIT.md](PHASE_03_MANIFEST_AUDIT.md) | done |
| 4 — Web Push: VAPID в админке (`system_settings`) | [WEB_PUSH_VAPID_ADMIN.plan.md](WEB_PUSH_VAPID_ADMIN.plan.md) | done |
| Backlog | [BACKLOG.md](BACKLOG.md) | backlog |
| 5 — Staff PWA + staff web push (кабинет врача, BersonAdmin) | [WAVE2_STAFF_PWA.md](../DOCTOR_PATIENT_PWA_SPLIT_INITIATIVE/WAVE2_STAFF_PWA.md) · [archive plan](../.cursor/plans/archive/doctor_patient_pwa_split_wave2.plan.md) | **done** (2026-06-07) |

Код первой волны (patient) (фазы 1–3) и **фаза 4** (ключ `web_push_vapid`, PATCH, UI настроек, `getWebPushVapidKeyPair`) в репозитории **done**. Однократная генерация пары VAPID и ввод в админку на стенде/проде — у оператора (см. план §1.1). Чекбоксы **на стенде** для фаз 1–3 — в [`PHASE_00`](PHASE_00_PRINCIPLES_AND_SCOPE.md) («Верификация на стенде») и в ручных § фаз 1–3.

## Остальные материалы инициативы

- [README.md](README.md) — вход в папку
- [BASELINE_STRUCTURE.md](BASELINE_STRUCTURE.md) — снимок стека до SW/push
- [LOG.md](LOG.md) — журнал исполнения
