# PWA — backlog (вне первой волны)

Не начинать без отдельной постановки. Связь с техбазой: [BASELINE_STRUCTURE.md](BASELINE_STRUCTURE.md).

| Задача | Примечание |
|--------|------------|
| Посты / фрагменты CMS на главной | Не блокирует фазы 1–3 первой волны. |
| Web Push | **MVP контура** — подписки, patient API, SW `push`/`notificationclick`, напоминания с integrator (M2M) + email по SMTP; детали в [LOG.md](LOG.md). **Хвост:** broadcast врача на web_push/email, FCM, офлайн-кэш. VAPID: [WEB_PUSH_VAPID_ADMIN.plan.md](WEB_PUSH_VAPID_ADMIN.plan.md). |
| Офлайн‑кэш | Высокий риск для RSC/медиа; после push или отдельное решение. |
| Переименование маршрутов `patient` → `client` | Отдельная миграция, не смешивать с PWA. |

## Приоритет backlog (по умолчанию)

1. Уточнения Web Push / почта (broadcast, метрики)
2. Посты / фрагменты CMS на главной
3. Офлайн‑кэш
4. Переименование маршрутов `patient` → `client`
