# Все пропущенные DEV-миграции — независимая приёмка

Классификация «тест или взгляд»: полнота hash-ledger и эквивалентность forward SQL проверяются независимым
взглядом по всему журналу и существующими исполняемыми проверками; DEV/TEST не изменять, отдельную одноразовую
БД ради повторения уже доказанного разворачивания не создавать.

## Authority

- `AGENTS.md` §1 «Миграции», §9–10, §24.
- `docs/_TODO/runs/briefs/TARIFF_BILLING_FORWARD_MIGRATIONS_REPAIR_BRIEF.md`.
- Исходные принятые миграции `0291`, `0298`, `0304`, `0305`, `0312`, `0318`.
- Аудитируемая ветка: `wt/tariff-billing-forward-migrations`; продуктовые коммиты `798827be8`, `64c1edbd5`.
- Общий gate уже находится в актуальном `feat`: `896dd4da5`, self-test correction `1be19e5c1`.

## Зафиксированный kill-set

1. Пересчитать SHA256 всех файлов из `_journal.json` и независимо подтвердить полный набор ранних current-hash
   разрывов на DEV: не доверять прежнему списку и одному `max(created_at)`.
2. `0323`–`0327` должны повторять только итоговое поведение названных шести исходных файлов. Старые файлы,
   ledger и уже применённые объекты не переписываются.
3. Общий migration runner обязан после обычного migrate падать на любом непокрытом current hash независимо от
   максимального времени. Покрытие допустимо только применённой более поздней migration с точным marker на
   существующий более ранний tag; unknown, backward, duplicate и неприменённый forward не проходят.
4. D5 сохраняет occurrence/delivery history, переводит FK на `public.reminder_rules` с `ON DELETE RESTRICT` и не
   удаляет legacy table до отдельного zero-consumer доказательства.
5. Booking cleanup удаляет только старый product catalog и пять legacy projections; канонические `be_*` таблицы
   остаются.
6. Тарифные forward SQL сохраняют registration FORCE RLS и frozen paid-period access doors без новой логики.
7. Billing provider forward оставляет `system_settings` закрытой и выдаёт только fixed-key capability.
8. Journal `idx/when` строго append-only после фактического current `feat`; номера `0323`–`0327` соответствуют
   доске. PROD не трогать.

## Результат

- Один отчёт: `docs/_TODO/runs/billing/MIGRATION_HASH_RECONCILIATION_AUDIT_REPORT.md`.
- PASS только если все восемь пунктов доказаны и targeted checks зелёные.
- При реальном finding оставить FAIL и точный воспроизводимый сценарий. Продуктовый fix аудитор не делает; после
  аудита разрешён один bounded fixer без второго audit-цикла.
