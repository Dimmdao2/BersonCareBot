# PR-02 — Health consent lifecycle

## Зависимости

D4 и S5-7 закрыты stable SHA; PR-01 принят; `G-01..G-05A` решены; legal text/version contract утверждён. `G-02`
обязан отдельно назвать применимое исключение статьи 10 либо письменную форму, вид электронной подписи и схему
идентификации. До этого checkbox/session/Telegram login не являются принятым consent mechanism.

## File scope gate

Allowed до exact manifest: только эта инициатива. Перед `doing` PR-00 registry задаёт точный список migration,
privacy domain/service/API/UI/test/docs files. Out of scope: billing, generic auth/RLS redesign, active S5/Product UX
plans и обработка новых целей вне утверждённого consent contract.

## Работа

- [ ] Хранить version, immutable text hash/reference, purpose/scope, operator/org context и locale.
- [ ] Текст согласия отделён от оферты/privacy policy и иных документов; обязательные реквизиты и электронный
      способ подписания соответствуют письменному заключению юриста.
- [ ] Учесть законных представителей/несовершеннолетних, повторное согласие и режим ранее собранных данных.
- [ ] Consent event: subject, timestamp, method, actor, identity/evidence, withdraw/supersede link.
- [ ] Проверять применимое основание в едином service/chokepoint перед новой protected processing.
- [ ] Повторное согласие при новой несовместимой цели; старое evidence остаётся неизменным.
- [ ] Дать субъекту видимый status/history и понятный withdraw flow.
- [ ] Отзыв прекращает будущую обработку по этому основанию, но не удаляет audit/legal evidence автоматически.

## Checks и выход

- Unit/integration/API/UI tests; tenant A не читает и не принимает consent tenant B.
- Concurrency/idempotency/retry и immutable-version tests.
- Synthetic TEST: accept → process allowed → withdraw → future processing denied/redirected по legal contract.
- Отдельный risk-based audit и owner/legal acceptance закрывают только consent stage.
