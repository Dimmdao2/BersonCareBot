# Тест или взгляд

Это живая приёмка публичных/staff/patient поверхностей, custom-domain UI и внешнего видеоплеера после TEST deploy.
Presentation/responsive — взгляд и screenshots; auth/routing/save/recheck/player behavior — реальные actions,
Network/console и reload. Новые тесты, product-code и исправления запрещены.

# TEST acceptance: branding, auth surfaces, custom domain and external video

Прочитай карту `AGENTS.md`, затем полностью §1a, §1b, §10a, §15–§22 и §24,
`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`,
`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` пункты `TPB-14`, `B8`, `C5a`,
`F1–F5`, `TPB-20–23`, и `docs/_TODO/EXTERNAL_VIDEO_PLAYER_APIS_2026-09-07.md` §§«Решение владельца»,
«Общая граница», «UI и доступность», «MVP». Проверяй TEST SHA
`c0690ddaac7d2abcf2f531ac0e585a405589f515`; PROD, DNS и реальные внешние настройки не менять.

Используй независимые clean browser profiles для doctor, platform-admin, patient и public. Штатные owner accounts
из `AGENTS.md` §1a; пароль не писать. Не создавай accounts/clinics. Не переключай глобальные auth policies и не
заявляй чужой реальный домен. Existing domain binding можно только read/recheck; recheck — штатное безопасное
действие, DNS mutation не делает.

## Точные owner-пункты

- `TPB-14/B8/C5a`: owner вводит только base domain + placement; server вычисляет exact hostname и одну A/CNAME
  инструкцию; pending/failed не активирует host и не портит technical address; active появляется только после
  DNS+TLS+routing proof.
- `F1–F5/TPB-20–23`: staff, platform-admin и patient имеют разные login surfaces/purpose; staff first step —
  email+password, без email-code при org 2FA off; personal TOTP/owner-required staff 2FA сохраняются; OAuth/passkey
  visibility и direct authorization следуют owner policy; role chooser не возвращается; wrong product surface не
  выдаёт session.
- External video owner decision: external YouTube/Vimeo/RUTUBE/VK запрещены в paid products; current player MVP
  re-detects provider from every URL, YouTube/RUTUBE expose accessible custom controls, VK/Vimeo retain supported
  native UI, bearer query values do not appear in logs/errors.

## Механический маршрут

1. Public/incognito desktop+narrow: открыть staff login, platform-admin login, patient login and specialist signup
   через штатные TEST routes. Зафиксировать различимый purpose, отсутствие role chooser/лишних methods и direct
   wrong-surface outcomes. Не менять policies. Войти doctor email+password: если org staff-2FA off, не должно быть
   обязательного email-code; если on — честно пройти доступный factor или UNPROVED без изменения global setting.
   Отдельно войти admin и patient обычным поддержанным способом.
2. Проверить cross-product links/redirects, logout и повторный вход в clean profiles; role не должен протекать на
   другую surface. Снять Network/console for 4xx/5xx and redirect chain.
3. Doctor owner → Settings → own domain: desktop/mobile layout, base-domain input, two placement choices,
   server-returned hostname/DNS/status. При существующем binding нажать recheck и reload; screenshot before/after.
   При отсутствии binding UI принимается только как empty state, lifecycle помечается UNPROVED — не вводить
   случайный домен и не трогать DNS/TLS.
4. Проверить technical clinic public card and public booking links, которые уже существуют в данных. Pending/failed
   custom binding не должен менять доступный technical path. Не требовать PROD-only therapygo DNS на TEST.
5. Найти существующий бесплатный material/exercise с external YouTube/RUTUBE/VK/Vimeo source. Проверить provider
   после перехода между двумя разными URLs только если обычный UI позволяет безопасно сохранить и вернуть
   исходный URL. Проверить play/pause/seek/volume/focus/keyboard/touch для YouTube/RUTUBE, native controls для
   VK/Vimeo, SDK failure fallback и отсутствие bearer URL в console/report. Не публиковать paid content и не
   делать внешнее видео платным. Если подходящих данных нет и штатное удаление временного бесплатного material не
   гарантировано — не создавать fixture, отметить конкретные providers UNPROVED.
6. Mobile 390×844: все login surfaces, domain card and reachable player controls without clipping.
7. Собрать все defects до какого-либо исправления; восстановить изменённый external URL/description if any и
   подтвердить reload.

Artifacts: `/home/dev/dev-projects/.lead/runs/test-full-acceptance-c0690ddaa/branding-auth-video/`.
Report: action/URL/role/outcome, redirect/network status, console errors, screenshot filenames, baseline/restoration,
PASS/FAIL/UNPROVED по каждому owner пункту. Не запускать CI, migration, deploy, dev server/fixer; не менять и не
коммитить product code.
