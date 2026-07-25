# UI walkthrough — 2026-07-25 (first one ever done with eyes on the screens)

Owner: «Там надо дохуя разбираться ещё с интерфейсом, блядь, вообще дохуя.» He is right, and until today
nobody had looked: every previous claim about these screens in this session was made from code and DB alone,
and two of them were wrong. This file only records what was SEEN in a browser on the dev sandbox
(`bcb_webapp_dev`, a copy of TEST, same `locked` principal mode), logged in as the copied owner-doctor identity.
Screenshots are in the session scratchpad; the ones sent to the owner are in `runs/screenshots/`.

**Method note that matters:** a "defect" I nearly reported — the tariff page appearing to sign the user out —
turned out to be a concurrent worker mutating `staff_security_profiles` in the same sandbox. Re-tested on a
clean session: HTTP 200, session intact. Anything below has been re-checked on a clean session.

## Works, verified on screen

| Screen | State |
|---|---|
| Сегодня (`/app/doctor`) | Healthy. Tasks with overdue flags, counters (сообщения 1, комментарии 17), «На сопровождении» with 6 clients, day timeline. |
| Клиенты (`/app/doctor/patients`) | Healthy. 234 clients, all KPI tiles populated (с записями 97, с программой 30, без приёмов 137, с визитами 96, приём в этом мес. 16). |
| Расписание, Коммуникации, Контент, Курсы | Render, HTTP 200, no console errors. |
| Файлы и медиа (`/app/doctor/content/library`) | Healthy — folder tree, upload zone, 24 of 175 files listed, **and thumbnails DO render here**. |
| Каталог ЛФК (`/app/doctor/exercises`) | Lists all 135 exercises again after today's fix. Thumbnails do NOT render here — see below. |
| Настройки → Команда (`?tab=team`) | Fully working: member list, «Занято мест: 2 из 1000», invite form with role picker, pending invites. |

## Defects found

**1. Настройки has no section navigation — working pages are unreachable.**
`/app/settings` renders only three blocks: how to address a client, two «Сегодня» toggles, appointment
reminders. There is no tab bar. `?tab=team` and `?tab=billing` are real, routed pages
(`apps/webapp/src/app/app/settings/page.tsx`) that can only be reached by typing the URL. This is why the
clinic settings look amputated — most of them are simply not linked. The owner asked about this hours ago
(«нахуя ты вырезал все настройки у клиники? а интеграция календаря?») and it was never checked.

**2. «Тариф и биллинг» is a hardcoded stub.** `page.tsx:143-155` always renders the sentence «Коммерческие
настройки станут доступны после подключения тарифа» and never reads the organisation's tariff. The owner's
clinic has a full tariff assigned and `commercial_access_state = 'active'`, and the page still tells him to
connect a tariff. Not a data bug — the screen was never written. This is the whole of his complaint that
there is no tariff information anywhere.

**3. No password change anywhere.** The API has forgot / reset / setup-access / setup-code-complete, but there
is no "change password" surface in the cabinet — grep for a change-password UI finds only the patient auth
flow. Today the only way to change a password is the "forgot" e-mail round trip.

**4. Exercise catalogue tiles show empty grey boxes** while the same media renders in the file library. Proven
NOT to be data loss: the preview endpoint returns 200 `image/jpeg` (5058 bytes) for a catalogue media id, all
139 exercise media are videos whose posters exist (`preview_status='ready'`, 179/179 have `preview_sm_key`),
the S3 object itself answers 206, and the page payload carries `previewStatus":"ready"` plus a real
`previewSmUrl` for all 135. The server HTML for the catalogue contains zero `<img>` tags, so the tile path
loses the preview fields somewhere between the repo query and `MediaThumb`. Under investigation.

**5. Two filter dropdowns never resolve** on the catalogue — «Регион» and «Тип нагрузки» sit at «Загрузка…»
forever, in both the filter bar and the create-exercise form. Under investigation.

## Not written at all (not hidden — absent)

Clinic display name, clinic logo, calendar integration, the clinic's public page. These are the branding work
the owner scoped earlier today (`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/BRANDING_DOMAIN_CONTRACT.md`): logo in
the cabinet and on the public page, clinic name only in outbound mail, actions named «Установить» / «Очистить»,
and the cleared image stays in the clinic's file library.

## Owner-reported, reproduced or explained elsewhere

- **Abandoned 2FA enrolment bricks the workspace.** Starting and not finishing the authenticator setup leaves a
  row in `staff_security_profiles` with no factor; the session then counts as restricted and every workspace
  page 307s to `/app/account`. Deleting that row restored full access instantly. Very likely the owner's
  «нажал настройки — из меня выкинуло из приложения». Being fixed.
- **New clinic's dead workspace** and **the global admin's failing pages** — fixed in commit `feb80b75d`.
- **Empty exercise catalogue** — fixed in commit `bd1088f34`; the cause was a dead per-connection GUC, not the
  tariff and not the entitlement gate, contrary to my own first two explanations.

## What this list is not

Five screens out of dozens, one role, one clinic, desktop width only. No patient-side surface was opened, no
global-admin surface was re-checked after today's fix, no mobile width, no empty-state or error-state passes.
The real backlog is larger than this file.
