# Смена тарифа без потери оплаченного периода — product slice (#1057, #1069)

Прочитать `AGENTS.md` §1/§4a/§5/§10/§24, соседние module docs и authority:
`docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` §5.6,
`docs/_TODO/OWNER_PUNCHLIST_2026-07-28.md` D-9,
`docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §9.8.
Product base — свежий descendant `wt/single-entry-integration`, где уже принята migration `0305` с frozen
paid-period snapshot. Migration `0307` забронирована на общей доске; `0306` принадлежит V9б S02.

Источник оракула: `TARIFFS_PAYMENTS_ADMIN_PLAN.md` §5a-0 Р-14 и §5.6, owner D-9. Повышение даёт новый
entitlement сразу; понижение вступает в силу со следующего расчётного периода, потому что текущий уже оплачен.
Это не задаёт денежную формулу повышения: немедленный prorated charge, полная разница или бесплатный остаток
периода остаются отдельным owner-money решением и не изобретаются исполнителем.

## Последствие

Сейчас достижимая platform-admin смена немедленно переписывает действующий тариф, snapshot и даты периода.
Понижение в середине уже оплаченного цикла сразу отнимает возможности и лимиты, а новый цикл начинается от
`now`. Клиника сама другой тариф выбрать не может: существующая кнопка выставляет счёт только на уже назначенный.
Ранняя оплата renewal также начинает период от `now` и может срезать остаток оплаченных дней.

Действующее решение владельца: повышение вступает сразу, понижение — с начала следующего расчётного периода;
оплаченный остаток не отнимается. До следующего периода должны быть убраны лишние счётные сущности; файлы переход
не блокируют, но новый рост замораживается. Места специалистов оплачиваются сверх базы и blocker-ом не являются.

## Scope

1. Переиспользовать существующие subscription/invoice/tariff/entitlement двери. Новую таблицу, второй billing
   service, новый экран или дублирующий quota evaluator не создавать. Сохраняются ровно два недостающих факта:
   `pending_tariff_id` в существующей paid subscription и полный неизменяемый `tariff_snapshot` в существующем
   invoice. Отдельную pending-date не заводить: граница уже хранится в `current_period_ends_at`. Исторические
   invoice допускают `NULL`; каждый новый invoice фиксирует всю строку тарифа при создании invoice/provider offer.
2. Создать ровно одну migration `0307_*` для обеих колонок с первой строкой
   `-- TEMPORARY LOCAL MIGRATION NUMBER 0307`, journal `idx=307` и `when` строго после `0306`. Добавить FK/index
   по канону горячей колонки. D-9 внести в единственный реестр действующих решений §5a-0, устранив расхождение,
   без переписывания исторического owner log.
3. Upgrade: применить новый entitlement сразу, но сохранить неизменными `current_period_starts_at` и
   `current_period_ends_at` текущего оплаченного цикла; snapshot обновить атомарно для нового effective тарифа.
   Platform-admin manual assignment может сделать это без платежа. Clinic money-path не должен создавать invoice
   до фиксации owner-money формулы; это единственная разрешённая пауза среза, а не повод придумать proration.
4. Downgrade: сохранить pending target и effective boundary, не менять текущий tariff/projection/snapshot/period.
   Перед принятием проверить будущие лимиты по принятой классовой политике: patients/branches должны быть убраны;
   files разрешают schedule с freeze-growth; seats не блокируют. Повторная проверка обязана быть до списания либо
   до создания provider intent, чтобы клиника не заплатила за неприменимый downgrade.
5. Renewal invoice обязан брать pending target и начинаться ровно в текущем `current_period_ends_at`; обычная
   ранняя renewal-оплата текущего тарифа использует тот же якорь. Успешная ранняя оплата фиксирует купленные условия
   в invoice, но не меняет текущий доступ или даты. На boundary ровно этот оплаченный invoice атомарно переносит в
   subscription tariff id, полный snapshot и период, обновляет organization projection и очищает pending.
   Provider-event dedupe, invoice CAS `paid`, сохранение способа оплаты и действие периода выполняются в одной
   repository transaction; повтор webhook/tick остаётся идемпотентным и завершает целое состояние.
6. Довести существующий clinic billing путь без новой страницы: выбор доступного активного тарифа, ясное состояние
   «вступит <дата>», blockers и отмена pending. Platform admin путь показывает schedule, а не сообщает о
   немедленной смене. Не добавлять поясняющий UI-текст сверх необходимого состояния/ошибки.
7. Исполнить реально выбранные downgrade policies в общей access/quota двери. Не закреплять старый ошибочный
   контракт, где `patient_count` проходит через `freeze_growth`; исключение без уборки — только класс объёма
   файлов. Не удалять пользовательские данные автоматически.

## Не входит

Провайдерские TEST-платежи/реальные карты, refund/receipt scope, новые цены, seat commerce, отдельная billing
страница, новая DB-test инфраструктура, DEV/TEST/PROD/deploy/taskdb. Пункт 5.6 и plan checkbox worker не закрывает:
это делает лид только после независимого аудита и реального DEV oracle.

## Приёмка worker

- unit/service tests: downgrade не меняет текущую дверь до boundary; manual upgrade меняет дверь сразу без сдвига end;
  ранняя renewal сохраняет остаток; boundary promotion/idempotency; cleanup blocker до provider intent; file
  freeze-growth; seats non-blocking;
- invoice snapshot переживает правку живого тарифа между invoice/provider offer и webhook; падение/повтор webhook
  не оставляет invoice `paid` без соответствующего атомарного действия;
- route/UI tests существующих admin/clinic поверхностей: select/schedule/cancel/error state без сырого enum/UUID;
- repository tests для pending target, invoice authority и atomic promotion; kill-set на строках, сохраняющих
  период и повторно проверяющих cleanup;
- `check-drizzle-journal-sync`, `drizzle-kit check`, raw-SQL gate, scoped lint, webapp typecheck, `git diff --check`;
- короткий report под `docs/_TODO/runs/tariff/` с exact command + result и честным перечнем оставшегося.

После worker — один независимый behavior/data/money audit. Только после PASS лид применяет migration через
`migrate-dev.sh --preflight` → `--execute` и расширяет существующий DEV oracle; disposable БД допустима лишь для
clean replay/DDL и не заменяет DEV product proof.
