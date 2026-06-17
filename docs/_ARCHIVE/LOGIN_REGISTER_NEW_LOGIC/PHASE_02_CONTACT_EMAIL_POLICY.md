# Фаза 2 — Contact email (Rubitime / врач)

**Статус:** `completed`  
**Канон:** [MAIN PLAN.md](MAIN%20PLAN.md) §2  
**Зависит от:** [PHASE_00](PHASE_00_AUDIT_AND_AGREEMENT.md)  
**Следующий:** [PHASE_03](PHASE_03_EMAIL_SETUP_TOKENS.md)

## Цель

Email из Rubitime или от врача — **contact / unverified**, без auto `user_password_credentials`; при появлении/смене — выпуск setup link (реализация отправки — фаза 3).

## Scope

### В scope

- Политика: `email_verified_at = null` пока пациент сам не подтвердил (врач меняет email → сброс verified)
- Хуки после `patchAdminClientProfile` (email), Rubitime autobind — **enqueue** setup token + mail (когда фаза 3 готова) или stub port
- Документировать: forgot **не** шлёт reset на неподтверждённый врачебный email (до фазы 5 — поведение как сейчас + комментарий)

### Вне scope

- Страница `/app/auth/email-setup` (фаза 4)
- Полная матрица register states (фаза 5)

## Definition of Done

- [x] Смена email врачом → `email_verified_at` null при новом адресе (уже в `patchAdminClientProfile` — проверить и зафиксировать в LOG)
- [x] Rubitime email сохраняется как unverified contact
- [x] Нет автосоздания `user_password_credentials` при admin/Rubitime email
- [x] Вызов сервиса выпуска setup token из doctor patch + Rubitime autobind (после фазы 3 — end-to-end; до — интерфейс + TODO в LOG)
- [x] Unit/integration: doctor email change does not verify; does not create password row
- [x] [`LOG.md`](LOG.md)

## Локальные проверки

- [x] `rg email_verified_at` в `pgUserProjection.patchAdminClientProfile`
- [x] `pnpm --filter @bersoncare/webapp test` — admin profile / projection tests

## Якоря

- `pgUserProjection.patchAdminClientProfile`
- `applyRubitimeEmailAutobind`
- `AdminClientProfileEditPanel.tsx`
