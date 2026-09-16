# Д9 Q2 — привязка OAuth `state` к браузеру

Дата проверки: 2026-09-16.

## Итог

Реализация остановлена на обязательной host-развилке из brief: совпадение хоста, на котором начинается OAuth,
и хоста callback гарантировано не для всех провайдеров. Добавление host-only cookie в текущую схему сломает
Google, VK и Apple при старте с surface-хоста, отличного от их единственного настроенного callback-хоста.

Есть второй независимый конфликт для Apple: callback реализован как cross-site `POST`
(`response_mode=form_post`), а заданная решением cookie `SameSite=Lax` на таком запросе браузером не
отправляется.

## Что найдено про хосты

### Где ставилась бы cookie

`POST /api/auth/oauth/start` обслуживается на хосте исходного запроса. Маршрут получает поверхность через
`getResolvedSurface()` (`apps/webapp/src/app/api/auth/oauth/start/route.ts:161-179`), причём резолвер допускает
platform patient host, брендированный поддомен и собственный домен клиники
(`apps/webapp/src/shared/lib/surface/requestSurface.ts:301-384`). Следовательно, first-party cookie без `Domain`
будет принадлежать именно этому исходному хосту.

### На каком хосте принимается callback

- **Yandex:** совпадение гарантировано кодом. `resolveYandexOAuthConfig()` строит callback из
  `surface.publicOrigin` и допускает старт только при наличии точного URL в allowlist
  (`apps/webapp/src/modules/auth/yandexOAuthConfig.ts:28-73`). Callback повторно сверяет `surface`,
  `publicOrigin` и `organizationId` из подписанного state с текущей поверхностью
  (`apps/webapp/src/modules/auth/yandexOAuthCallbackHandler.ts:63-93`).
- **Google:** совпадение не гарантировано. Start и callback читают один глобальный
  `google_oauth_login_redirect_uri`; связи с `surface.publicOrigin` нет
  (`apps/webapp/src/app/api/auth/oauth/start/route.ts:210-235`,
  `apps/webapp/src/app/api/auth/oauth/callback/google/route.ts:35-70`,
  `apps/webapp/src/modules/system-settings/integrationRuntime.ts:82-84`).
- **VK:** совпадение не гарантировано. Start и callback читают один глобальный `vk_id_redirect_uri`; связи с
  `surface.publicOrigin` нет (`apps/webapp/src/app/api/auth/oauth/start/route.ts:238-265`,
  `apps/webapp/src/modules/auth/vkOAuthCallbackHandler.ts:71-99`,
  `apps/webapp/src/modules/system-settings/integrationRuntime.ts:47-49`).
- **Apple:** совпадение не гарантировано по той же причине: используется один глобальный
  `apple_oauth_redirect_uri` (`apps/webapp/src/app/api/auth/oauth/start/route.ts:268-295`,
  `apps/webapp/src/app/api/auth/oauth/callback/apple/route.ts:38-97`,
  `apps/webapp/src/modules/system-settings/integrationRuntime.ts:102-104`). Дополнительно start задаёт
  `response_mode=form_post`, а callback экспортирует `POST`, поэтому `SameSite=Lax` cookie не сопровождает
  возврат Apple (`apps/webapp/src/app/api/auth/oauth/start/route.ts:287-294`,
  `apps/webapp/src/app/api/auth/oauth/callback/apple/route.ts:35-39`).

Одна surface-политика не устраняет разрыв: публичный auth snapshot перебирает все четыре OAuth-провайдера для
переданной patient policy (`apps/webapp/src/modules/auth/publicAuthSnapshot.ts:14-27`), а registry содержит
Google, VK и Apple наряду с Yandex (`apps/webapp/src/modules/auth/oauthProviderRegistry.ts:25-54`).

## Что изменено

Создан только этот отчёт. Продуктовый код, тесты, миграции, конфигурация и план владельца не изменялись.

## Вопрос ведущему

Нужно зафиксировать две части topology-контракта, прежде чем реализация может продолжиться:

1. Какой механизм должен обеспечить один origin между `/oauth/start` и callback для Google, VK и Apple при
   старте с брендированного поддомена или собственного домена клиники: запрет такого старта, callback на каждом
   surface-origin либо отдельный согласованный relay-механизм?
2. Какой cookie-контракт применять к Apple `form_post`, поскольку требуемый `SameSite=Lax` браузер не отправит
   на cross-site `POST`?

До ответа выбирать один из этих вариантов самостоятельно нельзя: каждый меняет принятую форму решения или
доступность OAuth на существующих поверхностях.

## Проверки и команды

Карта правил:

```bash
grep -n "^## \\|^### " AGENTS.md
```

Поиск входа, callback, surface resolver и redirect URI выполнен командами:

```bash
node /home/dev/brain/tools/code-search.mjs "oauth start callback redirect_uri request surface origin host" --repo bcb -k 20
node /home/dev/brain/tools/code-search.mjs "oauthSignedState create verify state cookie" --repo bcb -k 20
node /home/dev/brain/tools/code-search.mjs "api auth oauth callback google yandex apple vk" --repo bcb -k 20
node /home/dev/brain/tools/code-search.mjs "resolve request surface host oauth" --repo bcb -k 20
node /home/dev/brain/tools/code-search.mjs "getGoogleOauthLoginRedirectUri getAppleOauthRedirectUri getVkIdRedirectUri definitions system settings" --repo bcb -k 20
node /home/dev/brain/tools/code-search.mjs "yandex_oauth_redirect_uri google_oauth_login_redirect_uri apple_oauth_redirect_uri vk_id_redirect_uri" --repo bcb -k 30
node /home/dev/brain/tools/code-search.mjs "oauth callback publicOrigin branded host custom domain redirect URI" --repo bcb -k 20
```

Результат инспекции: Yandex вычисляет callback из origin текущей поверхности; Google, VK и Apple используют
глобальные redirect URI; Apple принимает callback методом POST.

## НЕ СДЕЛАНО

- Не добавлены cookie, хеш привязки и удаление cookie при первом callback.
- Не менялись Apple nonce и VK PKCE.
- Не создавался поведенческий тест и не выполнялась инъекция поломки: без выбранного host/Apple-контракта тест
  закрепил бы не принятое ведущим поведение.
- Не запускались typecheck, ESLint и затронутые тесты: исполняемый код не менялся, работа остановлена до этого
  этапа обязательным условием brief.
- Галочка в `docs/_TODO/AUTH_DOORS_FIX_2026-09-16.md` не ставилась.
- PROD, TEST, DEV-БД, миграции и `.env` не затрагивались.
