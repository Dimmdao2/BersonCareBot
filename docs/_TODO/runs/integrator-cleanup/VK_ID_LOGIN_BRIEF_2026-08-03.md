# VK ID — make the login method real

Rules: `AGENTS.md` — Маршрут, CORE rules, §2/§3/§4 (integration config lives in the DB, never in env),
§5, §10/§10a/§10b, §21, §24. Language: internal work is English; UI copy is Russian.

⚠️ **One-shot agent, no next turn** (`AGENTS.md` §24.2): never end while something runs in the background;
**commit before you finish**.

Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` — **D31 (часть 2/2)** «VK как настоящий
канал», decision **Р-D31**; identity rules — `runs/integrator-cleanup/IDENTITY_AND_MERGE_SCHEME.md` §1, §2, §2a.

Источник оракула: `WORK_ORDER.md` **Р-D31** (владелец) — «делать API для VK, инсту удалять»; и владелец 03.08:
«VK id довести до рабочего. Ключи сегодня дам».

## The measured gap

The admin panel already offers VK: settings `vk_id_application_id`, `vk_id_client_secret`, `vk_id_redirect_uri`,
`vk_web_login_url` exist in the registry and render on the auth screen. **But there is no login implementation** —
`apps/webapp/src/app/api/auth/oauth/callback/` holds only `apple`, `google`, `yandex`. So an administrator can
configure VK and switch it on, and nobody can log in with it. A toggle without a consumer is exactly what D38
forbids.

## Work

1. **Follow the existing provider shape, do not invent a second one.** Yandex is the closest reference
   (`oauthYandexResolve.ts`, `yandexOAuthCallbackHandler.ts`, `oauth/callback/yandex/route.ts`). VK ID must reuse
   the shared pieces: `oauthWebLoginResolve`, and in particular the shared `oauthContactResolve` helper that
   implements the owner's six OAuth contact cases (§2a) — VK gets the same rules as Google/Apple/Yandex, including
   case 6 (contacts pointing at two different accounts refuses the login with the owner's verbatim message).
2. **Trust semantics come from §1**: a phone that VK ID returns as verified is a **confirmed** contact, the same
   level as an SMS code — it participates in the same equal-rights login. An unverified value is not.
3. **Config from the DB only** (§2/§3/§4): read the four existing settings through the same seam other providers
   use. Note that the pre-auth settings read now goes through the narrow accessor added today — VK's keys must be
   in that allowlist, or the callback will hit the same `permission denied` that broke `oauth/start`.
4. **Keys are not available yet** — the owner will supply them today. Build and test without them: the whole path
   must be provable with fakes at the level the other providers are tested, and the live check is a separate step
   the lead runs once the keys are in. Do **not** hardcode any credential, and do not commit one.
5. If anything in the admin screen promises a VK capability the implementation cannot deliver (e.g. a separate
   `vk_web_login_url` that means something different), say so in the report rather than quietly wiring it.

## Boundaries

- No new OAuth framework, no second resolver, no change to how the other providers behave.
- Do not touch the anti-enumeration behavior accepted in D27-A1.
- No migration unless a setting genuinely needs one — the four keys already exist.
- No push, no merge into `feat`.

## Done means

- A VK ID login exists end to end in code: start → provider → callback → account resolution through the shared
  rules → session.
- Behavioral tests mirroring the Yandex ones, plus the §2a cases for VK specifically.
- Typecheck, scoped ESLint, `git diff --check` clean.
- One commit on your branch, and a report stating exactly what the lead must do once the owner's keys arrive.

---

## Виджет — решение владельца и лида, 03.08

Владелец прислал три варианта виджета VK ID и сказал «не знаю как надо». Выбор сделан лидом как
интерфейсно-инженерный, владелец подтвердил присланным финальным сниппетом: **`VKID.OAuthList` с единственным
элементом `'vkid'`**.

**Почему не `OneTap`:** он спроектирован как ГЛАВНАЯ кнопка входа — крупный фирменный блок ВКонтакте. У нас VK
не главный способ, а один из восьми (телефон, почта+пароль, Telegram, MAX, Яндекс, Google, Apple), и такая
плашка подменяет собой весь экран. `OAuthList` — ряд небольших кнопок провайдеров, встаёт в существующий ряд.

**Почему без `mail_ru`/`ok_ru`:** с нашей стороны это ОДИН провайдер. Человек, вошедший через Mail.ru, приходит
как VK ID и в списке контактов будет числиться вкшной привязкой; три кнопки для одной сущности запутают и
человека, и поддержку. Добавляются позже одной строкой без изменений на сервере, если владелец решит, что охват
важнее.

**Итоговая конфигурация:**

```js
VKID.Config.init({
  app: 54706040,                                   // vk_id_application_id, не секрет
  redirectUrl: 'https://test.bersoncare.ru/api/auth/oauth/callback/vk',
  responseMode: VKID.ConfigResponseMode.Callback,
  scope: 'email phone',
});
new VKID.OAuthList().render({ container, oauthList: ['vkid'] })
  .on(LOGIN_SUCCESS, payload => /* POST { code, deviceId } на наш сервер */);
```

**Три обязательных отличия от присланного сниппета:**

1. **`scope: 'email phone'`** — в сниппете пусто. Без `phone` VK не отдаст номер, а по §1 схемы номер,
   подтверждённый провайдером, приравнен к подтверждённому по SMS и даёт равноправный вход (§2a п.7). Ради этого
   VK и включается.
2. **SDK из npm (`@vkid/sdk`), а не с `unpkg.com`.** CSP репозитория сейчас ограничивает только `frame-ancestors`,
   то есть внешний скрипт загрузится — тем хуже: это чужой код на странице входа, в пути аутентификации.
3. **`VKID.Auth.exchangeCode(code, deviceId)` НЕ вызывается в браузере.** Обмен требует client secret, а секрет в
   браузере — утечка; и сессию выдаёт сервер после проверок §2a. Виджет отдаёт `code` + `device_id`, клиент шлёт
   их POST-ом на `/api/auth/oauth/callback/vk`, обмен делает сервер своим секретом.

**Ключи владелец вносит сам** на `/app/admin/auth`; в репозиторий и в чат секрет не попадает. ⚠️ Вносить после
ближайшего деплоя: сид-миграция для трёх `vk_id_*` ключей (без неё падал `/app/admin/app-settings`) приземлена,
но на TEST ещё не выкачена.
