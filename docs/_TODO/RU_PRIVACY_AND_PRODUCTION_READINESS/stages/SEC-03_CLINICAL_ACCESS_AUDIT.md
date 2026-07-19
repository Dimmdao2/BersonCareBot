# SEC-03 — Clinical access audit

## Зависимости

D4 stable SHA; PR-00 endpoint/process inventory; audit retention/access model утверждён.

## File scope gate

Allowed до exact manifest: только эта инициатива. Перед `doing` фиксируются точные audit schema/port/service/store,
high-risk endpoint/process adapter, test и docs files. Out of scope: clinical payload logging, broad endpoint refactor,
active SaaS plans и central SIEM implementation из SEC-04.

## Работа

- [ ] Event contract: sensitive read/search/list, download/playback, export, mutation и permission deny.
- [ ] Поля: actor/principal/org/resource type/id/action/outcome/reason/request correlation/time.
- [ ] Запретить diagnosis, notes, message body, file bytes, token, cookie и secret в event payload.
- [ ] Защитить audit от tenant/user mutation; определить retention и investigation access.
- [ ] Покрыть high-risk APIs и background processes census/checker, чтобы новый path не обходил audit.

## Checks и выход

- Positive/negative audit tests, tenant isolation и tamper/access tests.
- Representative clinical/secret payload redaction tests.
- Coverage checker сопоставляет high-risk inventory с emitted event либо documented exclusion.
- Отдельный risk-based audit подтверждает ответ «кто/когда/к какому resource обращался».
