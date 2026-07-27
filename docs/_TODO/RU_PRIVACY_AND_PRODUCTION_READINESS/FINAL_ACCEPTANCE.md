# Final acceptance — production readiness gate

> **SUPERSEDED AS TARGET — 2026-07-27.** Release conditions о push-only и запрете product Telegram/MAX/email/SMS ниже не могут блокировать release: они заменены строкой **«Уведомления»** в [`CURRENT_AUTHORITY_MAP.md`](../../CURRENT_AUTHORITY_MAP.md) (`OWNER_PRODUCT_RULES.md` §2, §15, §21–§25).

Файл закрывается только фактами и ссылками на `EVIDENCE/`. Audit PASS без owner/legal acceptance не означает
production readiness.

Два состояния:

- `LAUNCH GO` допускает только явно принятую отсрочку `PR-03B`, если `PR-03A` закрыт и irreversible purge доказанно
  disabled; все остальные launch-blocking пункты закрыты;
- `INITIATIVE COMPLETE` требует закрыть и `PR-03B`, включая export/reminders/purge/offboarding automation.

## Privacy/legal

- [ ] Роли оператора/обработчика и цели обработки утверждены (`G-01`).
- [ ] Тексты/основания согласия, политика, договоры поручения и vendor register утверждены.
- [ ] Для health consent внешний юрист подтвердил применимое основание, письменную форму/электронную подпись,
      отдельный текст и режим представителей/legacy data; checkbox сам по себе не принят как доказательство.
- [ ] Сведения РКН сверены/актуализированы ответственным лицом.
- [ ] Модель угроз, границы ИСПДн, уровень защищённости и матрица мер проверены профильным специалистом.
- [ ] Организационные меры (`G-06A`) и письменный Selectel gate (`G-04A`) закрыты.
- [ ] Consent/revocation имеют end-to-end evidence; для `LAUNCH GO` DSAR/correction/termination имеют принятый
      manual `PR-03A` evidence, для `INITIATIVE COMPLETE` — полный automated `PR-03B` evidence.
- [ ] Оферта/договор и privacy policy совпадают с фактическими recovery/reminder/export/purge правилами.

## Application/data

- [ ] Для launch закрыт `PR-03A`: manual authenticated request process работает, retention/legal holds утверждены,
      необратимый purge технически disabled и это покрыто проверкой.
- [ ] Tenant-negative tests закрывают все реализованные privacy/audit paths; export/delete automation добавляется
      в этот gate вместе с `PR-03B`, а до него checker доказывает отсутствие irreversible purge path.
- [ ] Clinical access audit фиксирует success/deny/download/export без clinical payload.
- [ ] Retention jobs идемпотентны, наблюдаемы и не обходят legal holds/обязательные сроки.
- [ ] До purge доказаны recovery window, несколько email reminders и доступный export bundle с исходными
  файлами/видео без tenant leakage; многогигабайтная выгрузка возобновляется после прерывания; реактивация внутри
  окна сохраняет данные.
- [ ] Если `PR-03B` ещё не закрыт при launch: пункт выше отмечен как accepted deferral с owner/deadline; ни один
      manual/timer/job/API path не может выполнить irreversible purge. Полное закрытие инициативы ждёт `PR-03B`.
- [ ] Payment retention согласован с финальным billing contract `#751`.
- [ ] Полный `pnpm run ci` зелёный на integration/release SHA.
- [ ] Product events создают canonical in-app state и только разрешённый push intent; Telegram/MAX способны только
      на login/bind code/auth handshake и не имеют product callbacks/menu/support relay.
- [ ] Web Push/APNs/FCM content соответствует `T0–T3`: routine date/time/payment/status полезны; raw clinical/chat/
      intake/task/file/secret payload отсутствует. No push target не включает hidden fallback.
- [ ] Booking/reminder/broadcast/support push не зависит от messenger target/job success; legacy pending product
      messenger jobs закрыты controlled cutover evidence.
- [ ] APNs/FCM `G-04B` и store privacy declarations закрыты до native production delivery.

## Host/secrets/storage

- [ ] SG/firewall/SSH/fail2ban и rollback проверены без deploy lockout.
- [ ] Service users/systemd sandbox/env permissions соответствуют утверждённой матрице.
- [ ] Все secrets имеют owner, storage, rotation, revoke и emergency procedure; один drill выполнен.
- [ ] Новый PROD имеет проверенный LUKS/encrypted-data boundary, encrypted/no swap, PG checksums и отдельный
      recovery path; plaintext old host не остаётся постоянным fallback.
- [ ] Client-side encryption чувствительных S3 objects подтверждено; versioning/delete-all-versions проверены;
      retention/purge реализованы приложением, поскольку Bucket Lifecycle не поддерживается Selectel; anonymous
      deny и least privilege подтверждены machine-readable evidence.
- [ ] Backup encrypted, offsite, integrity-checked; restore завершён в допустимые RPO/RTO.
- [ ] Существующие plaintext backups и legacy plaintext media имеют закрытый migration/deletion manifest.

## Operations

- [ ] Central security logs и alerts проверены; секреты/clinical payload не попадают в лог.
- [ ] `G-06B` имеет явный verdict: adopted EDR/HIDS доказал detection/load/alert/rollback и отдельный RU sink либо
      внешний reviewer принял проверенные compensating controls; отсутствие решения не считается `not applicable`.
- [ ] Access review/JML и break-glass drill закрыты.
- [ ] Vulnerability findings имеют severity, owner, SLA, exception expiry и повторную проверку.
- [ ] Incident tabletop закрывает detection, containment, evidence, 24/72 timers, communications и recovery.
- [ ] Incident classification не запускает 24/72 для любого события автоматически; применимый сценарий включает
      утверждённый порядок взаимодействия с ГосСОПКА.
- [ ] Owner принял residual risks (`G-12`) и отдельно открыл production change window (`G-11`).
- [ ] Synthetic sensitive markers отсутствуют в SQL/application/provider logs, delivery attempts, queue/retry/
      dead-letter terminal records; correlation/status/error-code диагностика сохранена.

## Итог

```text
Release SHA:
Technical audit:
External privacy/ISPDn review:
Owner decision: GO / NO-GO
Acceptance state: LAUNCH GO / INITIATIVE COMPLETE
Accepted residual risks:
Production window/task:
Old-host/snapshot/plain-copy deletion evidence:
Date:
```
