# Ч1 — независимый blind audit двухстадийной upload-door

## Классификация «Тест или взгляд» — зафиксировать до проверки

- **Тест:** повторяемое поведение intent/received validation, переход pending→ready, отсутствие side effects
  при отказе, UI success/failure, auth denial и structural gate bypasses. Для них составить blind kill-set и
  вносить временные поломки по §10b/§24.5.
- **Взгляд/AST:** точная полнота миграции шести route, отсутствие лишнего scope/новых сущностей, wiring gate в
  lint/CI и граница с Ч1б. Проверять итоговый diff/import graph; не писать source-text tests на отсутствие строк.

## Роль, канон и target

Ты независимый `auditor-live`, не product fixer. До inspection прочитай `AGENTS.md` (§5, §7, §9,
§10/§10a/§10b, §24), `docs/ORCHESTRATION_BINDINGS.md`, Ч1/Ч1б плана и contracts существующего media-модуля.
Authority — `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md`, Ч1. Target product commit `e94b3069d` на
`wt/ch1-upload-current`. DB/server/DEV/TEST/PROD/deploy/push запрещены.

Источник оракула: Ч1 — «`ready` недостижим без validated received-object result, все шесть путей на двери,
structural gate с self-test запрещает седьмой обход».

До чтения target diff, target tests и worker report письменно зафиксируй blind kill-set и наблюдаемый impact.
Только затем инспектируй продукт. Worker сам указал отсутствие mocked route acceptance; его зелёные helper tests
и отчёт доказательством не являются.

## Human path и обязательный kill-set

Проверь весь путь человека, а не наличие helper/import:

1. **Intent:** все шесть intake routes выбирают закрытый именованный policy; unsupported MIME/extension,
   over-cap, empty/invalid filename отказывают до DB/folder/presign/storage. Caller не может передать
   произвольные `{allowedMime,maxBytes}` или скастовать марку.
2. **Received object:** declared `1` byte + больший HEAD, подменённый stored Content-Type и несовместимая magic/
   signature отвергаются; direct-to-S3 читает только HEAD + bounded prefix/range. Generic, individual,
   multipart и patient-submission не становятся ready на одном факте существования объекта/header MIME.
3. **Patient files:** до PUT/confirm запись pending и не видна как ready/не потребляет quota; presign, PUT или
   confirm failure не показываются UI как успех; успешный confirm атомарно создаёт корректный ready/file state;
   повтор/чужой file/org/patient denied до storage/state change.
4. **Proxy:** прежние empty/MIME/50 MiB/magic semantics сохранены, bytes не пишутся до принятого received result.
5. **Стена от обхода:** planted seventh route, alias/relative/dynamic/namespace/re-export, raw S3 SDK,
   renamed helper, direct pending/ready repository primitive и route storage write/presign/complete обязаны
   уронить существующий gate. Upload/background preview/delete/purge — отрицательные контроли. Self-test
   нельзя тривиально озеленить или выключить из lint/CI.
6. **Старые границы:** doctor workspace, org, patient, instance, entitlement и status semantics сохраняются;
   отказ происходит до storage side effects.

Ч1б остаётся отдельным этапом: orphan cleanup старых S3→DB/abandoned/invalid-confirm путей не превращать в finding
Ч1, если target не внёс новый регресс. Но минимальный rollback собственного нового confirm path проверяется.

## Evidence и сдача

Построй route-level acceptance по реальным экспортам/ports для всех шести путей, а не source-text assertions.
Fault injection должен временно ломать продукт и доказать red; все мутации откатить. Gate проверять fixtures для
каждой обещанной формы и negative controls. Выполнить target tests, новые acceptance, gate + `--self-test`,
typecheck, targeted lint и scoped `git diff --check`.

Отчёт `docs/_TODO/runs/testsuite-v2/CH1_UPLOAD_BLIND_AUDIT_REPORT.md`: target SHA; blind kill-set до inspection;
таблица `fault → killed/missed → exact command/assertion`; route/lifecycle matrix; findings только с достижимым
impact; PASS/FAIL; `НЕ ПРОВЕРЕНО`. При FAIL оставь постоянные красные acceptance oracles, product не исправляй и
галочку Ч1 не ставь. Audit artifact/test commit создаёт оркестратор после возврата.
