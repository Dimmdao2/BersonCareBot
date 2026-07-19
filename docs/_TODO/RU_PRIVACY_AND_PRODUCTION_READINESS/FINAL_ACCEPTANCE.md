# Final acceptance — production readiness gate

Файл закрывается только фактами и ссылками на `EVIDENCE/`. Audit PASS без owner/legal acceptance не означает
production readiness.

## Privacy/legal

- [ ] Роли оператора/обработчика и цели обработки утверждены (`G-01`).
- [ ] Тексты/основания согласия, политика, договоры поручения и vendor register утверждены.
- [ ] Сведения РКН сверены/актуализированы ответственным лицом.
- [ ] Модель угроз, границы ИСПДн, уровень защищённости и матрица мер проверены профильным специалистом.
- [ ] Consent, revocation, DSAR, correction, delete и offboarding имеют end-to-end evidence.

## Application/data

- [ ] Tenant-negative tests закрывают новые privacy/audit/export/delete paths.
- [ ] Clinical access audit фиксирует success/deny/download/export без clinical payload.
- [ ] Retention jobs идемпотентны, наблюдаемы и не обходят legal holds/обязательные сроки.
- [ ] Payment retention согласован с финальным billing contract `#751`.
- [ ] Полный `pnpm run ci` зелёный на integration/release SHA.

## Host/secrets/storage

- [ ] SG/firewall/SSH/fail2ban и rollback проверены без deploy lockout.
- [ ] Service users/systemd sandbox/env permissions соответствуют утверждённой матрице.
- [ ] Все secrets имеют owner, storage, rotation, revoke и emergency procedure; один drill выполнен.
- [ ] S3 encryption/versioning/lifecycle/least privilege подтверждены machine-readable evidence.
- [ ] Backup encrypted, offsite, integrity-checked; restore завершён в допустимые RPO/RTO.

## Operations

- [ ] Central security logs и alerts проверены; секреты/clinical payload не попадают в лог.
- [ ] Access review/JML и break-glass drill закрыты.
- [ ] Vulnerability findings имеют severity, owner, SLA, exception expiry и повторную проверку.
- [ ] Incident tabletop закрывает detection, containment, evidence, 24/72 timers, communications и recovery.
- [ ] Owner принял residual risks (`G-12`) и отдельно открыл production change window (`G-11`).

## Итог

```text
Release SHA:
Technical audit:
External privacy/ISPDn review:
Owner decision: GO / NO-GO
Accepted residual risks:
Production window/task:
Date:
```
