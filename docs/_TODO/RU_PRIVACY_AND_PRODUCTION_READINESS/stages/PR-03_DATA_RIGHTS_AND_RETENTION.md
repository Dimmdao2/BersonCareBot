# PR-03 — Data rights, retention and organization offboarding

## Зависимости

Для `PR-03A0` (temporary disable/gate + negative checker) PR-02 и retention matrix не требуются, потому что slice
только закрывает уже существующий destructive path и не добавляет deletion behavior, schema или срок. Остальной
PR-03 требует принятый PR-02 и утверждённую data ownership/retention matrix. Payment slice ждёт freeze C5B billing
contracts `#844/#845`; `#751` относится к C5A constructor/quotas/trial.

Stage делится на два gate:

- `PR-03A PRE-LAUNCH CONTAINMENT` — обязательный до `PR-04A`;
- `PR-03B PRE-PURGE AUTOMATION` — обязателен до включения любого необратимого purge и до полного закрытия
  инициативы, но large-export UX сам по себе не блокирует первый launch при доказанном `purge disabled`.

## File scope gate

Allowed до exact manifest: только эта инициатива. Для `PR-03A0` exact manifest из `PR-00` разрешает administrative
entrypoint/UI safe-disable, standalone census/checker/test и минимальную CI/package wiring после фиксации точных
путей. Перед каждым domain slice в LOG фиксируются конкретные schema/domain/service/API/job/S3/test/docs files.
Out of scope: изменение billing contracts `#844/#845` или C5A `#751`, active SaaS plans, strict-purge core,
unscoped delete scripts и production purge без dry-run/owner gate.

## PR-03A0 — close existing immediate hard-delete

- [x] Baseline честно FAIL: admin `POST .../permanent-delete` вызывает `runStrictPurgePlatformUser` с DB+S3
      hard-delete; operational `purge-by-id` также входит в census, а не остаётся скрытым bypass.
- [x] Administrative API/UI/operational entrypoints временно fail-closed до принятой retention state machine;
      strict-purge implementation не удаляется и не переписывается.
- [x] Census различает account/organization hard purge и resource-specific cleanup. `media-pending-delete` остаётся
      отдельным cleanup конкретного media resource.
- [x] Checker/test сначала подтверждает текущий FAIL, затем PASS только когда ни один administrative/runtime
      entrypoint не может запустить account/org irreversible purge.
- [x] Slice не создаёт `pending_deletion`, deadline, notification, export, S3 delete, job, timer или schema.
- [x] PASS доказывает только закрытие доступного immediate purge; он не закрывает `PR-03A`.

Worker implementation и correction round 1 завершены 2026-07-19 на base `d1fad7c65`; независимый audit и
integration commit остаются stage gate. `reset-user` включён в fail-close вместе с `purge-by-id`, потому что он
напрямую удалял `platform_users`. `integrator-clear-phone` и `integrator-purge-user-id` также fail-closed: они
необратимо удаляли integrator account, а первый дополнительно удалял Rubitime history, обходя тот же owner invariant.

## PR-03A — pre-launch containment

- [ ] Утверждена retention matrix, legal holds/exceptions и договорный текст; бессрочное хранение без основания
      отсутствует.
- [ ] Есть рабочий authenticated/manual intake для access/correction/termination requests: identity verification,
      SLA, responsible person, status и immutable audit. Автоматизированный bundle может быть ещё не готов.
- [ ] Любые timers/manual/admin paths необратимого purge технически выключены и покрыты negative checker/test;
      `pending_deletion` сохраняет данные, а offboarding не выполняет скрытый delete.
- [ ] Subject/organization requests до `PR-03B` исполняются ответственным по принятому manual runbook с evidence;
      это documented interim control, не заявление о готовом self-service UX.
- [ ] `PR-04A` содержит явный accepted deferral `PR-03B`, owner/deadline и доказательство `purge disabled`.

## PR-03B / Slice A — DSAR and correction automation

- [ ] Authenticated request workflow: status, SLA, assignee, identity verification и immutable audit trail.
- [ ] Экспортировать только данные субъекта в выбранном org context; чужой tenant/internal secrets исключены.
      Large-export implementation может идти отдельным поздним sub-slice `PR-03B`, но остаётся обязательной до
      включения purge и не отменяется готовностью request workflow.
