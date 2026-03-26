# FIX_PLAN — этап 13 (Интеграции)

**Статус:** этап **не выполнен** как единый закрытый контур по рабочей версии плана (шаги 13.1–13.7).

## Наблюдения по коду (выборочно)

- В `apps/integrator` отсутствует маршрут `send-email` / `sendEmailRoute` (поиск по репозиторию не находит реализацию под этим именем) — шаг 13.1 / 13.2 не закрыт как в плане.
- Google Calendar sync, расширенный Rubitime reverse API, автопривязка email из Rubitime и стандартизация nock/inject по всем внешним доменам — требуют отдельной реализации по подэтапам 13.5–13.7.
- Max channel-link, Telegram hardening — проверять по фактическим файлам `webhook.ts`, `channelLink.ts`, `scripts.json` при старте работ.

## Шаги (ориентир — рабочая секция `PLAN.md` этапа 13)

1. **13.1:** `POST /api/bersoncare/send-email` в integrator по образцу `sendSmsRoute.ts`, тесты inject, `INTEGRATOR_CONTRACT.md`.
2. **13.2:** адаптер в webapp для email OTP через integrator, `emailAuth.ts`, `env`, маршруты `/api/auth/email/*` при необходимости.
3. **13.3:** сверка TTL/regex/скриптов Telegram, тесты `channelLink`, webhook, complete route.
4. **13.4:** сценарий Max по результату исследования API; обновление `channelLink`, max scripts, тесты.
5. **13.5:** модуль `google-calendar` в integrator, env, связка с Rubitime webhook — по плану.
6. **13.6:** reverse API Rubitime + прокси webapp при доступности внешнего API; иначе зафиксировать блокер в документации этапа.
7. **13.7:** тестовая инфраструктура (unit, nock, inject), `apps/integrator/e2e/README.md` для ручного smoke.

---

Не смешивать с изменениями webapp CMS (этап 10) и reminders (этап 12). Координировать секреты только через `.env.example` и контрактные документы, без секретов в репозитории.
