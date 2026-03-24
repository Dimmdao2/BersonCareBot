# OAuth (этап 5.1h): переменные окружения

Имена ключей (значения не коммитить):

| Переменная | Назначение |
|------------|------------|
| `YANDEX_OAUTH_CLIENT_ID` | Клиент Яндекс OAuth |
| `YANDEX_OAUTH_CLIENT_SECRET` | Секрет (только на сервере, не в браузере) |
| `YANDEX_OAUTH_REDIRECT_URI` | Redirect URI, зарегистрированный в кабинете Яндекса (должен совпадать с `GET /api/auth/oauth/callback` на `APP_BASE_URL`) |

Если любая из трёх пуста, `POST /api/auth/oauth/start` с `provider: "yandex"` возвращает **501** с кодом `oauth_disabled` (предсказуемый отключённый режим).

Дополнительно для UI v2 входа:

| Переменная | Назначение |
|------------|------------|
| `NEXT_PUBLIC_AUTH_V2` | `1` — включить поток `AuthFlowV2` на странице `/app` (при наличии `?next=`). |

См. также `apps/webapp/.env.example`.

Формат токенов **login** vs **link** (интегратор): [`TOKEN_FORMAT.md`](./TOKEN_FORMAT.md).
