# Ч7-з — bounded fix обхода добровольно включённого TOTP (#1082)

Прочитать `AGENTS.md`, особенно §5, §10a/§10b и §24. Authority: решение владельца и принятый scope в
`docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` для `22a7a1acb`; точный finding и постоянный красный oracle —
`docs/_TODO/runs/testsuite-v2/DROP_2FA_ENFORCEMENT_AUDIT_REPORT.md`, F1.

## Последствие

Global admin, который сам включил TOTP, после входа через email-OTP получает platform API без проверки своего
фактора. Удаление обязательной платформенной 2FA не должно ослаблять добровольно заведённый фактор.

## Scope

Исправить ровно F1 минимально на общей session/guard-двери, чтобы любой staff session с
`securityFactorRequired=true` не получал doctor/platform workspace до `factor_verified`, независимо от первичного
login path. Не возвращать `auth_2fa_enabled`, общий toggle, принудительный enrollment или редирект staff без
собственного фактора. Recovery и identity-self security API должны остаться достижимыми по уже принятому контракту.

Источник оракула: owner scope на доске — «убрать именно обязательное платформенное принуждение; добровольный TOTP,
recovery и защита уже заведённого фактора остаются»; fixed oracle —
`requestAccess.route.test.ts` test `keeps platform operations closed when an enrolled factor is not verified in-session`.

## Приёмка и сдача

1. Тот же targeted набор `passwordAuth.route.test.ts` + `requestAccess.route.test.ts` полностью зелёный.
2. Source census активного `auth_2fa_enabled|platformRequiresStaffTwoFactor` остаётся 0.
3. Scoped lint, webapp typecheck и `git diff --check` зелёные.
4. Новый blind audit/fault injection не запускать: kill-set уже принят. Обновить существующий audit report итогом fix.
5. Коммитить только product fix, существующий oracle/report и необходимую документацию. DEV/TEST/PROD и миграции не
   трогать, не пушить.

