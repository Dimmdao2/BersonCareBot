# Auditor-live brief — clinic management workspace #1099

Работай одним независимым проходом в
`/home/dev/dev-projects/bcb-wt-clinic-management-workspace-20260907`, ветка
`wt/clinic-management-workspace-20260907`, только после завершения worker candidate. Authority:

1. `AGENTS.md`: сначала карта заголовков; затем полностью §1, §5, §9, §10a, §10b, §11, §16–§17, §21–§22,
   §24. Особенно обязательны §24.4 «тест или взгляд» и §24.5 blind audit.
2. `docs/_TODO/CLINIC_MANAGEMENT_WORKSPACE_2026-09-07.md`: аудит только текущего candidate M1–M4/M6 и M7.
   M5 owner-blocked и не является finding, если не реализован.
3. `docs/_TODO/CLINIC_SCHEDULE_ROLE_SCOPE_1028.md` и base..candidate diff, точные SHA будут переданы launcher scope.

## Сначала — blind kill-set и «тест или взгляд»

До чтения существующих тестов составь kill-set из owner requirements §§3–7 и отдельно классифицируй каждый fault:

- повторяемое поведение → существующий/новый допустимый behavior test;
- разовое состояние, UI-композиция, reuse, migration/declaration shape → взгляд, diff/AST/rg/introspection или
  rollback-only preflight; постоянный тест запрещён.

Минимальный kill-set должен охватывать без домысливания нового scope:

- doctor route owner/admin clinic membership не получает `clinic|specialist` scope прямым URL;
- `appointments.manage_own=false` закрывает create/reschedule/cancel/delete/no-show до side effect, но не закрывает
  own read, clinical comments и отдельно разрешённые financial/package operations;
- `availability.manage_own=false` закрывает own schedule mutations, а `true` не даёт CRUD общих templates;
- чужой tenant/membership/specialist ID не меняет permission и не даёт schedule mutation;
- defaults/backfill сохраняют прежнее поведение existing/new bound memberships; unbound membership не получает
  clinical capability; downgrade не стирает flags и не прячет retained team management;
- management-only user не попадает в doctor mode; specialist не получает management surfaces;
- solo/clinic composition следует §3.1 для entitlement, configured/unconfigured seats и retained team;
- обе SECURITY DEFINER functions и typed mapping возвращают новые поля без privilege drift.

## Жёсткие запреты на тесты и scope

- Не писать тесты количества/текста кнопок, вкладок, таблиц, пунктов меню, DOM, CSS/layout, source strings,
  импортов, числа файлов/колонок, migration formatting или иной формы написания кода.
- Не писать UI component tests для доказательства видимости/раскладки; это «взгляд».
- Не переписывать product code и не исправлять findings. Допустимы только намеренные acceptance-тесты и
  audit-artifact. Временные fault-injection product diffs обязательно откатить.
- Не выполнять live visual walkthrough, не занимать общий dev-server, не применять migration на DEV/TEST, не
  трогать PROD/deploy runtime и не запускать full CI без конкретного repo-level риска.
- Не расширять аудит на M5, patient UI, integrator или platform-admin.

## Проверка и результат

- Сначала проверить существующее покрытие против blind kill-set. Недостающий дорогой молчаливый permission/tenant/
  mutation fault защищать минимальным unit/route behavior test; всё остальное оставить разовой evidence.
- Для каждого добавленного acceptance-test выполнить ровно один релевантный fault injection и записать
  `временная поломка → конкретное покрасневшее утверждение → откат → зелёный тест`.
- Проверить base..candidate diff на дубли writers/components/resolvers, нарушение единого прохода §5, patient/
  doctor imports, новую визуально эквивалентную оболочку, migration/function/declaration coherence и отсутствие M5.
- Запустить только targeted tests/checks, необходимые для findings/evidence; назвать точные команды и результаты.
- Finding существует только при достижимом impact и точном нарушенном owner/repo требовании. Recommendation/style
  отдельно и не превращать в работу.
- Если созданы тесты/artifact: коммитить только явные пути (`git add -A` запрещён), commit message с `#1099`, не
  пушить/не land. Если ничего постоянного не требуется — оставить дерево чистым и не делать пустой коммит.
- Финал: PASS/FAIL; base/tip SHA; таблица blind faults с test/view evidence; fault injection evidence; findings с
  путём воспроизведения и impact; точные команды; audit commit SHA или «без постоянных изменений»; подтверждение,
  что временный product diff отсутствует.
