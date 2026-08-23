# Независимый аудит: сверка происхождения бренда в резолвере поверхности

**Дата:** 23.08.2026 · **Аудитор:** Claude Opus 5 / high
**Оракул:** `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`, пункт `B3`
**Кандидат:** `29c7808ce` (фикстура приведена к типу `B4`) и `afbbb348e` («резолвер сверяет организацию
адреса с организацией данных»)
**Дерево аудита:** `/home/dev/dev-projects/bcb-wt-merge-fix-b3b4-20260823`, ветка
`wt/merge-fix-b3b4-20260823`, `HEAD` = `927ed9eee`

## Вердикт: **PASS, FOR LAND**

**Блокирующих `0`. Неблокирующих `0`. Рекомендаций владельцу `2` (работой не становятся).
Инъекций посажено `3`, убито `3`, не поймано `0`. Плюс одно историческое воспроизведение исходного
дефекта.**

Главное, что требовалось доказать, доказано: **новый тест краснеет именно от снятия сверки происхождения
и ни от чего другого.** Исходный фокус «зелено по ложной причине» не повторён.

---

## 1. Исходный дефект воспроизведён своими руками

Тест `fails closed when a branded Host resolves organization A with organization B resources`
существовал уже на `29c7808ce^` — но резолвер там **не имел никакой сверки происхождения** (её добавил
только `afbbb348e`). Я вернул оба файла на то состояние и прогнал набор:

```
git checkout 29c7808ce^ -- apps/webapp/src/proxy.route.test.ts \
                           apps/webapp/src/shared/lib/surface/requestSurface.ts
npx vitest --run src/proxy.route.test.ts
→ Tests  3 failed | 62 passed (65)
```

В числе упавших трёх — только брендированные CSRF-случаи матрицы хостов. **Заявленный кросс-арендный тест
был ЗЕЛЁНЫМ при полностью отсутствующей сверке.** Механика ровно та, что описана в брифе: старая фикстура
несла форму `{organizationId, core, paid, resolution}` без `patientAppName` и `accentToken`, санитайзер
её отбрасывал, поверхность не становилась брендированной, и `404` приходил от санитайзера, а не от
заявленной проверки. Дефект был в тесте, не в коде — подтверждаю.

## 2. Инъекция `I-1` — снята ровно сверка происхождения

`requestSurface.ts:160-166` возвращён к однострочнику без сравнения провенанса, всё остальное не тронуто:

```diff
-  if (
-    tenant.status !== 'active' ||
-    !tenant.organizationId ||
-    tenant.effectivePatientBrandOrganizationId !== tenant.organizationId
-  ) {
-    return null;
-  }
+  if (tenant.status !== 'active' || !tenant.organizationId) return null;
```

```
→ Tests  1 failed | 64 passed (65)
   × fails closed when a branded Host resolves organization A with organization B resources
   AssertionError: expected 200 to be 404
```

Красный ровно один тест, и это заявленный. Значимо и само значение: `200`, а не другой отказ, — значит
без сверки брендированная поверхность **выдаётся**, и маршрутный гейт `canSurfaceEnterRoute` её не
перехватывает (`patient_branded` допущен на `/app/patient/*`). То есть `404` в этом тесте не может прийти
ни от маршрутного гейта, ни от чего-либо ещё в цепочке `proxy`.

**Убито.** Вернул — снова `65 passed`.

## 3. Инъекция `I-2` — контрольная: отказ приходит НЕ от санитайзера

Сверка оставлена на месте, санитайзер обесточен в пропускающий:

```diff
 function sanitizeEffectivePatientBrand(value: unknown): EffectivePatientBrand | null {
+  if (value && typeof value === 'object') return value as EffectivePatientBrand; // INJECTION 2
   if (!value || typeof value !== 'object') return null;
```

```
→ Tests  3 failed | 62 passed (65)
   × passes the B1/B4 tenant seam result without resolving organization data itself
   × returns hard 404 when an active tenant seam supplies an invalid accent token …
   × returns hard 404 when an active tenant seam supplies a missing patient app name …
```

Инъекция заведомо приземлилась (три санитайзерных теста красные), **а кросс-арендный тест остался
зелёным.** Это прямое доказательство: его `404` не зависит от санитайзера вовсе.

Это же закрывает требование брифа «подай ВАЛИДНЫЙ по формату бренд чужой организации». Фикстура
`activeTenantSurface(OTHER_ORGANIZATION_ID)` после `29c7808ce` отдаёт `Clinic B Plus` /
`Clinic B Care` / `#166534` — всё три поля формат-валидны, санитайзер их пропускает. Тест подаёт именно
такой бренд с провенансом организации `B` под адресом организации `A` — и получает отказ.

**Убито.**

## 4. Инъекция `I-3` — сверка инвертирована: положительный путь под тестом

```diff
-    tenant.effectivePatientBrandOrganizationId !== tenant.organizationId
+    tenant.effectivePatientBrandOrganizationId === tenant.organizationId // inverted
```

```
→ Tests  5 failed | 60 passed (65)
   × rejects 'a foreign Origin' on the patient branded surface
   × rejects 'a foreign Referer' on the patient branded surface
   × rejects 'no Origin or Referer' on the patient branded surface
   × fails closed when a branded Host resolves organization A with organization B resources
   × passes the B1/B4 tenant seam result without resolving organization data itself
```

Своя организация под тестом с обеих сторон: инверсия ломает и выдачу брендированной поверхности
(`passes the B1/B4 tenant seam result…` проверяет полный заголовок: `surface: 'patient_branded'`,
`organizationId`, санитизированный бренд, `publicOrigin`), и её CSRF-периметр. Значит валидный бренд
своей организации действительно выдаётся, и сверка стоит на живом пути, а не в мёртвой ветке.

