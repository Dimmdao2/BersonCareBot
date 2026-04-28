# AUDIT_PHASE_7

## 1. Verdict: PASS

Phase 7 соответствует ТЗ инициативы ([README § Phase 7](README.md)) и ограничениям EXEC по проверенным пунктам ниже.

### 1.1. Карусель строится из `patient_home_block_items` блока `subscription_carousel`

Реализация:

- [`PatientHomeToday.tsx`](../../apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx): для блока с `code === "subscription_carousel"` берётся `subscriptionBlock.items` из результата `deps.patientHomeBlocks.listBlocksWithItems()`, затем [`resolveSubscriptionCarouselCards`](../../apps/webapp/src/modules/patient-home/patientHomeResolvers.ts)(`subscriptionBlock.items`, …).
- Items хранятся в таблице `patient_home_block_items` (см. порт [`PatientHomeBlocksPort`](../../apps/webapp/src/modules/patient-home/ports.ts)); состав карусели не задаётся slug-ами из `CONTENT_PLAN.md`.

Проверено: карточки UI получают уже разрешённые DTO (`ResolvedCarouselCard[]`), источник списка — items блока `subscription_carousel`.

### 1.2. Нет gating по «подписке»

Проверено:

- Карусель и страница раздела **не** добавляют проверок вида «есть подписка → иначе 403».
- [`PatientSectionSubscriptionCallout`](../../apps/webapp/src/app/app/patient/sections/PatientSectionSubscriptionCallout.tsx) — только информационный текст (`role="status"`), без блокировки контента.
- [`sections/[slug]/page.tsx`](../../apps/webapp/src/app/app/patient/sections/[slug]/page.tsx): доступ по-прежнему определяется видимостью раздела и `requiresAuth` / `resolvePatientCanViewAuthOnlyContent` (как до Phase 7); промо подписки не меняет эту матрицу.

### 1.3. Нет платежей

Проверено статически по файлам Phase 7 (`PatientHomeSubscriptionCarousel*`, `patientHomeResolvers.ts`, `PatientSectionSubscriptionCallout.tsx`, `page.tsx`, `page.subscription.test.tsx`): нет интеграций оплаты, платёжных виджетов и сценариев checkout.

### 1.4. Бейджи generic, без slug hardcode из `CONTENT_PLAN.md`

Реализация:

- Дефолтный текст бейджа — константа [`DEFAULT_SUBSCRIPTION_BADGE`](../../apps/webapp/src/modules/patient-home/patientHomeResolvers.ts) (`"По подписке"`).
- Кастомный текст — из поля `badgeLabel` item в БД (`trim` или дефолт).
- [`getSubscriptionCarouselSectionPresentation`](../../apps/webapp/src/modules/patient-home/patientHomeResolvers.ts): сопоставление `sectionSlug` с `target_ref` для `target_type === "content_section"`, без `switch (slug)` по редакционным slug-ам.

Проверено `rg` по `apps/webapp/src/modules/patient-home` и `PatientHomeSubscriptionCarousel.tsx`: совпадений с известными slug-ами из [`CONTENT_PLAN.md`](CONTENT_PLAN.md) в runtime-коде Phase 7 нет (в тестах используются только `fixture-*` / `s1` как generic-фикстуры).

### 1.5. Страница раздела реагирует на item в `subscription_carousel`

Реализация:

- [`sections/[slug]/page.tsx`](../../apps/webapp/src/app/app/patient/sections/[slug]/page.tsx): параллельно с материалами вызывается `deps.patientHomeBlocks.listBlocksWithItems()`, затем `getSubscriptionCarouselSectionPresentation(homeBlocks, slug)`; при непустом результате рендерится `PatientSectionSubscriptionCallout`.

Условие показа: видимый блок `subscription_carousel`, видимый item типа `content_section`, совпадение `target_ref.trim()` с текущим slug раздела.

### 1.6. Карусель: scroll / snap / peek

[`PatientHomeSubscriptionCarousel.tsx`](../../apps/webapp/src/app/app/patient/home/PatientHomeSubscriptionCarousel.tsx): контейнер с `snap-x snap-mandatory`, карточки с фиксированной полосой ширины (`min-w-[280px] max-w-[320px]`) и `snap-start`, отступы скролла для peek — соответствует README §7.1.

---

## 2. Mandatory fixes

None.

---

## 3. Minor notes

1. В [`page.tsx`](../../apps/webapp/src/app/app/patient/sections/[slug]/page.tsx) остаётся legacy-ветка `slug === "warmups"` для напоминаний — это не часть Phase 7 и не относится к подписочной карусели.
2. Заголовок секции карусели «Материалы по подписке» в UI пока захардкожен в компоненте; опциональное чтение `patient_home_blocks.title` для блока `subscription_carousel` остаётся улучшением на будущее (не блокер Phase 7).

---

## 4. Tests reviewed/run

Reviewed:

- [`apps/webapp/src/modules/patient-home/patientHomeResolvers.test.ts`](../../apps/webapp/src/modules/patient-home/patientHomeResolvers.test.ts) — в т.ч. `getSubscriptionCarouselSectionPresentation`, `resolveSubscriptionCarouselCards` / default badge.
- [`apps/webapp/src/app/app/patient/home/PatientHomeSubscriptionCarousel.test.tsx`](../../apps/webapp/src/app/app/patient/home/PatientHomeSubscriptionCarousel.test.tsx)
- [`apps/webapp/src/app/app/patient/sections/[slug]/page.subscription.test.tsx`](../../apps/webapp/src/app/app/patient/sections/[slug]/page.subscription.test.tsx)

Executed during audit:

```bash
pnpm --dir apps/webapp exec vitest run src/modules/patient-home/patientHomeResolvers.test.ts src/app/app/patient/home/PatientHomeSubscriptionCarousel.test.tsx "src/app/app/patient/sections/[slug]/page.subscription.test.tsx"
```

Result:

- `Test Files 3 passed (3)`
- `Tests 12 passed (12)`

---

## 5. Confirmation checklist

- Карусель из `patient_home_block_items` / блок `subscription_carousel`: PASS.
- Нет gating по подписке: PASS.
- Нет платежей: PASS.
- Бейджи generic, без slug hardcode из CONTENT_PLAN: PASS.
- Страница раздела реагирует на item в `subscription_carousel`: PASS.
- Тесты Phase 7 есть и проходят: PASS.

---

**Вывод:** Phase 7 проходит аудит. Обязательных исправлений нет.
