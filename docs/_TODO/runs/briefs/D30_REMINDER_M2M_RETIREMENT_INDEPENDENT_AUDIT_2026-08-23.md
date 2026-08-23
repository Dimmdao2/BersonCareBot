# Тест или взгляд — независимый аудит D30 reminder-rule M2M retirement

**Роль:** `auditor-live`, независимый от автора кандидата. Сначала прочитай `AGENTS.md` по маршруту,
затем §1 (миграции и разбор прав), §5, §9–§10b и §24.4–§24.7 целиком. Отчёт worker — только входной
сигнал, не доказательство. Для поиска сначала `code-search`, затем точечный `rg` по уже известным строкам.

**Источник оракула:** `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` — «Разделяются две оси: владение решением (какие напоминания, сроки и тексты) — webapp; исполнение по расписанию — integrator.»

Дополнительный точный scope в
`docs/_TODO/runs/integrator-cleanup/D30_SCHEDULER_REVERSAL_PLAN.md`, Ш8:
«Дренаж `integrator_push_outbox` исчезает вместе с M2M-каналом `reminder_rule_upsert`».

## Кандидат

- Worktree: `/home/dev/dev-projects/bcb-wt-d30-remove-reminder-rule-m2m-20260823`.
- Branch: `wt/d30-remove-reminder-rule-m2m-20260823`.
- Product candidate: `024142803f5455cc0311fd0256cf0aaf44e5cac9`.
- Integration base: `5fddb9aea92da375b20cd9bcc2043d8d007b24c2`.
- Review the complete product diff: `git diff 5fddb9aea92da375b20cd9bcc2043d8d007b24c2..024142803f5455cc0311fd0256cf0aaf44e5cac9`.
- Worker report:
  `docs/_TODO/runs/integrator-cleanup/D30_REMINDER_M2M_RETIREMENT_FIXER_2026-08-23.md`.
- Lead already ran the exact candidate through
  `bash deploy/host/migrate-dev.sh --preflight` on named `bcb_webapp_dev`; wrapper result was
  `migrate-dev preflight: PASS (post-cutover DEV; rollback-only webapp DDL validation complete)`.
  This is evidence to inspect, not permission to run `--execute`.

## Обязательный первый выход: kill-set до чтения тестов

До чтения существующих тестов перечисли все способы, которыми кандидат может быть неверен, и каждый
классифицируй как **взгляд** или **тест** по §24.4. Не пиши тесты на отсутствие строк, импортов, SQL-текста
или файлов. Для разового удаления нужен взгляд на итоговый граф вызовов, DDL, права и active runtime;
для повторяемого поведения — поведенческий тест и одна fault injection на независимый класс.

Минимальный kill-set, который надо дополнить своим независимым чтением:

1. **Взгляд:** из webapp не осталось достижимого producer/retry/cron пути, который отправляет копию
   `reminder_rules` в integrator; из integrator не осталось route/write-port/direct-writer/retry operation,
   которое принимает и повторно пишет эту копию.
2. **Взгляд:** forward migration сначала переписывает две живые health/archive функции, затем без `CASCADE`
   удаляет две retired-функции и `public.integrator_push_outbox`, после чего сужает только один CHECK.
   Никакая зависимая функция не должна исчезнуть молча.
3. **Взгляд:** migration не выдаёт и не отзывает права; owner markers совпадают с владельцами объектов;
   declaration, function census и все generated DEV/TEST privilege/capability artifacts соответствуют
   конечному состоянию и получаются штатным generator check.
4. **Взгляд:** из system health, admin UI, archive filters, runbooks и maintenance tick удалена только
   retired outbox-классификация. Общая TTL-очистка архива и webhook-error retention продолжают работать.
   Исторические миграции, отчёты и pre-forward dump snapshots классифицируй как history/input, а не active gap.
5. **Тест:** create/update/toggle расписания напоминания продолжает писать каноническую
   `public.reminder_rules`; удалён только ложный `syncWarning`, сами формы, расписание и ошибка канонической
   записи не потеряны.
6. **Тест:** scheduler/materialize-wake продолжает читать актуальное правило webapp и создавать единственный
   delivery intent в `public.outgoing_delivery_queue`; integrator delivery path не зависит от снятого M2M POST.
7. **Тест:** оставшиеся direct-public retry operations (`markSent`, `markFailed`, orphan expiry,
   delivery-log и другие разрешённые операции) продолжают исполняться; удаление reminder-rule case не оставило
   missing imports, неверный switch или ослабленный retry CHECK.
8. **Тест/взгляд по природе пункта:** maintenance tick по-прежнему запускается scheduler-ом под общим именем,
   но больше не читает и не архивирует снятую outbox-таблицу.

## Проверки и границы

- Переиспользуй уже зелёные targeted suites на candidate SHA; не гоняй full CI. Запускай только тот
  дополнительный узкий тест, который даёт новый сигнал по твоему kill-set.
- Один раз проверь fault injection для каждого действительно независимого класса поведения, который иначе
  не доказан. Все временные поломки production-кода откати.
- Аудитор не исправляет product code. Постоянно можно оставить только необходимые acceptance tests и
  audit artifact; закоммить их явными путями до конца хода.
- Никаких `migrate-dev.sh --execute`, TEST/PROD, deploy, provider send, cronport, push, fixtures или
  disposable database. DEV schema уже проверена rollback-only лидом; повторять preflight без нового SHA не надо.
- Не трогать, не переключать, не сливать и не удалять Therapysto/night/reaudit/surface-map/flashcall ветки,
  worktree или файлы. Никакие ветки/worktree не удалять. `git add -A` запрещён.
- Finding существует только для достижимого нарушения owner requirement/repo-rule или конкретной regression
  с impact и evidence. Style, вкусовщина, альтернативная архитектура и speculative hardening — не finding.

## Результат

Создай
`docs/_TODO/runs/integrator-cleanup/D30_REMINDER_M2M_RETIREMENT_INDEPENDENT_AUDIT_2026-08-23.md`:

1. kill-set с классификацией «тест/взгляд» до чтения тестов;
2. verdict и evidence по каждому пункту;
3. отдельный разбор прав миграции по §1;
4. точные команды и фактические результаты; каждое число только рядом с породившей его командой;
5. финальный бинарный вердикт `PASS, FOR LAND` или `FAIL, NOT FOR LAND`;
6. одну готовую строку для `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` с candidate SHA, audit SHA,
   run-record и authority;
7. `NOT DONE:` даже если пусто.

Если найден только локализованный product fix — опиши точную строку/функцию и остановись: исправит лид.
Если найден новый цельный разрыв — опиши bounded scope; не запускай нового worker и не расширяй D30 сам.