**Убито.**

## 5. Обычный путь не сломан

Во всех трёх инъекциях небрендированные случаи оставались зелёными — ни один `staff`,
`patient_default`, `platform_admin`, `unknown Host`, `duplicate`/`inactive` tenant не шелохнулся.
Сверка стоит после разбора платформенных хостов и касается только tenant-ветки.

На восстановленном дереве (`git diff HEAD` пуст):

| Проверка | Результат |
| --- | --- |
| `vitest src/proxy.route.test.ts` | `65 passed (65)` |
| `vitest` ×4 файла поверхности (`proxy.route`, `patient/layout.branding`, `staffPwaManifest.unit`, `manifest.webmanifest/route.route`) | `74 passed (74)`, `4 files passed` |
| `tsc --noEmit` (webapp) | `exit=0`, вывод пуст |
| `eslint` по `requestSurface.ts`, `proxy.ts`, `proxy.route.test.ts` | `exit=0` |

Коды возврата сняты отдельным `echo $?`, не из-под пайпа.

## 6. Взгляд: второго пути мимо сверки нет

Полная перепись мест, где в продуктовом коде собирается `ResolvedSurface`:

| Место | Что собирает | Проходит ли сверку |
| --- | --- | --- |
| `requestSurface.ts:171` | `surface: 'patient_branded'` | **да** — строго ниже условия на `:160-166`, других выходов из tenant-ветки нет |
| `requestSurface.ts:149,152,155` | `staff` / `patient_default` / `platform_admin` | не брендированные: ни `organizationId`, ни бренда в объекте нет |
| `manifest.webmanifest/route.ts:21` | литерал `patient_default` из уже разрезолвленной поверхности | не брендированная, без `organizationId` и бренда |
| `requestSurface.ts:238` (`readResolvedSurface`) | восстанавливает брендированную из заголовка | читает результат, не резолвит заново — см. ниже |

`readResolvedSurface` — единственный «второй сборщик», и он закрыт по входу:

- писатель заголовка `x-bc-resolved-surface` ровно один — `proxy.ts:151`
  (`serializeResolvedSurface` во всём продуктовом коде вызывается только оттуда);
- `proxy.ts:150` **удаляет** входящее значение заголовка до записи своего, так что клиент подставить
  брендированную поверхность не может;
- сам `readResolvedSurface` дополнительно требует для `patient_branded` строковый `organizationId` и
  прогоняет бренд через тот же санитайзер, а для небрендированных запрещает наличие `organizationId`
  и бренда вовсе.

Литералы `patient_branded` вне продуктового кода — только тестовые фикстуры
(`staffPwaManifest.unit.test.ts`, `layout.branding.test.ts`, `manifest.webmanifest/route.route.test.ts`).

**Мимо сверки брендированную поверхность собрать нельзя.**

## 7. Взгляд: в базу слой не ходит

`requestSurface.ts` импортирует ровно две вещи: `@/config/productSurfaces` (константы origin) и
`@/modules/org-branding/service` (`DEFAULT_PATIENT_ACCENT_TOKEN` + тип `AnonymousPatientBrand`). Сам
`org-branding/service.ts` импортирует только типы из `./ports` и `../org-entitlements/types` — ни
drizzle, ни репозиториев, ни `getDrizzle`. Данные арендатора приходят исключительно через инжектируемый
`resolveTenantSurface`. **Обращения к данным нет — находки по этому пункту нет.**

Отдельно проверил, что `organizationId` из поверхности не становится ключом чтения данных. Единственный
его потребитель в продуктовом коде — `app/app/patient/layout.tsx:136`, и там он используется как
сравнение с уже доверенной организацией пациента: бренд применяется, только если они совпали, иначе
идёт прежнее чтение под патиент-принципалом. Это второй, независимый слой той же стены.

## 8. Рекомендации владельцу (не работа, пункта в плане нет)

**`R-1`. Сверка сильна ровно настолько, насколько честен будущий боевой lookup.** Условие сравнивает
два поля одного и того же результата шва. Сегодня это безопасно и проверено, но в проде шов не подключён
(`NO_TENANT_SURFACE`, `proxy.ts:34` — известно и вне объёма). Когда пункт плана будет подключать боевой
`TenantSurfaceLookup`, `effectivePatientBrandOrganizationId` обязан браться из провенанса самой строки
бренда, а не копироваться из `organizationId` рядом — иначе сверка станет тавтологией. Предлагаю внести
это строкой приёмки в тот пункт плана, который будет подключать шов. Решение — владельца; сам скоуп не
завожу.

**`R-2`. Негативный тест не различает, какой именно гейт сработал** — он проверяет `404` и отсутствие
заголовка. Сегодня честен, это доказано инъекциями `I-1`/`I-2`, но будущий рефакторинг может снова
спрятать причину. Дешёвое усиление: дополнительно утверждать, что `patientAppName` чужой организации не
попал в заголовок. Это speculative hardening по §24.6 — рекомендация, не finding.

## 9. НЕ СДЕЛАНО

- Боевое подключение `TenantSurfaceLookup` не проверялось — в проде шов отдаёт `NO_TENANT_SURFACE`,
  бриф прямо выводит это из объёма.
- Полный CI вебаппа не гонялся: изменение — три строки в одном модуле и три строки фикстур в одном
  тесте, `tsc --noEmit` по всему вебаппу зелёный, потребители типа `TenantSurfaceLookupResult`
  перечислены и проверены поимённо. Уровень проверки — точечный по §10.
- Живая проверка в браузере не делалась: поверхность недостижима без подключённого шва арендатора.
