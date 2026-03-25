# PACK G — Final Stubs & E2E

> Сложность: простой  
> Агент: Auto (пул)  
> Зависимости: все предыдущие пакеты  
> Миграции: нет

---

## Обязательные правила

- После каждого шага: `pnpm run ci`.
- Отчёт: `docs/FULL_DEV_PLAN/finsl_fix_report.md`.

---

## Шаг G.1 — STUB-03: OAuth callback (Yandex/Google/Apple)

**Файлы:**
- `apps/webapp/src/app/api/auth/oauth/callback/route.ts` (переписать)
- `apps/webapp/src/modules/auth/oauthService.ts` (новый или расширить существующий)
- `apps/webapp/src/infra/repos/pgOAuthBindings.ts` (проверить/расширить)

**Действия:**
1. Реализовать CSRF-защиту через `state`:
   - При `GET /api/auth/oauth/start?provider=yandex` → генерировать `state`, сохранить в httpOnly cookie.
   - В `callback` → сверить `state` из query с cookie. При несовпадении → 403.
2. Обмен `code` на token:
   - Yandex: `POST https://oauth.yandex.ru/token`.
   - Google: `POST https://oauth2.googleapis.com/token`.
   - Apple: по спецификации Apple Sign In.
3. Получить профиль пользователя (email, name).
4. Привязать OAuth к `user_oauth_bindings`.
5. Создать/обновить сессию.
6. Redirect на `/app/patient` (или `/app/doctor` по роли).

**Тесты:**
- Unit: state mismatch → 403.
- Unit: valid flow с мок fetch к provider → session created.
- Integration: route test с моками OAuth providers.

**DoD:** OAuth flow работает с CSRF-защитой. CI зелёный.

---

## Шаг G.2 — Stage 10 E2E: upload → saveContentPage

**Файлы:**
- `apps/webapp/e2e/cms-content.test.ts` (новый)

**Действия:**
1. Реализовать e2e in-process тест:
   - Мок сессии врача.
   - `POST /api/media/upload` с валидным JPEG → получить `mediaId`.
   - Вызвать server action `saveContentPage` с контентом, включающим ссылку на uploaded media.
   - Проверить: страница сохранена, медиа доступно.
2. Тест должен использовать test fixtures (fake JPEG с корректным magic-bytes header).

**Тесты:** Сам этот шаг — e2e тест.

**DoD:** E2E сценарий CMS upload → publish работает. CI зелёный.

---

## Финальный критерий Pack G

- [ ] OAuth callback с CSRF state protection.
- [ ] CMS e2e: upload → save → verify.
- [ ] `pnpm run ci` зелёный.
- [ ] Все STUB из `FINAL_FIX_RECOMMENDATIONS` закрыты или задокументированы как "deferred".
