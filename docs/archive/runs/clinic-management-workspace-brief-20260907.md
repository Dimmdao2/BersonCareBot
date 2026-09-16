# Worker brief — clinic management workspace #1099

Работай одним stateful проходом в `/home/dev/dev-projects/bcb-wt-clinic-management-workspace-20260907`, ветка
`wt/clinic-management-workspace-20260907`. Authority:

1. `AGENTS.md` — сначала карта заголовков, затем полностью §1 (миграции/candidate preflight), §5, §7, §9–§12,
   §16–§17, §21–§22 и §24.
2. `docs/_TODO/CLINIC_MANAGEMENT_WORKSPACE_2026-09-07.md` — выполнить текущий candidate: M1, M2, M3, M4 и M6.
3. `docs/_TODO/CLINIC_SCHEDULE_ROLE_SCOPE_1028.md` — уже реализованный scope/appointment authority, который надо
   расширять/параметризовать, а не дублировать.
4. `docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md`, README и релевантные module/architecture docs.

## Обязательный результат этого прохода

- Реализовать целиком M1–M4 и M6, а не оставить scaffolding/placeholders.
- M5 Management appointments не выполнять: FullCalendar Premium resource-timegrid отсутствует, dependencies и
  самописная псевдосетка запрещены. Не ослаблять `/app/doctor/**` как обход.
- Для clinic composition весь doctor schedule всегда `mine`, включая owner/admin; существующий resolver #1028
  параметризовать режимом. Сначала ответь в ходе исследования: нельзя ли расширить существующие
  `resolveLaunchCapabilities`, schedule scope и appointment access resolver вместо новой функции/guard.
- Реализовать точную action matrix §5. `appointments.manage_own` не должен блокировать clinical comments и
  существующие financial/package operations. `availability.manage_own` не даёт CRUD общих шаблонов.
- Persistent permission fields провести через schema, timestamp migration, обе SECURITY DEFINER functions,
  typed maps/ports, обе function relationSurfaces и column-level UPDATE declaration. Defaults/backfill — `true`.
- Один typed `solo|clinic` composition resolver должен учитывать entitlement, seat status, unconfigured legacy и
  retained team after downgrade, как задано в §3.1.
- Переиспользовать существующие Settings/Schedule/Team/booking components и doctor shell/primitives. Одинаковая
  настройка имеет один component/API writer; не создавать визуально аналогичные контейнеры или второй engine.
- `DoctorTimezoneSelect` не переписывать. Сравнить названные commits/файлы из §7, локализовать фактическую
  visual/integration regression общего компонента/placement и исправить её минимально. Не заводить picker/data.

## Запреты и границы

- Воркер не создаёт и не изменяет тесты. Запрещены UI/DOM/text/count/source-shape/format/gate tests.
- Не выполнять live visual UI walkthrough, не занимать общий dev-server/порты.
- Не применять миграцию на DEV/TEST, не трогать PROD/deploy runtime, не добавлять зависимости.
- Не менять patient UI, integrator и global platform-admin. Findings вне file scope плана только перечислить.
- Не менять плановые owner-решения под удобство текущего кода.
- Не завершать ход в ожидании фонового процесса; проверки выполнять foreground и дождаться результата.

## Проверки и сдача

- Воркер выполняет formatter только для своих production/docs файлов, webapp typecheck, scoped ESLint и только
  уже существующие релевантные targeted behavior tests. Не запускать full CI без обнаруженного repo-level риска.
- Если создана migration, выполнить разрешённый §1 owner-aware rollback-only candidate preflight без apply на
  DEV; зафиксировать точную команду и результат.
- Перед коммитом показать `git status --short`, проверить diff и отсутствие чужих файлов.
- Коммитить только явные task paths (`git add -A` запрещён), один или несколько осмысленных commits с `#1099`.
  Не пушить и не land.
- Закончить отчётом: base SHA, tip SHA, commits, изменённые поверхности, reuse decisions, точные проверки и
  результаты, migration/preflight evidence, оставшиеся реальные blockers/findings. Незакоммиченных task-правок
  не оставлять.
