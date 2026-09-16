# D9 Q2 — замер OAuth topology на брендированных хостах

Дата замера: 2026-09-16.

## 1. Куда садится сессионная cookie

**Ответ:** при условии brief, что callback Google/VK/Apple пришёл на глобальный хост, сессионная cookie ставится на этот глобальный callback-хост; `Domain` не задан, поэтому на исходный брендированный поддомен или собственный домен клиники она не распространяется.

Доказательства:

- Google передаёт проверенного пользователя в единый OAuth-финал (`apps/webapp/src/app/api/auth/oauth/callback/google/route.ts:132-148`); VK и Apple делают то же (`apps/webapp/src/modules/auth/vkOAuthCallbackHandler.ts:175-201`, `apps/webapp/src/app/api/auth/oauth/callback/apple/route.ts:178-194`).
- Единый финал вызывает `setSessionFromUser` (`apps/webapp/src/modules/auth/oauthWebSession.ts:49-60`), а тот записывает cookie через `persistNewAuthSession` (`apps/webapp/src/modules/auth/service.ts:1028-1044`).
- Запись использует `buildSessionCookieOptions` (`apps/webapp/src/modules/auth/service.ts:249-253`); в опциях есть только `httpOnly`, `sameSite`, `secure`, `path` и `maxAge`, но нет `domain` (`apps/webapp/src/modules/auth/sessionCookie.ts:198-205`).
- Start передаёт в Google, VK и Apple их единый runtime `redirect_uri` (`apps/webapp/src/app/api/auth/oauth/start/route.ts:210-235`, `apps/webapp/src/app/api/auth/oauth/start/route.ts:238-265`, `apps/webapp/src/app/api/auth/oauth/start/route.ts:268-295`); именно этот URI определяет хост callback из условия замера.

## 2. Куда ведёт успешный callback

**Ответ:** Google/VK/Apple ведут на глобальный `APP_BASE_URL`, а не на исходную surface: итоговый URL строится из относительного пути и `appBase`, поэтому человек остаётся на глобальном хосте и там же имеет только что поставленную сессию.

Доказательства:

- Финал OAuth строит `finalRedirect` только из роли, `next` и portal, затем делает абсолютный URL через `new URL(finalRedirect, appBase)` (`apps/webapp/src/modules/auth/oauthWebSession.ts:69-75`).
- Допустимый `next` — только путь внутри patient subtree либо role-portal path, а не иной origin (`apps/webapp/src/modules/auth/redirectPolicy.ts:24-29`, `apps/webapp/src/modules/auth/redirectPolicy.ts:36-60`).
- Google передаёт в state только `tzOpt`, без surface/origin (`apps/webapp/src/app/api/auth/oauth/start/route.ts:152-159`, `apps/webapp/src/app/api/auth/oauth/start/route.ts:210-235`); VK и Apple используют свои state-конструкторы с тем же `tzOpt` (`apps/webapp/src/app/api/auth/oauth/start/route.ts:238-265`, `apps/webapp/src/app/api/auth/oauth/start/route.ts:268-295`).
- Поля `surface` и `origin` могут попасть лишь в общий state-конструктор при явной передаче `surface` и `publicOrigin` (`apps/webapp/src/modules/auth/oauthSignedState.ts:58-103`); специализированные Apple и VK state-конструкторы этих полей не принимают (`apps/webapp/src/modules/auth/oauthSignedState.ts:107-129`, `apps/webapp/src/modules/auth/oauthSignedState.ts:151-180`).

## 3. Предлагаются ли Google/VK/Apple на брендированных поверхностях

**Ответ:** код допускает эти кнопки на каждой разрешённой брендированной patient surface, но их фактическую доступность сегодня установить нельзя без списка живых брендированных host и авторизованного снимка их runtime flags.

Доказательства:

- Резолвер возвращает брендированной поверхности именно patient auth policy (`apps/webapp/src/shared/lib/surface/requestSurface.ts:350-389`), а mapping для любой `patient_branded` surface также даёт `patient` (`apps/webapp/src/modules/auth/surfaceAuthSettings.ts:84-86`).
- Patient policy включает метод `oauth` (`apps/webapp/src/shared/lib/surface/surfaceAuthPolicy.ts:21-36`).
- Публичный снимок перебирает все четыре провайдера и вычисляет их effective availability для переданной policy (`apps/webapp/src/modules/auth/publicAuthSnapshot.ts:14-30`); effective availability — это patient toggle вместе с credential-derived public flag (`apps/webapp/src/modules/auth/authChannelPolicy.ts:119-148`).
- Экран показывает Google/VK по true-флагу из снимка, Apple — только при true-флаге и отсутствии Yandex/Google (`apps/webapp/src/shared/ui/patient/auth/AuthFlowV2.tsx:282-301`, `apps/webapp/src/shared/ui/patient/auth/AuthFlowV2.tsx:451-459`, `apps/webapp/src/shared/ui/patient/auth/AuthFlowV2.tsx:2324-2345`).
- Единственный выполненный anonymous read был `curl --silent --show-error --max-time 15 --include http://127.0.0.1:5200/app`: он вернул staff surface с `oauthProviders` all-false, а не branded patient surface; поэтому его нельзя выдавать за результат для клиник.

