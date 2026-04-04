# AUDIT — Stage 7 (Yandex OAuth: backend-only, merge по email)

**Scope:** `STAGE_7_YANDEX_OAUTH_BACKEND_ONLY.md`, `MASTER_PLAN.md` → Stage 7.

**Дата аудита:** 2026-04-04

---

## Verdict

**PASS**

---

## Проверки (gate)

### 1) `oauth/callback` end-to-end работает

**Статус:** OK

- **Старт:** `POST /api/auth/oauth/start` с `{ "provider": "yandex" }` — при заполненных `yandex_oauth_*` в `system_settings` возвращается `authUrl` на `oauth.yandex.ru` и cookie `oauth_state_yandex` (`oauth/start/route.ts`, тесты в `oauth/start/route.test.ts`).
- **Callback:** `GET /api/auth/oauth/callback` — проверка `state` и cookie (CSRF), `exchangeYandexCode`, `fetchYandexUserInfo`, `resolveUserIdForYandexOAuth`, загрузка пользователя, `setSessionFromUser`, редирект в приложение (`oauth/callback/route.ts`).
- **Тесты:** `oauth/callback/route.test.ts` — CSRF (403 при несовпадении state), error-path (нет code, exchange/userinfo fail, нет email, session fail), happy-path: мок успешного резолва по OAuth-привязке → вызов `setSessionFromUser`, редирект под `/app/patient`.
- **Сервис:** `oauthService.test.ts` — обмен кода и userinfo.

---

### 2) Merge по email не создаёт дублей

**Статус:** OK

- `resolveUserIdForYandexOAuth` (`oauthYandexResolve.ts`): сначала существующая привязка по `yandexId` → тот же `userId`; иначе (при `DATABASE_URL`) поиск **одной** строки `platform_users` с `lower(trim(email))` и `email_verified_at IS NOT NULL` — при **ровно одной** строке merge на этот `userId` + upsert `user_oauth_bindings`; при **0** строк — один `INSERT` нового `platform_users` + binding; при **>1** (до 4 в выборке) — `email_ambiguous`, без создания пользователя.
- **Тесты:** `oauthYandexResolve.test.ts` — merge на существующего (`merge-user`), создание нового при пустом матче, `email_ambiguous` при двух строках.

---

### 3) OAuth не опубликован в публичном login UI

**Статус:** OK

- `AuthFlowV2.tsx` не содержит ссылок на OAuth/Yandex.
- `resolveAuthMethodsForPhone` не отдаёт `methods.oauth` в ответе для UI (`checkPhoneMethods.test.ts` — `oauth` undefined).
- **Тест:** `AuthFlowV2.test.tsx` — «does not show Yandex OAuth in public login UI» (тексты `яндекс` / `Yandex` отсутствуют).
- Публичный вход: только прямой вызов API (документировано в комментариях route и в админском `RuntimeConfigSection` как служебный сценарий).

---

### 4) Ключи `system_settings` подтверждены

**Статус:** OK

| Ключ | Где зафиксирован |
|------|-------------------|
| `yandex_oauth_client_id` | `ALLOWED_KEYS` в `modules/system-settings/types.ts` |
| `yandex_oauth_client_secret` | то же; `SECRET_LIKE_KEYS` в `api/admin/settings/route.ts` |
| `yandex_oauth_redirect_uri` | то же |

- Чтение: `integrationRuntime.ts` — `getYandexOauthClientId` / `Secret` / `RedirectUri` через `getConfigValue`.
- Админка: `RuntimeConfigSection.tsx`, список ключей в `api/admin/settings/route.ts`, тест обновления `yandex_oauth_client_id` в `route.test.ts`.

---

### 5) CI evidence

**Статус:** OK

| Команда | Результат |
|---------|-----------|
| `pnpm install --frozen-lockfile && pnpm run ci` | **exit 0** (2026-04-04) |

---

## Findings by severity

### Critical

Нет.

### Major

Нет.

### Minor / informational

- В unit-тесте `oauth/callback/route.test.ts` задан `DATABASE_URL: ""`, поэтому ветка merge/create через реальный `resolveUserIdForYandexOAuth` + Postgres в callback **не** покрыта интеграционно — merge детально проверяется в `oauthYandexResolve.test.ts`; callback проверяет полный путь при уже успешном резолве через мок `findUserByOAuthId`.

---

## MANDATORY FIX INSTRUCTIONS

**Обязательных исправлений по результатам этого аудита нет** (нет `critical` / `major`).
