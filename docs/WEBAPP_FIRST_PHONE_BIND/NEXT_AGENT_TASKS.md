# Задачи следующему агенту (хвосты аудита 2026-04-13)

Контекст: полный аудит `AGENT_AND_AUDIT_LOG.md` → запись **AUDIT 2026-04-13 — полный независимый аудит STAGE_01–06**. Пункты **7–8** из того отчёта — не баги кода, а отложенные продуктовые/политические темы.

## 7. Опциональный HTTP bind: skeleton + admin audit (STAGE_06)

**Сейчас:** `POST /api/integrator/messenger-phone/bind` отвечает **422** с machine-reason (в т.ч. `no_channel_binding`) для strict-отказов; отдельного режима «skeleton user» с записью в `admin_audit_log` **нет** — осознанно (`STAGE_06_OPTIONAL_HTTP_BIND_ROUTE.md`, замечания по аудиту).

**Задача:** если появится требование от продукта/безопасности для **внешних** вызывающих:

- Специфицировать политику: когда разрешать ослабленную привязку (флаг в теле, отдельный scope подписи, allowlist caller).
- Реализовать запись в **`admin_audit_log`** (и при необходимости метрики) на отказах/успехах skeleton.
- Обновить `INTEGRATOR_CONTRACT.md`, `auth.md`, тесты `route.test.ts`.

**Не трогать:** hot path бота при unified DB — по-прежнему TX `user.phone.link` в integrator.

## 8. Паритет сценариев Max vs Telegram (phone link / онбординг)

**Сейчас:** в `apps/integrator/src/content/max/user/scripts.json` меньше вхождений `user.phone.link`, чем в `telegram/user/scripts.json`; продуктовая сводка: `docs/archive/2026-04-docs-cleanup/reports/TELEGRAM_VS_MAX_SCENARIOS_2026-04-13.md`.

**Задача:**

- Сверить с продуктом список шагов онбординга и привязки телефона для **Max** (контакт, `/start`, гейты `linkedPhone`).
- При необходимости добавить/выровнять шаги в `max/user/scripts.json` и связанные гейты в `resolver.ts` / контент — по тому же принципу, что для Telegram.
- Зафиксировать решение в `TELEGRAM_VS_MAX_SCENARIOS_*.md` или в `STAGE_04_UX_REASONS_AND_SCRIPTS.md` (краткая нота «паритет Max»).
