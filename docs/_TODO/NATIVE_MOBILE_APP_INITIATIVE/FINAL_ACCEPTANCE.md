# Native mobile app — final acceptance

> ## ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ — 2026-07-27
>
> Владелец, 2026-07-27, на вопрос, не выдумана ли эта инициатива: «инициатива нативного мобильного приложения
> не выдумана - просто не сейчас. Пока pwa». Тем же днём, подтверждая статус: «Мобильное - отложено».
>
> Это ОТЛОЖЕНО, НЕ отменено: скоуп реальный и когда-нибудь будет сделан, но не сейчас.
> **Не исполнять. Не заводить задачи под эти пункты. Не удалять и не архивировать этот файл.**
> PWA остаётся текущим решением до его команды. Все чекбоксы ниже размечены `- [-]` (отложено), см. канон
> разметки в `docs/_TODO/BACKLOG_CONSOLIDATION_2026-07-26.md` §6.3 — вернуть в работу только по команде владельца.

## Architecture

- [-] ~~`MOB-00` доказал local bundle; production `server.url`/broad `allowNavigation` отсутствуют.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Mobile использует backend APIs/ports и не содержит копию domain/tenant authorization logic.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Web/PWA и mobile sessions совместимы, но secrets/tokens не делятся через URL/localStorage.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Backend остаётся backward-compatible минимум с предыдущей store version в принятом support window.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде

## Identity and privacy

- [-] ~~Rotating session, Keychain/Keystore, revoke/device list и logout/offboarding wipe проверены.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Universal/App Links allowlisted; token/custom-scheme/replay/tenant-negative tests зелёные.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Local cache, OS backup, screenshot/app-switcher, crash log и analytics policies подтверждены на devices.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~App Privacy/Data Safety/Privacy Manifest и vendor register совпадают с runtime SDK/data flows.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде

## Notifications

- [-] ~~Product event создаёт только in-app record + разрешённый push transport (`web_vapid`/`fcm`/`apns`).~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Telegram/MAX dispatch технически допускает только login/bind code/auth handshake.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Raw chat/clinical/free-text/file names/presigned URLs/secrets отсутствуют в push/provider/log/queue payload.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Routine appointment/reminder/billing copies полезны и соответствуют утверждённой content matrix.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Нет push permission/token — in-app state и health metric сохраняются, hidden messenger fallback отсутствует.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~APNs/FCM provider/legal gate `G-04B` закрыт до production.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде

## Store and operations

- [-] ~~Android/iOS real-device matrices закрыты; killed/background/deep-link/update/offline cases проверены.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Apple 4.2 app-like evidence и reviewer demo не используют production ПДн.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Billing/store policy имеет письменный verdict; запрещённый external checkout не доступен в store binary.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Signing credentials не в repo/DB logs; release artifact привязан к source SHA и owner window.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Targeted native/backend tests, security audit и один полный integration `pnpm run ci` зелёные.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде

```text
Release SHA:
Android artifact/store:
iOS artifact/store:
Provider/legal review:
Security audit:
Owner decision: GO / NO-GO
Date:
```
