# PWA — backlog (вне первой волны)

Не начинать без отдельной постановки. Связь с техбазой: [BASELINE_STRUCTURE.md](BASELINE_STRUCTURE.md).

| Задача | Примечание |
|--------|------------|
| Посты / фрагменты CMS на главной | Не блокирует фазы 1–3 первой волны. |
| Web Push | **VAPID в админке** — реализовано ([WEB_PUSH_VAPID_ADMIN.plan.md](WEB_PUSH_VAPID_ADMIN.plan.md), [LOG.md](LOG.md)); **API ответы без приватного ключа** (`hasPrivateKey`), усиленная валидация длин ключей, минимальный SW без перехвата `fetch`. **Полный контур** (подписки, SW `push`, серверная отправка) — отдельная постановка; заглушка **`GET /api/patient/web-push/status`** (501), контракт `apps/webapp/src/modules/web-push/ports.ts`. Ключи только в `system_settings`, не env; см. BASELINE §связка с push. |
| Офлайн‑кэш | Высокий риск для RSC/медиа; после push или отдельное решение. |
| Переименование маршрутов `patient` → `client` | Отдельная миграция, не смешивать с PWA. |

## Приоритет backlog (по умолчанию)

1. Web Push
2. Посты / фрагменты CMS на главной
3. Офлайн‑кэш
4. Переименование маршрутов `patient` → `client`
