# Тест или взгляд: Track D TEST login-code delivery capabilities

Смешанный независимый pass: policy/route/worker behavior и exact PostgreSQL principals — тест; capability scope,
ACL overlays, callgraph и отсутствие второго delivery path — взгляд.

Источник оракула: `docs/_TODO/runs/briefs/TRACK_D_LOGIN_DELIVERY_CAPABILITIES_BRIEF.md` — «closed SECURITY DEFINER capability/ports, no broad table SELECT».

## Scope

Кандидат: `1611bdeab` в `wt/trackd-login-delivery`, временная high-number migration. Root назначит финальный
последовательный номер только после PASS и непосредственно при land. DEV/TEST/PROD, сервисы и порты не трогать.

## Обязательный kill-set

1. Повторить callgraph трёх исходных runtime-failures и доказать, что production code больше не читает
   `public.system_settings` напрямую для auth-channel policy, platform availability или reclaim config и не
   делает ambient INSERT/UPDATE для provider-failure incident.
2. Auth channel: explicit true разрешает OTP; explicit false, missing, malformed, denied/unreachable запрещают
   его до SMTP/provider probe и до `dispatchPort`. Generic email behavior не расширять.
3. Platform availability: persisted false для email реально запрещает provider dispatch; missing/malformed/denied
   fail-closed, не возвращаются к compiled-in default. Проверить route/worker call site, а не только parser.
4. Reclaim worker: custom persisted thresholds реально доходят до claim/reclaim; missing/malformed/denied дают
   documented safe defaults; capability не может прочитать SMTP/provider secrets или произвольный key.
5. Provider incident: отказ SMTP/email открывает/touch ровно canonical dedup incident через capability. Проверить,
   не позволяет ли API/worker role произвольными параметрами портить unrelated incident rows; broad INSERT/UPDATE/
   DELETE/SELECT на `public.operator_incidents` запрещены.
6. На одноразовом PostgreSQL применить migration и оба overlay к минимально достаточной exact schema/roles либо
   существующему disposable harness. Под фактическими API runtime, delivery-worker и прочими operational roles
   доказать EXECUTE matrix, отсутствие table/column ACL и отсутствие PUBLIC/grant-option residue. Reapply должен
   быть идемпотентен и снова scrub unexpected grants.
7. OTP остаётся на существующем signed `/api/bersoncare/send-email` → `dispatchPort` → email adapter path; прямого
   `sendMail`/второй очереди/нового delivery-handler нет. Код и секреты не появляются в логах/evidence.
8. Fault injection: снять function EXECUTE, вернуть direct table read, подставить persisted false, выдать broad
   table ACL и лишний grantee; acceptance обязан покраснеть. Каждую временную поломку восстановить byte-identically.
9. Targeted tests, integrator typecheck/lint, raw-SQL/import/queue gates, migration freeze/diff-check. Full CI не
   запускать.

## Verdict

`PASS` только при полном kill-set и чистом дереве. Иначе один `MUST FIX` с достижимым сценарием и точным
нарушенным requirement. Записать отчёт в `docs/_TODO/runs/integrator-cleanup/` и обновить audit queue отдельным
audit-коммитом; продукт не менять, push не выполнять.
