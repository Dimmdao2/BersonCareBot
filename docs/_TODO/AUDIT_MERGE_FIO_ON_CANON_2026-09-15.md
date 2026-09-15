FAIL

# Аудит сведения Э1 + Э3 + Э4a в серверном движке слияния

**Кандидат:** `f4b46990b68192d3dde2886990125e95b4e6cf7d` (`bb27f91c9` — код).

**Authority:** `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §18, §18а, §18б;
`docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md`, Э3: «Убрать движковый выбор ФИО».

## Блокирующая находка

### F1. Дверь врача сливает без сохранённого ответа человека и молча оставляет ФИО target-учётки

Достижимый путь:

1. человек подтверждает найденный аккаунт и выбирает ФИО;
2. `assertAutomaticMergeHasNoMedicalHistory` бросает медицинский блокер до ветки записи ФИО;
3. внешняя транзакция откатывается, а `recordPatientMedicalMergeConflict` сохраняет только пару,
   организацию и `source`;
4. после одобрения врачей `StaffApprovedMergePlatformUsersOptions` не содержит `humanDecision`, но
   `mergePlatformUsersInTransaction` завершает слияние и не записывает ФИО — остаётся ФИО target,
   выбранной движком до диалога.

Это нарушает §18а и прямой критерий проверки: путь без ответа человека обязан не собираться или
отказывать, а не оставлять сторону, выбранную движком. §18б даёт врачу ровно «слить»/«отказать», но
не отменяет выбор ФИО человеком и не разрешает молча заменить его target-стороной. Поэтому аргумент
в пользу отдельного `StaffApprovedMergePlatformUsersOptions` каноном не держится.

Живое доказательство на исходном продукте: во временной копии двухклиничного proof assertion требовал
отказа, если сохранённого `humanDecision` нет; продукт вернул сначала
`awaiting_other_organization`, затем `merged`.

```text
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-conflict-screens && RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 node --test --test-name-pattern='конфликт в двух клиниках' deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"

doctor A merge returned: ... "mergeOutcome":"awaiting_other_organization"
doctor B merge returned: ... "mergeOutcome":"merged"
RESULT: FAIL — doctor path merged the accounts without a persisted human FIO decision
tests: 1, pass: 0, fail: 1
rolled back; fixture rows left in the database: 0
```

Вторая живая проба передала решение `last_name = duplicate` в автоматическую дверь и положила
`doctor_notes` обеих сторон в одной организации. Движок бросил `MergeDependentConflictError` до
записи: в `platform_users` и `user_identity` остался target `Иванов`, выбранный человеком
`Сидоров` нигде не сохранился.

```text
/home/dev/brain/host-orch/run-tests.sh 'audit_tmp=$(mktemp -d); trap "rm -rf -- \"$audit_tmp\"" EXIT; node_modules/.pnpm/@esbuild+linux-x64@0.28.2/node_modules/@esbuild/linux-x64/bin/esbuild docs/audit/evidence/merge-fio-on-canon-2026-09-15/e3-live-fio-scenarios.rerun.mts --bundle --platform=node --format=esm --banner:js="import { createRequire } from '\''node:module'\''; const require = createRequire(import.meta.url);" --outfile="$audit_tmp/e3-live.mjs" --alias:pg=/home/dev/dev-projects/bcb-wt-conflict-screens/apps/webapp/node_modules/pg --external:pg-native --external:cloudflare:sockets >/dev/null; chmod -R a+rX "$audit_tmp"; sudo -n -u postgres env AUDIT_PGHOST=/var/run/postgresql /usr/bin/node "$audit_tmp/e3-live.mjs"'

