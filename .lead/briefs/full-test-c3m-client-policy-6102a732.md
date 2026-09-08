# Тест или взгляд

Это живая механическая приёмка поведения на уже задеплоенном TEST после завершения параллельного прохода workspace
settings. UI/state проверяются реальными Save/reload и двумя независимыми browser profiles;
direct deny — через Network. Исходники и тесты не меняются, product defects не исправляются.

# Live acceptance: C3M client policy, portal and symptom tracking

Прочитай карту `AGENTS.md`, затем полностью §1a, §1b, §10a, §16–§18, §21–§22 и §24,
`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md` и
`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` C3M.6–C3M.8. Используй только TEST
`https://test.bersoncare.ru`; подтверди checkout SHA `c0690ddaac7d2abcf2f531ac0e585a405589f515` командой
`git -C /opt/projects/bersoncarebot-test rev-parse HEAD`. Не запускай и не перезапускай сервер. PROD не трогать.

Штатно войди отдельными чистыми profiles под существующими doctor и patient owner-учётками из `AGENTS.md` §1a.
Не создавай fixture-аккаунтов/клиник. Выбери существующую doctor↔patient relationship. До mutations зафиксируй:
`onSupport`, channel defaults, per-client overrides, portal state, выбранный symptom tracking и его историю.
В конце восстанови всё через UI и подтверди reload. Временный symptom не создавай, если нет штатного удаления;
предпочти существующий tracking.

## Точные owner-пункты

- `C3M-02/C3M-11`: единственная membership-группа — существующий `onSupport`; звезда и подпись являются её
  представлением, отдельного favorite нет.
- `C3M-09/C3M.6`: для chat/comments/media действует `explicit allow|deny клиента → default off|all|on_support`;
  `inherit` следует default, explicit exception переживает смену `onSupport` и умеет вернуться к default.
- `C3M-10`: portal — отдельный per-client `inherit|allow|deny`, не support default; portal OFF закрывает private
  organization content, но не identity/enrollment и не public booking.
- `C3M-10/C3M.6`: symptom `patient_tracking_enabled` задаётся на конкретном tracking; врач продолжает видеть его и
  историю, пациент не видит и не может записывать выключенный. Default влияет только на новые tracking;
  `on_support` — snapshot при создании, не live inheritance.
- C3M.8: membership не меняет booking/cancellation/prepayment/schedule.

## Механический маршрут

1. Doctor: карточка пациента → существующая единая звезда/группа и panel доступа. Patient: baseline cabinet,
   messages/comments/media/symptom diary и public booking. Desktop screenshots обеих ролей.
2. Для каждого chat/comments/media проверь минимум: default `off` + inherit; default `all` + inherit; default
   `on_support` при star off/on; explicit allow поверх off; explicit deny поверх all/on_support; reset обратно в
   inherit. После каждого изменения Save+reload обеих ролей и Network observation. Не отправляй реальные сообщения
   во внешние каналы; допустимо отправить локальное in-app сообщение/комментарий только если его можно удалить или
   он очевидно помечен acceptance и затем очищен.
3. Переключи `onSupport` и подтверди: только inherited policy меняется, explicit overrides остаются; звезда,
   фильтр и подпись отражают одно свойство. Booking/public booking не меняется.
4. Portal: проверь inherit/deny/allow с reload. При deny doctor продолжает видеть и редактировать карточку; patient
   получает neutral unavailable только на private org surfaces; public booking остаётся доступным. Верни baseline.
5. На существующем symptom выключи «разрешить отслеживание пациентом»: doctor видит tracking+history, patient list
   его не показывает, прямой patient write получает server deny. Включи обратно и подтверди возврат той же истории.
   Если безопасно доступна create/delete пара, отдельно проверь defaults off/all/on_support и snapshot; иначе этот
   подпункт честно UNPROVED без постоянной фикстуры.
6. Если выбранную relationship безопасно архивировать и UI имеет штатное восстановление, выполни archive→patient
   cabinet/public booking→doctor archive list→restore и подтверди: архив скрывает карточку из рабочего списка, но
   не отключает кабинет/запись. Не выполняй contact block, если нет гарантированного штатного unblock.
7. Mobile 390×844: звезда, panel overrides, symptom checkbox и patient unavailable state.

Artifacts: `/home/dev/dev-projects/.lead/runs/test-full-acceptance-c0690ddaa/c3m-client-policy/`.
Отчёт обязан назвать каждый изменённый TEST state и cleanup proof,
network/console errors и screenshots. Сначала собрать все findings, не чинить. Не запускать тесты/CI/migration/
deploy/server, не менять product code, не коммить.
