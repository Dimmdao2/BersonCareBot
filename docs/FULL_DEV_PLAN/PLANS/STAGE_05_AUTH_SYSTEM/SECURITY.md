# Этап 5: заметки по безопасности

## Реализовано

| Мера | Где |
|------|-----|
| PIN только как argon2id-хэш | `user_pins`, `pinHash.ts` |
| Zod на входах auth API | `check-phone`, `pin/login`, `pin/set`, `messenger/*`, `oauth/start` |
| Блокировка PIN после 5 попыток / 15 мин | `pinAuth.ts`, `user_pins` |
| Идемпотентный `messenger/poll` | `session_issued_at` (миграция `021`), `resumed` |
| Rate limit | `check-phone`, `messenger/start`, `pin/set` (in-memory в одном процессе) |
| Единый ответ при ошибке входа по PIN | `POST /api/auth/pin/login`: `401` + `invalid_credentials` для несуществующего номера, нет PIN и неверного PIN; `attemptsLeft` только при неверном PIN у пользователя с PIN; `423` lockout при блокировке |
| Тестовый хелпер `__testConfirmLoginTokenByHash` | только при `NODE_ENV === 'test'` |

## Ограничения / осознанные риски

| Риск | Комментарий |
|------|-------------|
| `POST /api/auth/check-phone` раскрывает `exists` | По плану нужен для UX выбора метода; добавлен rate limit по номеру. |
| In-memory rate limits | Не распределены между инстансами; при масштабировании — Redis / edge. |
| OAuth callback (Яндекс) | Полный обмен кода и проверка `state` (CSRF) — в этапе 5.5; сейчас заглушка редиректа. |
| Смена PIN при уже заданном PIN | Сейчас только сессия + rate limit; усиление (старый PIN / SMS) — по продукту. |

## Чеклист перед продом

- [ ] Прогнать миграции `020`, `021` на БД.
- [ ] Задать `SESSION_COOKIE_SECRET`, `APP_BASE_URL`, OAuth для Яндекса при включении.
- [ ] Настроить reverse-proxy rate-limit при высокой нагрузке.
