# Independent audit 2 — `F4` after the fix round (a security gate was REMOVED)

## Тест или взгляд (§24.4) — классификация каждого in-scope пункта ДО любого прогона

Read the authority first, then follow this classification; do not start with tests or full CI.

| Пункт | Метод | Почему |
| --- | --- | --- |
| 1. Кто ещё зовёт четыре маршрута доставки | **взгляд** (разовое) | это факт о текущем состоянии репозитория и о доступности порта снаружи — `rg`/AST/introspection и разовая проверка достижимости, постоянный тест отсутствия строки не заводить |
| 2. Что стоит перед доставкой после снятия гейта (HMAC, валидация, идемпотентность, готовность провайдера) | **взгляд** + разовый runtime-check на живых маршрутах | проверяется фактическое итоговое состояние, а не поведение, которое надо закрепить |
| 3. Есть ли путь к четырём адаптерам мимо гейта вебаппа | **поведение** | это и есть класс отказа, ради которого пункт существует: сначала слепой kill-set по authority, потом поломки и целевой набор |
| 4. Отсутствующая/неизвестная поверхность закрывает способ без отката к старому ключу | **поведение** | правило должно остаться закреплённым тестом, а не наблюдением |
| 5. Живой сценарий `B-1` на трёх Host в обе стороны | **взгляд** (живой замер) | однократное доказательство на живой среде; закрепляет его пункт 4 |
| 6. Бьют ли новые тесты отгруженный путь | **поведение** | проверяется вырезанием разделения в рабочей копии |
| 7. Умолчания: одно объявление или два | **взгляд** | сверка двух объявлений, разовое действие |

Blind kill-set по пунктам 3, 4 и 6 составить ДО чтения авторских тестов и зафиксировать в отчёте.
Затем проверить свежесть уже имеющегося evidence на том же SHA и добрать только недостающее.
Итог — по одной строке на пункт: `ID → PASS|FAIL|BLOCKED → evidence`.


Rules: `AGENTS.md` is the single canon — `grep -n "^## \|^### " AGENTS.md`, find your topic, read that section
before acting (§24 covers delegated repo-work).

Источник оракула: `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` §1.2j — «разделить настройки входа для клиник и пациентов В НАСТРОЙКАХ ГЛОБАЛ АДМИНА — и всё».

Clone `/home/dev/dev-projects/bcb-wt-night-f4-20260823`, branch `wt/night-f4-20260823`, head `42fbd07d1`.
Round 1 of this audit is yours to build on, not to repeat: `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_NIGHT_F4_2026-08-23.md`.
It already proved, with its own live measurements, that login availability did not change on any surface, that
the 27 rows equal legacy in both tables, that the migration is deterministic, and that surface isolation works in
the webapp. **Do not re-litigate those.** Blocker `B-1` was the finding; this round is about the fix for it.

## What the fix did — and why it needs a hard look

The author chose to **DELETE the integrator's own channel gate** rather than teach it the new keys. Removing a
gate is the kind of change that is right when the gate was a duplicate decision, and dangerous when it was not.
Your job is to decide which it was, from your own measurements. Take nothing from the author's report.

Verify, each with a command and its output in your report:

1. **Is the webapp really the only client?** The author names four call sites, all in the webapp, and claims no
   bot, cron, or external caller reaches `send-otp`, `send-email`, `send-sms`, `request-contact`. Sweep the whole
   repository yourself, including the bot, cron jobs, deploy scripts, and anything constructing those URLs from
   a variable or a path fragment rather than a literal. Also check whether the integrator is reachable from
   outside the host at all — if it is, an unauthenticated or HMAC-only caller now reaches delivery with no
   channel check. Say plainly whether removing the gate widened what an outside caller can do.
2. **What still stands in front of delivery?** The author says HMAC, validation, idempotency and provider
   readiness survived. Confirm each on the live routes, not in the diff.
3. **Does the webapp gate actually run before every one of the four calls?** A gate that moved from callee to
   caller is only equivalent if every path through the caller passes it. Find any path that reaches those four
   adapters without going through `authChannelPolicy.ts` — retries, queues, background jobs, error fallbacks.
   This is the failure mode that would make the removal wrong.
4. **No legacy fallback anywhere.** Prove that a missing, empty, or unknown surface closes the method rather than
   falling back to an old key or to "allowed". Drive it live, not by reading.
5. **The live scenario from `B-1`.** Enable a method for patients only, and show — with real requests — that
   delivery is permitted for the patient surface and refused for the other two, and the mirror case. Use a method
   whose delivery actually goes through the integrator.
6. **The `N-3` gap you found last round.** The author added tests; check they drive the shipped path (resolved
   header), not a parameterised one. Then do what you did last round: delete the surface split in a working copy
   and confirm the suite goes red. If it stays green, the tests are still decoration.
7. **`N-5` defaults.** One declared default set now, or still two? Would a freshly built environment get the same
   login methods as the running one?

## Your own injections

Plant your own faults, at least one per class you consider dangerous here, and report planted / killed / missed.
The classes that matter this round: a delivery path that skips the caller-side gate; a surface value that falls
through to "allowed"; an integrator route reachable without the webapp; defaults drifting apart again.

## Out of scope

`B-2` (no separate patient host in the deployment), `N-4`, `N-6`, `N-7` — the owner's forks, not work. Do not fix
the neighbour's `pre-session exact gate` defect and do not work around it. Do not touch `feat/doctor-ui-rebuild`.
Do not run full CI — that is the lead's job.

## Report

`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT2_NIGHT_F4_2026-08-23.md`, verdict `PASS, FOR LAND` or
`FAIL, NOT FOR LAND`, blocking / non-blocking counts, injections planted / killed / missed, and an explicit
sentence on whether deleting the integrator gate made anything reachable that was not reachable before.
Restore any product code you broke; leave `git diff` clean apart from your report and your own tests.