PASS 4a medical gate fires before the confirmed FIO choice is written
RESIDUE {"platform_users":0,"user_identity":0}
```

Проверка пути хранения: `recordPatientMedicalMergeConflict` вызывает
`app.record_patient_medical_merge_conflict(uuid,uuid,uuid,text)`; ни его сигнатура, ни payload
(`source`) не несут prompt/выбор ФИО. Временные assertions и изменения продуктового кода откатены.

**Последствие:** человек выбрал правильное ФИО, медицинский конфликт ушёл врачам, после их
одобрения аккаунты слились с другой подписью без предупреждения. Это дорогая молчаливая ошибка
данных, а не вопрос стиля.

## Три механики

- **Э1 — цело.** Тело гейта побайтно совпадает с приземлённым Э1; живой набор подтвердил одну
  организацию, разные организации, `NULL ↔ NULL`, `NULL ↔ организация` и полный список конфликтных
  организаций. Снятие границы организации красит два cross-org сценария.
- **Э4a — цело в своей границе.** Вызов идёт через
  `app.transfer_staff_approved_platform_user_merge_data`; живая роль врача получает
  `awaiting_other_organization`, чужая организация — `conflict_not_found`, последняя своя клиника —
  `merged`. Снятие сверки организации красит foreign-org сценарий. Пересечение с Э3 — F1 выше.
- **Э3 — ослабло.** Автоматическая и ручная двери требуют/применяют выбор человека и ловят возврат
  движкового выбора, но отложенная до врача дверь принимает опции без `humanDecision` и сливает.

Точное сравнение Э1 и Э4a с первым родителем merge-кандидата:

```text
for audit_rev in 8e5c1b40e f4b46990b; do printf '%s gate ' "$audit_rev"; git show "$audit_rev:packages/platform-merge/src/pgPlatformUserMerge.ts" | sed -n '/^async function assertAutomaticMergeHasNoMedicalHistory(/,/^}$/p' | sha256sum; done
8e5c1b40e gate 5db894a67fb72959bab8783044d769340deafb1c0d72f8aa37d119153e5d86b4
f4b46990b gate 5db894a67fb72959bab8783044d769340deafb1c0d72f8aa37d119153e5d86b4

for audit_rev in 8e5c1b40e f4b46990b; do printf '%s doctor_door ' "$audit_rev"; git show "$audit_rev:apps/webapp/db/drizzle-migrations/20260914T220000_doctor_resolves_medical_merge_conflict.sql" | sed -n '/^CREATE OR REPLACE FUNCTION app.transfer_staff_approved_platform_user_merge_data(/,/^\$function\$;$/p' | sha256sum; done
8e5c1b40e doctor_door 5d3bd4493b22f1915e380b761378f62161871c1129a2acab2d0eff128a383383
f4b46990b doctor_door 5d3bd4493b22f1915e380b761378f62161871c1129a2acab2d0eff128a383383
```

## Инъекции

| Поломка | Красные | Остались зелёными |
|---|---:|---|
| Э1: JOIN организаций заменён на `ON true` | 2 сценария (`different-organization doctor notes`, `canonical cross-organization notes`) | 19 остальных сценариев; на уровне `node:test` 1 pass / 1 fail |
| Э4a: из двери убрана сверка организации конфликта | 1 выбранный тест | 0; чужой врач получил `awaiting_other_organization` вместо `conflict_not_found`, `rollback rows=0` |
| Э3: отсутствие выбора конфликтного поля снова возвращает target | 1 сценарий (`3a`) | 7 предыдущих сценариев `1a`–`2d`; `3b` после первого падения не запускался |
| Э1: список конфликтных организаций обрезан до первой | 1 сценарий (`all conflicting organizations`) | 21 остальных сценарий; на уровне `node:test` 1 pass / 1 fail |

Все четыре поломки внесены в продуктовый код/кандидатное тело функции по одной, прогнаны через
host-lock и откатены. Непойманных обязательных инъекций: **0**.

Точные команды прогонов для чисел таблицы:

```text
# Э1, обе инъекции продуктового TypeScript — одна команда после каждой отдельной временной правки
/home/dev/brain/host-orch/run-tests.sh "sudo -n bash -lc 'cd /home/dev/dev-projects/bcb-wt-conflict-screens && RUN_PLATFORM_USER_MERGE_DB=1 exec apps/webapp/node_modules/.bin/tsx --test deploy/postgres/privileges/platform-user-merge.devDbProof.test.mjs'"

# Э4a, снята сверка организации в кандидатном теле функции
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-conflict-screens && RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_FAULT=foreign-org-conflict DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 node --test --test-name-pattern='врач чужой организации' deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"

