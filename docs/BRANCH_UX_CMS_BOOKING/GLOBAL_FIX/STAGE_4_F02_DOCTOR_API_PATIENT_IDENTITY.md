# Stage 4: F-02 - Patient identity в doctor API

Цель этапа: вернуть `patientName/patientPhone` в doctor online-intake API строго по контракту.

## S4.T01 - Зафиксировать контракт doctor responses

**Цель:** сделать shape ответа обязательным и тестируемым.

**Файлы:**

- `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/API_CONTRACT_ONLINE_INTAKE_V1.md`
- `apps/webapp/src/modules/online-intake/types.ts`

**Шаги:**

1. Явно описать обязательные поля `patientName`, `patientPhone`.
2. Уточнить поведение при частично отсутствующих profile-данных.
3. Закрепить одинаковый shape для list и details.

**Тесты:** не требуются (контракт).

**Критерии готовности:**

- контракт однозначен, без "optional по факту".

---

## S4.T02 - Join с `platform_users` в doctor list

**Цель:** list endpoint получает identity из user-профиля, не из заглушек.

**Файлы:**

- `apps/webapp/src/infra/repos/pgOnlineIntake.ts`
- `apps/webapp/src/app/api/doctor/online-intake/route.ts`

**Шаги:**

1. Расширить SQL query join-ом к источнику identity.
2. Вернуть поля в API DTO.
3. Добавить сортировку/фильтры без потери identity.

**Тесты:**

- [ ] doctor list includes patientName/patientPhone.
- [ ] no identity leak outside doctor/admin auth scope.

**Критерии готовности:**

- list API стабильно возвращает контрактные identity поля.

---

## S4.T03 - Join в doctor details endpoint

**Цель:** details endpoint возвращает ту же identity-модель.

**Файлы:**

- `apps/webapp/src/infra/repos/pgOnlineIntake.ts`
- `apps/webapp/src/app/api/doctor/online-intake/[id]/route.ts`

**Шаги:**

1. Добавить/синхронизировать join для details query.
2. Унифицировать mapper list/details.
3. Добавить explicit not-found и unauthorized paths.

**Тесты:**

- [ ] doctor details includes patient identity.
- [ ] wrong role -> forbidden.

**Критерии готовности:**

- details API соответствует контракту 1:1.

---

## S4.T04 - UI врача без fallback-заглушек

**Цель:** убрать "неизвестно/—" как normal path при валидных данных.

**Файлы:**

- `apps/webapp/src/app/app/doctor/online-intake/DoctorOnlineIntakeClient.tsx`
- `apps/webapp/src/app/app/doctor/online-intake/*`

**Шаги:**

1. Обновить рендер list/details под контрактный shape.
2. Оставить fallback только для truly missing edge-cases.
3. Добавить UI smoke test на корректный рендер имени/телефона.

**Тесты:**

- [ ] doctor UI renders patientName/patientPhone from API.

**Критерии готовности:**

- основной UI-path не использует заглушки.

---

## S4.T05 - Финальные проверки и фиксация gate

**Шаги:**

1. Прогнать тесты doctor API/UI.
2. Прогнать `pnpm run ci`.
3. Зафиксировать evidence в `AGENT_EXECUTION_LOG.md`.

---

## Audit Gate Stage 4 (обязательный)

`PASS` только если:

1. list/details API возвращают `patientName/patientPhone` по контракту;
2. UI врача рендерит данные корректно;
3. fallback-заглушки не являются основным поведением;
4. Composer 2 подтвердил `verdict: pass`.
