# Ч7-з — удалить платформенное принуждение 2FA поверх принятого Ч7 (#1082)

## Роль и authority

Ты bounded worker в свежей ветке от `wt/single-entry-integration` после merge Ч7 `c921cafa4`. Прочитай
`AGENTS.md` §1/§5/§7/§9/§10b/§24, `apps/webapp/src/modules/auth/auth.md`, guard/account docs,
`docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md` Ч7-з, доску миграций и прежний transplant report
`docs/_TODO/runs/testsuite-v2/DROP_2FA_ENFORCEMENT_TRANSPLANT_REPORT.md` из git object `359f27ee7`.

Источник оракула: распоряжение владельца 01.08 — «переключатель `auth_2fa_enabled` требует второй фактор от
всего персонала — удали». Добровольный TOTP пользователя остаётся: проверка требуется только человеку, который
сам завёл фактор; enrollment/status/verify/recovery и защита merge старого аккаунта не удаляются.

## Scope

Перенеси только продуктовый смысл `92388d1df`/свежего кандидата `359f27ee7` поверх уже принятого database-only
settings-кода. Не cherry-pick-ить commit вслепую: сначала сравни diff, затем перенеси минимальные hunks и разреши
auth/settings конфликты в пользу текущего `c921cafa4`.

- Удали platform-wide enforcement branch, admin toggle, registry/runtime key и связанные проверки/копирайтинг.
- Сохрани personal `securityFactorRequired`/session-state для пользователя с реально заведённым фактором.
- Старую migration `0300_remove_platform_staff_2fa_enforcement.sql` не переносить. Создай одну чистящую migration
  `0303_remove_platform_staff_2fa_enforcement.sql`; номер `0303` уже забронирован на доске. Она удаляет только
  мёртвые `auth_2fa_enabled` rows из runtime/system settings. Journal: после применённой `0299` и наших
  `0300–0302`, уникальные `idx=303`, `when>1793539230003`, правильный tag.
- Не трогай тарифы/биллинг, media, quota, RLS, integrator, Track D, migration `0299`, DEV/TEST/PROD/deploy/push.

Разрешены только реально необходимые auth/settings/guard/admin/account files, migration+journal, targeted tests,
одна строка Ч7-з и обновлённый bounded report.

## Acceptance

Обязательные наблюдаемые сценарии:

1. staff без заведённого TOTP входит в doctor/admin surfaces и не отправляется на `/app/account`;
2. staff с заведённым TOTP по-прежнему обязан подтвердить собственный фактор;
3. добровольные start/verify/status/recovery endpoints и merge-защита остаются достижимы;
4. `auth_2fa_enabled` отсутствует в production webapp source/UI/registry и чистится обеими settings-таблицами;
5. отсутствие ключа не вызывает `runtime_setting_unavailable` на password login после принятого Ч7.

Выполни targeted auth route/unit tests, webapp typecheck, targeted/full app lint, journal sync/preflight и scoped
`git diff --check`. DB/DEV/TEST не запускать. Обнови
`docs/_TODO/runs/testsuite-v2/DROP_2FA_ENFORCEMENT_TRANSPLANT_REPORT.md`, но не ставь финальную галочку до
независимого аудита. Коммитить product+tests+migration+report с `#1082`, точными командами и честным
`НЕ ПРОВЕРЕНО`; не пушить.