- [ ] Исправление проходит domain services и оставляет audit/event evidence.
- [ ] Отказ/частичное исполнение содержит причину и legal hold/retention basis.

## PR-03B / Slice B — retention, deletion and offboarding automation

- [ ] Матрица БД/files/messages/audit/backups/payments → trigger → срок → action → exception → owner.
- [ ] Удаление аккаунта не является немедленным hard delete: `active → pending_deletion → reactivated | purge_due`.
      На `pending_deletion` данные клиента, файлы и связанные рабочие данные сохраняются, а повторная активация
      восстанавливает доступ без потери этих данных.
- [ ] Предварительный product target для окна восстановления — **90 дней**. Точный срок по классам данных и legal
      exceptions остаётся gate `G-03`; policy должна быть конфигурируемой/аудируемой, а не зашитой в нескольких
      delete-paths.
- [ ] До окончания recovery window запрещён физический purge клиентских данных/файлов. После срока purge или
      anonymize выполняется только идемпотентным job после legal-hold/retention checks; backup expiry живёт по
      отдельной утверждённой матрице.
- [ ] Никаких «тихих» удалений: до `purge_due` система несколько раз отправляет email-предупреждения о дате
      окончания recovery window. Cadence, минимальное число попыток, bounced-email policy и шаблоны являются одной
      versioned policy; каждое уведомление/ошибка доставки оставляет PII-bounded audit evidence.
- [ ] До purge пользователь получает возможность сформировать и скачать export bundle по time-bound authenticated
      link. Bundle включает принадлежащие практике исходные файлы, связанные patient files и исходные видео, плюс
      manifest/структурированное представление экспортируемых записей. Внутренние производные артефакты обработки
      (`HLS` segments/playlists, generated previews, служебные transcripts) не обязаны экспортироваться отдельными
      пользовательскими файлами, если соответствующий original включён и состав честно описан.
- [ ] Large-export flow рассчитан на несколько гигабайт: manifest/части или эквивалентная схема позволяют
      возобновить прерванную загрузку без повторной сборки и скачивания всего объёма; ссылки ограничены по времени,
      могут быть перевыпущены/отозваны и не раскрывают другой tenant.
- [ ] Purge не начинается, пока не записаны результаты обязательной reminder sequence и предоставления export
      window; точная policy для недоставленного email/не скачанного bundle остаётся частью `G-03`, а не скрытой
      догадкой job.
- [ ] Идемпотентные jobs + dry-run/counts + operator health; голый unscoped delete запрещён.
- [ ] S3 orphan cleanup и backup expiry согласованы с recovery/retention, включая versioned objects.
- [ ] Tenant offboarding: suspend → export → retention/legal hold → purge/anonymize → integration revoke → evidence.
- [ ] Переиспользовать strict user purge как primitive и добавить отсутствующие domain paths.

## Checks и выход

- Для каждого domain slice: targeted tests + tenant-negative + retry/idempotency + отдельный audit.
- State-machine tests: request deletion, повторный request, reactivation внутри окна, запрет раннего purge,
  переход в `purge_due` после policy deadline, legal hold и повторный безопасный job-run.
- Notification/export tests: versioned reminder schedule, duplicate-safe sends, delivery failure audit, signed-link
  expiry/revocation, bundle ownership/tenant negatives, originals included, чужие/internal secrets и производные
  media artifacts исключены, purge gate ждёт обязательное evidence.
- End-to-end synthetic TEST для access/export/correction/delete и org offboarding.
- Отчёт перечисляет исполненное, retained exceptions, сроки backup expiry и evidence references.
- Owner/legal acceptance закрывает data-rights stage отдельно от consent.
- Оферта/договор и privacy policy до включения механики явно называют recovery period, reminder policy, доступную
  выгрузку, retained/legal exceptions и момент необратимого удаления.

## Launch sequencing — owner, 2026-07-19

- Первый production launch может состояться до реализации large-export UX: работа остаётся в глобальной задаче
  `#905` после зависимостей `PR-02`.
- До готовности и отдельной проверки reminders/export необратимый purge не включается ни вручную, ни по таймеру.
  Предварительные 90 дней дают окно реализации, но не являются автоматическим разрешением на удаление.
- Следовательно, `PR-04A` требует принятый `PR-03A`, а не закрытый `PR-03B`. Полный Definition of Done инициативы и
  разрешение на purge требуют оба gate.
