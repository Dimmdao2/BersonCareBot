# Ч2 — independent blind audit `72cbfa172`

## Роль и порядок

Ты `auditor-live`. Прочитай `AGENTS.md` §5, §7, §9, §10/§10a/§10b, §19, §24 и media module docs. Authority —
`docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md`, Ч2. Target product commit `72cbfa172`, branch
`wt/ch2-media-delivery` синхронизирована с актуальным `feat`.

**Тест или взгляд:** route authorization/delivery semantics и gate bypass — повторяемое поведение, blind kill-set
и fault injection; точный scope, отсутствие public fallback и отсутствие втягивания `patient_files`/upload —
inspection diff/state. Продуктовый fix не делать.

До чтения target diff, новых tests и worker report составь kill-set по authority/существующим route contracts:
какая поломка отдаст чужой object, пропустит platform exception, сломает HLS/MP4/preview или снова создаст public
URL. Затем inspect/tests. Worker tests/report — карта, не evidence.

DEV/TEST/PROD/DB/server/deploy/push не трогать. Временные product mutations полностью откатить; постоянными могут
остаться только acceptance tests и audit report.

## Обязательные проверки

1. Exact diff: одна дверь `authorizeMediaDelivery`; ровно пять handlers migrated; session/principal gates и
   route-specific status/cache/range/HLS/event semantics не ослаблены. `patient_files`, upload/multipart,
   preview-worker, storage delete/purge не втянуты.
2. Common door:
   - org-scoped row missing/foreign → not found, без S3/playback/event side effect;
   - platform base retry только после explicit `resolvePlatformLfkMediaAccess=true`;
   - program submission: uploader и doctor/admin allow, другой patient forbidden;
   - обычный same-org media сохраняет прежний allow behavior.
3. Каждый из пяти real handlers действительно вызывает дверь до downstream:
   base MP4 private 307/dynamic TTL/no-cache; preview body/signed/base fallback; playback descriptor same-origin
   HLS + `/api/media/id` MP4 fallback; HLS disabled 503, untrusted key и range behavior; playback/events без access
   не пишет telemetry. Проверить разницу 403 base против 401 остальных, если она была прежним контрактом.
4. Online-intake: private config → TTL presign; missing private config → empty/null/misconfigured result без
   `s3PublicUrl`; org/patient route authorization остаётся отдельным outer gate. Ни вечного URL, ни credential/key
   в log.
5. Gate `check-media-delivery-chokepoint`:
   - clean tree green и self-test red/green;
   - planted sixth route с прямыми primitives red;
   - alias import, relative import, dynamic import, re-export shim и namespace import не дают обойти тот же запрет;
   - `modules/**`/`app/api/**` direct `@/infra/s3/client` и сырой S3 SDK delivery path red;
   - route, который копирует ACL через app-layer helper/новое имя или прямой repo query, оценить по реальной
     достижимости: finding только если gate обещает structural protection, но такой новый путь проходит;
   - background/storage/delete paths не красить ложноположительно.
6. Fault injection минимум по одному независимому классу: снять door в одном handler; заставить platform retry
   без resolver; игнорировать submission ACL; вернуть public URL в online-intake; ослабить gate. Все должны быть
   пойманы existing/new acceptance; иначе оставить именованный red test/FINDING.

## Сдача

Targeted tests, gate/self-test, webapp typecheck/lint, `git diff --check`; полный CI не нужен. Report:
`docs/_TODO/runs/testsuite-v2/CH2_MEDIA_DELIVERY_BLIND_AUDIT_REPORT.md` с blind list, fault→killed/missed,
exact commands/counts, diff review, PASS/FAIL и `НЕ ПРОВЕРЕНО`.

Если PASS — один audit commit `#1082`, clean tree. Если FAIL — product не чинить; acceptance tests должны быть red
на target либо finding иметь exact reachable evidence. Галочку Ч2 не ставить.
