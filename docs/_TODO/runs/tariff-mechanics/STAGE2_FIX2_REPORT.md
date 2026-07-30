STOP-GATE закрыт. Канон текущих правок:

- требования: `TARIFFS_PAYMENTS_ADMIN_PLAN.md` §5a (2.3, 2.6c, 3.1/3.1a/3.1b) и шесть MUST FIX из `STAGE2_FINAL_AUDIT_RESULT.md`;
- продуктовая семантика: `QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §4a/§5, особенно «один resolver», видимый отказ и запрет самостоятельно решать payments/branding;
- архитектура: module ports/DI, единая `public.system_settings`, integrator читает её напрямую;
- тесты: публичное поведение, обязательная fault injection, без source/SQL-text assertions и без новой DB/RLS-механики;
- deploy: существующий strict overlay и его текущие contract gates; номер миграции остаётся `0276`.

`taskdb` в этом клоне недоступен из-за отсутствующего `SECONDBRAIN_DB_URL`; новую карточку не создаю, а локальные коммиты свяжу с уже указанной `#1069`. Перехожу к точечному чтению найденных модулей и тестов.