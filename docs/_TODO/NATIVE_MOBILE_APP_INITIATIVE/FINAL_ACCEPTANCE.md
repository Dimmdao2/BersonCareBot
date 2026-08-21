# Native mobile app — final acceptance

> **ЗАМОРОЗКА 27.07.2026 СНЯТА ВЛАДЕЛЬЦЕМ 2026-08-21** («разведочного этапа MOB-00 - запусти агента») —
> для `MOB-00` и только для него; `MOB-01`+ остаются закрытыми. Канон снятия — шапка
> [`MASTER_PLAN.md`](MASTER_PLAN.md). Исторический текст заморозки:
> Evidence по `MOB-00` — [`MOB-00_ADR_AND_SPIKE_FINDINGS.md`](MOB-00_ADR_AND_SPIKE_FINDINGS.md).
>
> ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде.
>
> Владелец, 2026-07-27, на вопрос, не выдумана ли эта инициатива: «инициатива нативного мобильного приложения
> не выдумана - просто не сейчас. Пока pwa».
>
> Скоуп реальный и когда-нибудь будет сделан, но не сейчас.
> **Не исполнять. Не заводить задачи под эти пункты. Не удалять и не архивировать этот файл.**
> PWA остаётся текущим решением до его команды. Все чекбоксы ниже открыты как `- [ ]` по действующему канону
> `docs/_TODO/BACKLOG_CONSOLIDATION_2026-07-26.md` §6.4.

## Architecture

- [ ] `MOB-00` доказал local bundle; production `server.url`/broad `allowNavigation` отсутствуют.
- [ ] Mobile использует backend APIs/ports и не содержит копию domain/tenant authorization logic.
- [ ] Web/PWA и mobile sessions совместимы, но secrets/tokens не делятся через URL/localStorage.
- [ ] Backend остаётся backward-compatible минимум с предыдущей store version в принятом support window.

## Identity and privacy

- [ ] Rotating session, Keychain/Keystore, revoke/device list и logout/offboarding wipe проверены.
- [ ] Universal/App Links allowlisted; token/custom-scheme/replay/tenant-negative tests зелёные.
- [ ] Local cache, OS backup, screenshot/app-switcher, crash log и analytics policies подтверждены на devices.
- [ ] App Privacy/Data Safety/Privacy Manifest и vendor register совпадают с runtime SDK/data flows.

## Notifications

- [ ] Product event создаёт только in-app record + разрешённый push transport (`web_vapid`/`fcm`/`apns`).
- [ ] Telegram/MAX dispatch технически допускает только login/bind code/auth handshake.
- [ ] Raw chat/clinical/free-text/file names/presigned URLs/secrets отсутствуют в push/provider/log/queue payload.
- [ ] Routine appointment/reminder/billing copies полезны и соответствуют утверждённой content matrix.
- [ ] Нет push permission/token — in-app state и health metric сохраняются, hidden messenger fallback отсутствует.
- [ ] APNs/FCM provider/legal gate `G-04B` закрыт до production.

## Store and operations

- [ ] Android/iOS real-device matrices закрыты; killed/background/deep-link/update/offline cases проверены.
- [ ] Apple 4.2 app-like evidence и reviewer demo не используют production ПДн.
- [ ] Billing/store policy имеет письменный verdict; запрещённый external checkout не доступен в store binary.
- [ ] Signing credentials не в repo/DB logs; release artifact привязан к source SHA и owner window.
- [ ] Targeted native/backend tests, security audit и один полный integration `pnpm run ci` зелёные.

```text
Release SHA:
Android artifact/store:
iOS artifact/store:
Provider/legal review:
Security audit:
Owner decision: GO / NO-GO
Date:
```
