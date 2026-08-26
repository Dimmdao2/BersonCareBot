# Сводный доменный аудит доступа — 2026-08-26

Кандидат: `df4a210ba` (`feat/doctor-ui-rebuild`). Четыре независимых прохода проверяли один и тот же SHA.

## Подтверждённые корни

### Identity / login

- На переходном одном домене patient-only messenger-bind routes получают staff surface и закрывают Telegram/MAX login.
- Старый `user.phone.link` всё ещё оставляет integrator способным записывать подтверждённый телефон и решать merge после того, как webapp уже владеет token-bound complete.
- Вместе со старым writer остаётся отдельный integrator auth-channel gate на осиротевших global keys.

### Communications / reminders / delivery

- Public topic-unsubscribe проглатывает отказ DB-context и возвращает ложный успех.
- Specialist-task reminder выносит ФИО пациента и текст задачи во внешние каналы и не даёт требуемую ссылку.
- Email eligibility не учитывает SMTP-профиль клиники.
- Specialist-task materializer читает global channel setting вместо effective organization setting, которое показывает UI.
- Signed relay пишет `success` и `skipped` в failure-only `notification_delivery_attempts`.

### Platform support / public booking

- Platform support actions блокировки и отзыва контактов/привязок не имеют named DB-door и падают с `42501`.
- Public-booking merge candidates пишутся raw pool без принятого context; ошибка проглатывается, candidate теряется.

### Runtime state

- В DEV не применена уже существующая candidate migration новой четырёхаргументной reminder target root; TEST эту сигнатуру уже имеет. Это не новый code-fix, а обязательное применение миграций перед live verification.

## Отклонённые findings

- MAX self-contact: официальный контракт MAX говорит, что проверяемый `hash` приходит только от `request_contact`; чужой контакт из адресной книги приходит без него. Достижимого обхода нет.
- Глобальный `blocked`: `docs/OWNER_DECISIONS.md` прямо определяет blocked как глобальную блокировку identity; clinic-scoped состоянием является archive.
- Удаление медицинского визита: отсутствие новой продуктовой функции без owner-requirement не audit finding.
- Архивированный пациент в переписке: отдельный product question, не поломка Track D.

## Исполнение

Три цельных fix-пакета: identity cleanup; notifications/delivery coherence; support/public-booking DB doors. После них — targeted checks, candidate migration preflight, единый audit acceptance, затем один финальный CI и TEST deploy.
