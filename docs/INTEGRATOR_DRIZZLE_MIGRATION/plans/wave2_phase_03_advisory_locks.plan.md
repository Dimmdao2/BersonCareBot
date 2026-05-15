---
name: Wave2 Phase03 Advisory locks
overview: Унифицировать pg advisory lock/unlock вызовы в integrator и webapp через Drizzle execute(sql) в существующей сессии транзакции где нужно; задокументировать session vs xact семантику.
status: pending
isProject: false
todos:
  - id: p03-integrator-locks
    content: "apps/integrator: rubitimeApiThrottle.ts, schedulerLocks.ts — перевести на execute(sql) с тем же ключом/порядком lock/unlock; не менять ключи advisory."
    status: pending
  - id: p03-webapp-locks
    content: "apps/webapp: userLifecycleLock.ts, multipartSessionLock.ts, pgOnlineIntake.ts, pgDiaryPurge.ts, strictPlatformUserPurge.ts, s3MediaStorage.ts — единый паттерн (Drizzle tx + execute(sql) для advisory)."
    status: pending
  - id: p03-doc
    content: "Короткий абзац в LOG или ARCHITECTURE: какие lock transaction-level vs session-level; чеклист ревью для новых locks."
    status: pending
  - id: p03-verify
    content: "typecheck/test по затронутым пакетам (integrator + webapp fast/inprocess по политике репозитория); rg на оставшийся client.query с pg_advisory в зоне этапа."
    status: pending
---

# Wave 2 — этап 3: advisory locks

## Размер

**M** (мало файлов, но высокий риск дедлоков при ошибке порядка).

## Definition of Done

- [ ] Нет прямого `client.query('SELECT pg_advisory...')` в зоне этапа, кроме явно оставленного с комментарием ADR.
- [ ] Поведение lock/unlock совпадает с прежним (ключи, момент release).
- [ ] Документирована семантика xact vs session для затронутых мест.

## Scope

**Разрешено:** перечисленные файлы в todos; не трогать бизнес-правила напоминаний/медиа beyond lock wrapper.

**Вне scope:** смена модели блокировок на Redis и т.п.
