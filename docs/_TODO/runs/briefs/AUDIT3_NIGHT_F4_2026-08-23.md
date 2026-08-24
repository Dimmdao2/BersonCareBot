# Independent audit 3 — `F4` after the delivery-seam fix

## Тест или взгляд (§24.4) — классификация каждого in-scope пункта ДО любого прогона

Read the authority first; do not start with tests or full CI.

| Пункт | Метод | Почему |
| --- | --- | --- |
| 1. Все ли пути доставки проходят через шов | **взгляд** (разовое) — обход вызовов и графа, AST/`rg` | это факт о текущем состоянии кода; постоянный тест отсутствия строки не заводить |
| 2. Оба пути `B2-1` снова отказывают, интегратор получает `0` | **поведение** + живой замер | ровно тот класс отказа, ради которого круг существует: сначала слепой kill-set, потом поломки и целевой набор |
| 3. Fail-closed на неизвестной поверхности, отсутствующей и мусорной настройке | **поведение** | правило должно остаться закреплённым, а не наблюдённым |
| 4. Можно ли молча убрать проверку из шва | **поведение** | проверяется инъекцией; если конструкция делает обход невозможным — это сильнее теста, зафиксировать как конструкцию |
| 5. `user.phone.link` восстановлен побайтно | **взгляд** | сверка diff с `21b8826e1`, разовое действие |
| 6. Не сломались ли ранее зелёные пункты (изоляция поверхностей, отсутствие legacy-фолбэка, умолчания) | **взгляд** на свежесть evidence того же SHA + добрать недостающее | круги 1 и 2 их уже доказали; повторять целиком запрещено |

Blind kill-set по пунктам 2, 3 и 4 составить ДО чтения авторских тестов и зафиксировать в отчёте.
Итог — по одной строке на пункт: `ID → PASS|FAIL|BLOCKED → evidence`.

Rules: `AGENTS.md` is the single canon — `grep -n "^## \|^### " AGENTS.md`, find your topic, read that section
before acting (§24 covers delegated repo-work).

Источник оракула: `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` §1.2j — «разделить настройки входа для клиник и пациентов В НАСТРОЙКАХ ГЛОБАЛ АДМИНА — и всё».

Clone `/home/dev/dev-projects/bcb-wt-night-f4-20260823`, branch `wt/night-f4-20260823`, head `810911e22`.

## History you must not repeat

Two audits already ran on this item. Read both reports in
`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/`: `AUDIT_NIGHT_F4_2026-08-23.md` and
`AUDIT2_NIGHT_F4_2026-08-23.md`. Between them they already proved, live: login availability unchanged on every
surface; 27 rows equal legacy in both tables; the migration deterministic; surface isolation working in both
directions; HMAC, validation, idempotency and provider readiness intact; no legacy fallback; defaults reconciled.
**Do not re-measure any of that from scratch.** Check only that this round did not break it, and spend your effort
on what is new.

## What changed this round

Round 3 deleted the integrator's channel gate and thereby opened two delivery paths (audit 2, `B2-1`), and moved
the decision into ~35 call sites with nothing defending them (`B2-2`). Round 4 answers both by putting one
surface-aware check at the delivery seam — `apps/webapp/src/modules/auth/authDeliveryGate.ts` — through which
every code is claimed to pass on its way to the integrator, while deliberately KEEPING the existing route-level
checks rather than thinning them out. It also restored the `user.phone.link` gate in the integrator's `writePort`
byte-for-byte against `21b8826e1`.

Verify, each with a command and its output:

1. **Is the seam really unavoidable?** Find any path that reaches `/api/bersoncare/send-sms`, `send-otp`,
   `send-email` or `request-contact` without passing `authDeliveryGate`. Follow the call graph, not the imports:
   retries, queues, background jobs, error fallbacks, deferred/queued adapters, anything constructing the URL
   from a variable. This is the whole point of the round — if one path escapes, the round failed.
2. **Both `B2-1` paths refuse again**, live, at DEV settings with the method off: `POST /api/patient/diary/purge-otp/start`
   and anonymous `POST /api/booking/public/create`. The integrator must receive zero requests. Then the mirror:
   with the method enabled for one surface, delivery goes through on that surface only.
3. **Fail-closed at the seam**: unknown surface, missing settings row, garbage value. Does it refuse with a reason,
   or does it throw a `500`? A `500` is fail-closed for delivery but is a defect of the login screen — report which.
4. **Can the check be removed silently?** Delete the seam check in a working copy and run the suite. The author
   reports `2 failed / 1 passed` from his own unit test. Decide whether that is enough: would removing the check
   from the seam be caught by a test that a future author would actually run? Also check the audit-2 oracle
   `deliveryChannelCallerGate.route.test.ts` is green WITHOUT having been edited — diff it against audit 2's version.
5. **`user.phone.link`**: confirm the restoration is byte-for-byte against `21b8826e1`, including the failure
   reason, and say what keys it now reads. Do not judge whether that path is reachable — the lead decided to
   restore it regardless of reachability.
6. **Nothing previously green broke**: surface isolation, the absence of a legacy fallback, and the defaults —
   a cheap confirmation each, not a re-measurement.

## Your own injections

Plant your own faults and report planted / killed / missed. Classes that matter: a delivery path bypassing the
seam; the seam allowing on an unknown/missing surface; the restored integrator gate reading the wrong key;
route-level and seam-level checks disagreeing so one masks the other.

## Out of scope

`B-2` from audit 1 (no separate patient host), `N2-4` / `N-4` (`500` on a missing row, `BCB-MIGRATION-VERIFY` has
no executor), `N-6`, `N-7`. Do not fix or work around the neighbour's `pre-session exact gate` defect. Do not
touch `feat/doctor-ui-rebuild`. Do not run full CI.

## Report

`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT3_NIGHT_F4_2026-08-23.md`, verdict `PASS, FOR LAND` or
`FAIL, NOT FOR LAND`, blocking / non-blocking counts, injections planted / killed / missed, and one explicit
sentence answering: can any code reach the integrator without the seam deciding. Restore any product code you
broke; leave `git diff` clean apart from your report and your own tests.
