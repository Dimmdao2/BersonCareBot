# Audit D27-A1 — anonymous phone/channel concealment

## Тест или взгляд

- Повторяемое public auth поведение (known/unknown, bindings, provider/policy variants, timing) — blind kill-set,
  acceptance tests и fault injection по `AGENTS.md` §24.4–§24.6.
- Одноразовая архитектурная граница (нет identity lookup/PII/account-derived imports в public route) — inspection,
  exact search и diff review; тест на строки production-кода не писать.

## Authority

- Прочитать `AGENTS.md`, особенно §10a–§10b и §24.
- `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`: Р-D27 и D27.
- `docs/_TODO/runs/integrator-cleanup/IDENTITY_AND_MERGE_SCHEME.md` §3.3/§3.6.
- Product candidate: `1e160cac6` в `wt/trackd-d27a1-enumeration`.

Оракул: «экран не должен подсказывать постороннему, какие каналы есть у владельца номера»; список зависит только
от глобальных configured+enabled capabilities, не от существования человека/привязок/PIN/email/preference.

## Независимая проверка

До чтения candidate tests составить kill-set. Минимально проверить:

1. Known/unknown и все независимые изменения identity state дают byte-equivalent public response и одинаковый
   status/minimum-time class; forbidden nested/top-level PII/account fields отсутствуют.
2. Identity repos/ports не вызываются даже при injected throw; нельзя вернуть lookup через alias/helper.
3. Изменение global configured+enabled policy одинаково меняет ответ для любого номера; disabled/unconfigured
   channel не показывается.
4. Старый compatibility caller после deploy продолжает работу без PII; main phone start остаётся neutral для
   absent account/binding; authenticated self bind не стал anonymous oracle.
5. Validation/rate-limit не были ослаблены; fixed minimum response не реализован клиентом и не обходится быстрым
   known/unknown ответом.
6. Product diff не трогает email delivery, OTP/session/attempt/2FA/identity model вне D27-A1.

Аудитор не чинит product. Можно оставить и закоммитить только новые acceptance tests и audit-report. Все fault
injection изменения production-кода откатить. Вердикт PASS/FAIL с точными командами и kill-set counts.

Не трогать DB/env/deploy/DEV/TEST/PROD, D30, тарифы/CMS и общий `feat`.
