# Э3, круг 4: коррекция Д-4 — ручное слияние спрашивает человека и про отчество

**Оракул:** `docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md`, этап Э3;
`docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §18а.
**Находка:** `docs/audit/merge-e3-adversarial-round4-2026-09-15.md`, Д-4 (FAIL).
**Коммит коррекции:** `b03718f15`.

## Что было сломано

Четвёртая дверь того же правила — ручное слияние — обходила общий выбор ФИО: отчества не было в
`ManualMergeResolution`, предпросмотр прямо вычёркивал его конфликт из списка выбора, форма
оператора о нём не спрашивала, а SQL молча писал `COALESCE(NULLIF(trim(pu.patronymic),''),
NULLIF(trim(dup.patronymic),''))`. Это и есть движковый выбор ФИО, который этап обязан убрать.
Живой путь при этом до вопроса даже не доходил — падал с PostgreSQL `42846`.

## Что сделано

**Один шов, отдельной ветки «для отчества» нет.** Ручная ветка больше не собирает ФИО в SQL: она
идёт через тот же `resolveHumanFioField`, что и автоматический диалог (`resolveManualFioParts`,
`pgPlatformUserMerge.ts`). Ответ оператора приходит из `fields` как `{ source: winner }`, поэтому:

- поля **в конфликте** — фамилия, имя, отчество, подпись — берутся со стороны, которую выбрал
  человек;
- поле **без конфликта** дополняется молча и НЕ стирается выбором стороны, у которой его нет
  (§18а «с одной стороны пусто — дополняем недостающее»). Прежний SQL с `CASE` этого не умел:
  выбор карточки без отчества стирал единственное имеющееся.

**Ответ по отчеству стало невозможно не дать (ступень 1, конструкция).** `patronymic` —
обязательное поле `ManualMergeResolution.fields` (обе копии типа: пакет и `apps/webapp/src/infra/
repos/`), обязательное поле zod-схемы `POST /api/admin/account-merge/apply`. Резолюция без ответа
не компилируется, а по проводу отбивается `400 invalid_body` — движку некуда вернуть `COALESCE`.

**Человека спрашивают.** Предпросмотр (`platformUserMergePreview.ts`) больше не вычёркивает
конфликт отчества, а отдаёт его как `human_choice_required` наравне с фамилией и именем. В форме
оператора отчество вошло в `FIO_SCALAR_FIELDS` и в `setFioWinner`: ФИО по-прежнему одно решение на
карточку (правило владельца 13.09), но теперь карточка везёт и отчество, и в `fioSummary` оператор
видит ровно то, что запишется.

**Падение `42846` починено.** Причина: drizzle разворачивает `${[a, b]}` в шаблоне `sql` не в
массив, а в конструктор записи — получалось `ANY(($1, $2)::uuid[])`, а запись к `uuid[]` не
приводится. Проверено компиляцией фрагмента:
`sqlToQuery(sql\`... = ANY(${[a,b]}::uuid[])\`) → "... = ANY(($1, $2)::uuid[])"`.
Три места заменены на явный `ANY(ARRAY[${a}::uuid, ${b}::uuid])`: чтение каналов и чтение oauth в
ручной ветке (обе — на живом пути ручного слияния) и `enrichPickMergeCandidatesWithBookingCounts`(то же самое выражение; вызывается из автоматического phone-bind,`pgUserByPhone.ts:724`).

## Живой прогон на DEV

Каждый сценарий: `BEGIN` → настоящие `INSERT` → `mergePlatformUsersInTransaction(..., 'manual')` →
чтение `platform_users` и зеркала `user_identity` → `ROLLBACK`. Только именованная `bcb_webapp_dev`;
временной базы, миграций и второго Next-сервера нет. Каналы в резолюции взяты `both` — так прогон
проходит и через тот SQL, что падал с `42846`.

```bash
/home/dev/brain/host-orch/run-tests.sh "bash docs/audit/evidence/merge-e3-round4-fix-2026-09-15/run-live.sh \
  docs/audit/evidence/merge-e3-round4-fix-2026-09-15/live-manual-fio.mts"
```

```text
PASS M1 conflicting patronymics take the card the person chose
PASS M2 the mirrored choice writes the other patronymic
PASS M3 the only patronymic survives a card choice that has none
RESIDUE {"platform_users":0,"user_identity":0}
```

## Зубы: сломал — покраснело

| Что сломано                                                          | Набор               | Результат                                                                                  |
| -------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------ |
| Вернул `COALESCE(target, duplicate)` по отчеству в ручной ветке      | unit (2 файла)      | **Поймано**: `1 failed, 16 passed` — `writes the patronymic of the card the person chose…` |
| То же                                                                | живой прогон на DEV | **Поймано**: M1 красный, `+ patronymic: 'Петрович'` против `- patronymic: 'Сергеевич'`     |
| Вернул `ANY(${'${[targetId, duplicateId]}'}::uuid[])` в чтение oauth | живой прогон на DEV | **Поймано**: `error: cannot cast type record to uuid[]`, `code: '42846'`                   |

Продуктовый код после каждой инъекции восстановлен (`git checkout`), набор снова
`Test Files 2 passed (2) / Tests 17 passed (17)`. Полный вывод —
`evidence/merge-e3-round4-fix-2026-09-15/injections.out`.

## Три двери предыдущего круга

Сценарии автоматического диалога, которыми круг 3 был принят, прогнаны без изменений — файл
аудитора `evidence/merge-e3-adversarial-round4-2026-09-15/live-fio-scenarios.mts`:

```text
PASS 1a surname and patronymic complement silently
PASS 1b entirely empty side does not erase structured FIO
PASS 1c display choice preserves each separately confirmed part
PASS 2a empty recognized display falls back to the named side
PASS 2b mirrored empty recognized display also falls back
PASS 2c both empty stay empty without borrowing any other identity
PASS 2d conflicting display-only names write the chosen account name
PASS 3a a real structured conflict refuses an unanswered merge
PASS 3b a missing field alone creates no question
RESIDUE {"platform_users":0,"user_identity":0}
```

## Тест аудитора заменён, а не удалён

Аудитор оставил `refuses a manual merge when patronymics conflict but the resolution has no human
choice` — он ждал `MergeConflictError` от движка. После коррекции состояния «ответа нет» не
существует: его отбивает тип и zod-схема двери, то есть ступень выше теста (§10a «конструкция —
самая сильная»). Тест на это состояние был бы зелёным всегда и ни о чём.

Вместо него два теста на ВЫХОД цепочки — что записано в учётку после решения человека:
`writes the patronymic of the card the person chose when the two patronymics conflict` и
`keeps the only patronymic there is when the chosen card has none`. Оба краснеют от возвращённого
`COALESCE` (таблица выше) — то есть ловят ровно ту поломку, ради которой аудитор писал свой.

## Статическая проверка

```text
pnpm --dir packages/platform-merge run build              → rc=0
pnpm --dir apps/webapp exec tsc --noEmit --pretty false   → rc=0
pnpm --dir apps/integrator exec tsc --noEmit --pretty false → rc=0
pnpm --dir apps/webapp exec eslint <изменённые файлы>     → rc=0
prettier --check <изменённые файлы>                       → чисто
```

## Строка вердикта для ведущего (в `feat`, не в ветку)

```
Э3 круг 4 (Д-4): ручное слияние проведено через общий шов выбора ФИО — отчество обязательно в
ManualMergeResolution и zod-схеме двери, конфликт уходит человеку, непротиворечивое поле
дополняется молча; падение 42846 на живом пути починено (drizzle-массив → ARRAY[...]).
Коммит b03718f15, живой прогон DEV 3/3 + 9/9 прежних сценариев, 3/3 инъекции пойманы.
```

## НЕ СДЕЛАНО

- **Живьём в браузере форма оператора не проверялась.** Второй Next-сервер из клона поднимать
  нельзя (§1a), автоматические UI-тесты запрещены (§10a). Проверено на публичной границе ниже UI:
  движок (живой прогон на DEV), zod-схема двери и чистые помощники экрана
  (`FIO_SCALAR_FIELDS`, `setFioWinner`, `buildDefaultManualMergeResolution`). Клик по живой форме
  `/app/app/admin/account-merge` на общем DEV-сервере — за ведущим.
- **Полный CI не запускался** — прямой запрет брифа; запускает ведущий после приземления.
- **Миграции на DEV не применялись**, привилегии не менялись: правка чисто кодовая, новых объектов
  и колонок нет.
- **Строка вердикта в `feat` не занесена** — автор свою работу не подписывает; текст выше.
- **Дубль типа `ManualMergeResolution`** (пакет + `apps/webapp/src/infra/repos/`) не устранён:
  дедупликация файла в скоуп Д-4 не входит. Расхождение копий при этом не молчаливое — webapp
  передаёт свой тип в функцию пакета, поэтому лишнее или недостающее поле ловит `tsc`.
