# PWA — backlog (вне первой волны)

Не начинать без отдельной постановки. Связь с техбазой: [BASELINE_STRUCTURE.md](BASELINE_STRUCTURE.md).

| Задача | Примечание |
|--------|------------|
| ~~**Фаза 5 — Staff PWA + блок чужих зон + staff push**~~ | **done** 2026-06-07 — [`DOCTOR_PATIENT_PWA_SPLIT_INITIATIVE`](../DOCTOR_PATIENT_PWA_SPLIT_INITIATIVE/README.md) волна 2 §A+§B+§C ([`WAVE2_STAFF_PWA.md`](../DOCTOR_PATIENT_PWA_SPLIT_INITIATIVE/WAVE2_STAFF_PWA.md), [`ACCEPTANCE_WAVE2.md`](../DOCTOR_PATIENT_PWA_SPLIT_INITIATIVE/ACCEPTANCE_WAVE2.md), commit `290df2ba`). |
| Посты / фрагменты CMS на главной | Не блокирует фазы 1–3 первой волны. |
| Web Push | **MVP контура** — подписки, patient API, SW `push`/`notificationclick`, напоминания с integrator (M2M) + email по SMTP; детали в [LOG.md](LOG.md). **Хвост:** broadcast врача на web_push/email, FCM, офлайн-кэш. VAPID: [WEB_PUSH_VAPID_ADMIN.plan.md](WEB_PUSH_VAPID_ADMIN.plan.md). |
| Офлайн‑кэш | Высокий риск для RSC/медиа; после push или отдельное решение. |
| Переименование маршрутов `patient` → `client` | Отдельная миграция, не смешивать с PWA. |

## Приоритет backlog (по умолчанию)

Фаза 5 (Staff PWA + staff push) снята с backlog — реализована в DOCTOR_PATIENT_PWA_SPLIT волна 2.

1. Уточнения Web Push / почта (broadcast, метрики)
2. Посты / фрагменты CMS на главной
3. Офлайн‑кэш
4. Переименование маршрутов `patient` → `client`