## 4. Механизм возврата на исходную поверхность

**Ответ:** для Google/VK/Apple механизма relay, промежуточного редиректа или обмена одноразовым кодом для возврата на исходную surface нет.

Доказательства:

- Их callbacks заканчиваются единым `completeOAuthWebLoginRedirectUrls`, который ставит сессию и формирует redirect от `appBase`, без чтения `publicOrigin`/`surface` (`apps/webapp/src/app/api/auth/oauth/callback/google/route.ts:132-148`, `apps/webapp/src/modules/auth/vkOAuthCallbackHandler.ts:175-201`, `apps/webapp/src/app/api/auth/oauth/callback/apple/route.ts:178-194`, `apps/webapp/src/modules/auth/oauthWebSession.ts:49-75`).
- У Google/VK/Apple state не содержит surface-origin, из которого такой возврат мог бы быть построен (`apps/webapp/src/app/api/auth/oauth/start/route.ts:210-295`, `apps/webapp/src/modules/auth/oauthSignedState.ts:107-180`).
- Поиски, проведённые для отсутствующего механизма: `node /home/dev/brain/tools/code-search.mjs "oauth state origin surface next redirect return relay one-time code" --repo bcb -k 30`; `rg -n -i "relay|return.*surface|surface.*return|one.?time.*(code|token)|token.*exchange|exchange.*token" apps/webapp/src/app/api/auth apps/webapp/src/modules/auth --glob '!**/*.test.*'`. Единственный найденный `/api/auth/exchange` принимает integrator token (`apps/webapp/src/app/api/auth/exchange/route.ts:24-72`) и классифицируется как standalone `?t=`/`?token=` entry (`apps/webapp/src/modules/auth/appEntryClassification.ts:19-49`), не как OAuth surface-return.

## 5. Сколько поверхностей живёт сегодня и у скольких свой хост

**Ответ:** точное число не установлено: получить его можно только штатным platform-admin чтением каталога, а в этом ходе нет авторизованной platform session и выполнение `psql`/sudo запрещено brief.

Доказательства:

- Штатный read route — `GET /api/admin/organizations`; он требует platform-operations context и получает организации только через `deps.platformEntitlements.listOrganizations()` (`apps/webapp/src/app/api/admin/organizations/route.ts:23-31`, `apps/webapp/src/app/api/admin/organizations/route.ts:69-80`).
- Его repository-port получает domain status из `app.list_platform_organization_brand_domain_status()` (`apps/webapp/src/infra/repos/pgPlatformEntitlements.ts:472-495`); функция выдаёт по одной строке на организацию и hostname/status custom domain (`apps/webapp/db/drizzle-migrations/20260910T100000_platform_organization_brand_domain_projection.sql:4-43`).
- Команда для ведущего в уже авторизованной platform-admin вкладке DEV (DevTools Console; read-only):

```js
fetch('/api/admin/organizations', { cache: 'no-store' })
  .then((r) => r.json())
  .then(({ organizations }) => console.table({
    organizations: organizations.length,
    branded: organizations.filter((o) => o.hasPublishedBrand).length,
    ownHost: organizations.filter((o) => o.customDomain?.hostname && o.customDomain.status === 'active').length,
  }));
```

## ЧЕГО Я НЕ СМОГ УСТАНОВИТЬ

- Список и число живых брендированных host в DEV, число опубликованных brand и число active собственных доменов: это закрытый platform-admin каталог; не выполнял ни `psql`, ни `sudo`, ни чтение `.env`.
- Поэтому не установлены фактические current flags Google/VK/Apple на branded host и нельзя честно утверждать ни что хотя бы один из них сегодня предлагается, ни что все они отсутствуют на всех клиниках.
- PROD, TEST, миграции, конфигурация, продуктовый код и тесты не затрагивались; автоматические UI-тесты не создавались и не запускались.