# Э3, временно возвращён target при отсутствующем выборе; bundle запускает именно изменённый source этого клона
/home/dev/brain/host-orch/run-tests.sh 'audit_tmp=$(mktemp -d); trap "rm -rf -- \"$audit_tmp\"" EXIT; node_modules/.pnpm/@esbuild+linux-x64@0.28.2/node_modules/@esbuild/linux-x64/bin/esbuild docs/audit/evidence/merge-fio-on-canon-2026-09-15/e3-live-fio-scenarios.rerun.mts --bundle --platform=node --format=esm --banner:js="import { createRequire } from '\''node:module'\''; const require = createRequire(import.meta.url);" --outfile="$audit_tmp/e3-live.mjs" --alias:pg=/home/dev/dev-projects/bcb-wt-conflict-screens/apps/webapp/node_modules/pg --external:pg-native --external:cloudflare:sockets >/dev/null; chmod -R a+rX "$audit_tmp"; sudo -n -u postgres env AUDIT_PGHOST=/var/run/postgresql /usr/bin/node "$audit_tmp/e3-live.mjs"'
```

## Базовые прогоны

1. Гейт Э1 после добавления независимого oracle полного списка:

   ```text
   /home/dev/brain/host-orch/run-tests.sh "sudo -n bash -lc 'cd /home/dev/dev-projects/bcb-wt-conflict-screens && RUN_PLATFORM_USER_MERGE_DB=1 exec apps/webapp/node_modules/.bin/tsx --test deploy/postgres/privileges/platform-user-merge.devDbProof.test.mjs'"
   tests=2 pass=2 fail=0; scenarios=22; residual_rows=0
   ```

2. Дверь врача после изоляции fixture-assertion от посторонних pending-строк DEV:

   ```text
   /home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-conflict-screens && RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"
   tests=4 pass=4 fail=0; четыре proof-транзакции: fixture rows left=0 каждая
   ```

3. Э3 против движка этого клона: автоматические сценарии `9/9`, ручные `3/3`, в обоих прогонах
   `platform_users=0`, `user_identity=0` после `ROLLBACK`.

   ```text
   /home/dev/brain/host-orch/run-tests.sh 'audit_tmp=$(mktemp -d); trap "rm -rf -- \"$audit_tmp\"" EXIT; node_modules/.pnpm/@esbuild+linux-x64@0.28.2/node_modules/@esbuild/linux-x64/bin/esbuild docs/audit/evidence/merge-fio-on-canon-2026-09-15/e3-live-fio-scenarios.rerun.mts --bundle --platform=node --format=esm --banner:js="import { createRequire } from '\''node:module'\''; const require = createRequire(import.meta.url);" --outfile="$audit_tmp/e3-live.mjs" --alias:pg=/home/dev/dev-projects/bcb-wt-conflict-screens/apps/webapp/node_modules/pg --external:pg-native --external:cloudflare:sockets >/dev/null; chmod -R a+rX "$audit_tmp"; sudo -n -u postgres env AUDIT_PGHOST=/var/run/postgresql /usr/bin/node "$audit_tmp/e3-live.mjs"'
   /home/dev/brain/host-orch/run-tests.sh 'audit_tmp=$(mktemp -d); trap "rm -rf -- \"$audit_tmp\"" EXIT; node_modules/.pnpm/@esbuild+linux-x64@0.28.2/node_modules/@esbuild/linux-x64/bin/esbuild docs/audit/evidence/merge-fio-on-canon-2026-09-15/e3-live-manual-fio.rerun.mts --bundle --platform=node --format=esm --banner:js="import { createRequire } from '\''node:module'\''; const require = createRequire(import.meta.url);" --outfile="$audit_tmp/e3-manual.mjs" --alias:pg=/home/dev/dev-projects/bcb-wt-conflict-screens/apps/webapp/node_modules/pg --external:pg-native --external:cloudflare:sockets >/dev/null; chmod -R a+rX "$audit_tmp"; sudo -n -u postgres env LIVE_PGHOST=/var/run/postgresql /usr/bin/node "$audit_tmp/e3-manual.mjs"'
   ```

4. Типы:

   ```text
   pnpm --filter @bersoncare/platform-merge exec tsc --noEmit -p tsconfig.json && pnpm --dir apps/webapp exec tsc --noEmit -p tsconfig.json && pnpm --dir apps/integrator exec tsc --noEmit -p tsconfig.json
   exit=0
   ```

Итоговая проверка остатка точным запросом по всем ID и маркерам этих проб:

```text
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -Atc \"SELECT 'platform_users=' || count(*) FROM public.platform_users WHERE id::text IN ('00000000-0000-4000-8000-00000000e1a1','00000000-0000-4000-8000-00000000e1a2','00000000-0000-4000-8000-00000000d1a1','00000000-0000-4000-8000-00000000d1a2','00000000-0000-4000-8000-00000000d2a1','00000000-0000-4000-8000-00000000d2a2','00000000-0000-4000-8000-00000000f1a1','00000000-0000-4000-8000-00000000f1a2','00000000-0000-4000-8000-0000000c2001') OR display_name LIKE '%E3A4_20260915%' OR display_name LIKE '%E3FIX_MANUAL_20260915%'; SELECT 'merge_candidates=' || count(*) FROM public.patient_merge_candidates WHERE id::text IN ('00000000-0000-4000-8000-00000000e1c1','00000000-0000-4000-8000-00000000d1c1','00000000-0000-4000-8000-00000000d1c2','00000000-0000-4000-8000-00000000d2c1','00000000-0000-4000-8000-00000000f1c1','00000000-0000-4000-8000-00000000f1c2'); SELECT 'proof_orgs=' || count(*) FROM public.be_organizations WHERE id::text IN ('00000000-0000-4000-8000-0000000c1001','e3a40000-0000-4000-8000-000000000001') OR title LIKE '%E3A4_20260915%'; SELECT 'proof_visits=' || count(*) FROM public.clinical_visit WHERE patient_user_id::text IN ('00000000-0000-4000-8000-00000000e1a1','00000000-0000-4000-8000-00000000e1a2','00000000-0000-4000-8000-00000000d1a1','00000000-0000-4000-8000-00000000d1a2','00000000-0000-4000-8000-00000000f1a1','00000000-0000-4000-8000-00000000f1a2'); SELECT 'e3_identity=' || count(*) FROM public.user_identity WHERE display_name LIKE '%E3A4_20260915%' OR display_name LIKE '%E3FIX_MANUAL_20260915%';\""
platform_users=0
merge_candidates=0
proof_orgs=0
proof_visits=0
e3_identity=0
```

## Проверка путей доказательств

Команда:

```text
rg -n "/home/dev/dev-projects/" docs/audit/evidence/merge-fio-on-canon-2026-09-15
```

Актуальные `e3-live-fio-scenarios.rerun.mts` и `e3-live-manual-fio.rerun.mts` указывают на
`/home/dev/dev-projects/bcb-wt-conflict-screens`. Старые артефакты в
`merge-e3-adversarial-round4-2026-09-15` и `merge-e3-round4-fix-2026-09-15` указывают на
`bcb-wt-fio-dialog` и доказательством этого кандидата не считались.

## Изменения acceptance-набора

- В `platform-user-merge.devDbProof.test.mjs` добавлен независимый сценарий, проверяющий возврат
  обеих конфликтующих организаций; инъекция обрезки до первой его красит.
- В `doctor-medical-merge-two-clinics.proofBody.mjs` indicator-assertion ограничен собственным
  `CONFLICT_A`: до правки полный базовый набор ложно краснел `2 вместо 1`, потому что считал
  постороннюю реальную pending-строку той же DEV-клиники.

## НЕ СДЕЛАНО

- F1 не исправлялся: аудитор продуктовый fix не делает, а в плане нет отдельного решения о хранении
  ответа через медицинский defer. Для приёмки Э3 всё равно обязателен результат §18а: сохранить и
  применить исходный выбор либо отказать до появления такого ответа.
- Миграции в DEV не применялись; кандидатные функции и права жили только внутри транзакций с
  `ROLLBACK`.
- PROD, TEST, общий Next-сервер, `pnpm run ci` и `scripts/ci-record.mjs` не трогались.
- Строка вердикта в `feat` не добавлялась.
