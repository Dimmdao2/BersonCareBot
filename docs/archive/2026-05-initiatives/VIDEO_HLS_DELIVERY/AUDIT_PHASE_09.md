# AUDIT — VIDEO_HLS_DELIVERY Phase 09 (Signed URLs, TTL, private access)

**Дата:** 2026-05-03  
**Источник требований:** [phases/phase-09-signed-urls-ttl-and-private-access.md](./phases/phase-09-signed-urls-ttl-and-private-access.md)

| # | Проверка | Вердикт |
|---|----------|---------|
| 1 | TTL из `system_settings`, не из нового env | **PASS** |
| 2 | Истечение URL не ломает просмотр (перезапрос playback) | **PASS** (оговорки) |
| 3 | Bucket private, нет анонимного доступа через приложение | **PASS** (код); **PENDING (ops)** политика бакета вне репо |
| 4 | Полные presigned URL не в логах / внешней телеметрии | **PASS** |

---

## 1) TTL из DB settings, не из env

**Вердикт: PASS**

- Чтение TTL: `getVideoPresignTtlSeconds()` → `getConfigPositiveInt("video_presign_ttl_seconds", …)` → `getConfigValue` из таблицы **`system_settings`** (scope **`admin`**). См. `apps/webapp/src/app-layer/media/videoPresignTtl.ts`, `apps/webapp/src/modules/system-settings/configAdapter.ts`.
- Использование в playback path: `resolveMediaPlaybackPayload` передаёт **`presignExpiresSec`** в `presignGetUrl(..., presignExpiresSec)`. См. `apps/webapp/src/app-layer/media/resolveMediaPlaybackPayload.ts`.
- Redirect MP4: `GET /api/media/[id]` вызывает `getVideoPresignTtlSeconds()` и передаёт секунды во второй аргумент `presignGetUrl`. См. `apps/webapp/src/app/api/media/[id]/route.ts`.
- В `apps/webapp/src/config/env.ts` **нет** переменной для TTL presign GET видео/playback; единственный числовой дефолт — константа **`VIDEO_PRESIGN_TTL_DEFAULT_SEC`** в `videoPresignTtlConstants.ts`, используемая как fallback при отсутствии/невалидной строке в БД (не env).

**INFO (вне scope строгого phase-09 для playback):** другие вызовы `presignGetUrl(key)` с одним аргументом используют внутренний default **`PRESIGN_GET_DEFAULT_SEC = 3600`** в `infra/s3/client.ts` (preview fallback, media preview worker, intake и т.д.) — это **не** новый env и **не** подменяет TTL для `playback` / `GET /api/media/[id]` после phase-09.

---

## 2) Истечение URL и пользовательский просмотр

**Вердикт: PASS (с оговорками)**

- **Проактивно:** при активном HLS и наличии `masterUrl` ставится таймер обновления playback по **`expiresInSeconds`** (буфер ~10% TTL, минимум 30 с до истечения). См. `PatientContentAdaptiveVideo` — `useEffect` с `setTimeout` и `fetchPlaybackJson`.
- **Реактивно:** при fatal ошибке **hls.js** и при **`error`** элемента `<video>` в режиме HLS сначала выполняется **refetch** `GET /api/media/.../playback`; при успехе и валидном HLS — обновление payload без немедленного MP4 fallback.
- **Fallback:** если refetch не помог — сохраняется прежний автопереход на MP4 и UI «Повторить».

**Оговорки (не провалы аудита):**

- При **очень коротком TTL**, сетевых сбоях или отказе playback после истечения подписи пользователь может увидеть ошибку и нажать «Повторить» — ожидаемо.
- Ручной **reload страницы** по-прежнему валиден (новая сессия JSON / RSC).

---

## 3) Private bucket / отсутствие анонимного доступа через продукт

**Вердикт: PASS (код); PENDING (ops)**

- **Код webapp:** `presignGetUrl` в `infra/s3/client.ts` подписывает **`GetObject`** для **`S3_PRIVATE_BUCKET`** (`privateBucket()`). Публичный анонимный URL приложения не выдаётся без presign.
- **Гейты доступа:** `GET /api/media/[id]` и `GET /api/media/[id]/playback` требуют **сессию** (`getCurrentSession`), иначе **401**. Анонимный клиент не получает redirect с работающей подписью без прохождения этого слоя.
- **Ключи объектов HLS/постера** принимаются только после проверки доверенных префиксов (`isTrustedHlsArtifactS3Key`, `isTrustedPosterS3Key`) — снижает риск подписания произвольного ключа при компрометации полей БД.

**PENDING (ops / вне репозитория):** политика IAM и **bucket policy** (запрет публичного `GetObject`), ACL, аудит «публичных» корзин — по [phase-09](./phases/phase-09-signed-urls-ttl-and-private-access.md) § Private access и периодический аудит.

---

## 4) Полные presigned URL не в логах и внешней телеметрии

**Вердикт: PASS**

- **`playback_resolved`:** логируются `mediaId`, `delivery`, `hlsReady`, `fallbackUsed`, `strategy`, `latencyMs` — без URL. См. `resolveMediaPlaybackPayload.ts`.
- **`playback_presign_failed`:** `mediaId`, `presignTarget` (`hls_master` | `poster`), `err` — **не** передаётся успешный URL; полный presigned URL в объект лога не кладётся.
- **Клиент:** `patientPlaybackDiag` вызывается только в **`development`**, аргумент — структура `{ event, mediaId, delivery?, detail? }` без URL (комментарий в файле запрещает presigned URL в телеметрии). См. `PatientContentAdaptiveVideo.tsx`.

**После FIX (2026-05-03):** сообщения исключений в **`playback_presign_failed`** и **`[media GET] presign failed`** проходят через **`serializePresignFailureForLog`** — http(s) фрагменты в тексте заменяются на **`[url_redacted]`** (см. `presignLogRedaction.ts`).

---

## Findings

| ID | Уровень | Описание | Статус (после FIX) |
|----|---------|----------|----------------------|
| — | Critical | В аудите не зафиксировано. | **N/A → CLOSED** |
| — | Major | В аудите не зафиксировано. | **N/A → CLOSED** |
| P09-0 | Minor | Текст `err` в `playback_presign_failed` / `[media GET] presign failed` теоретически мог содержать URL из сообщения SDK. | **CLOSED** — `serializePresignFailureForLog` + редакция http(s) в `presignLogRedaction.ts`. |
| P09-1 | Minor | Preview / worker / intake: одноаргументный `presignGetUrl` и дефолт 3600 в SDK — не env; не влияет на DB TTL playback. | **DEFERRED (scope)** — менять preview/worker TTL только отдельной политикой продукта (не регресс phase-09). |
| P09-2 | Minor | Bucket policy «только presigned» на стенде/prod. | **CLOSED (док)** — чеклист в `docs/REPORTS/S3_PRIVATE_MEDIA_EXECUTION_LOG.md` § Revision phase-09; **DEFERRED (ops)** — фактическое подтверждение на хосте вне репо. |

---

## FIX (2026-05-03)

**Critical / Major:** открытых пунктов не было — статусы **N/A → CLOSED** сохранены.

**Minor — код**

- Добавлены `presignLogRedaction.ts` (`redactUrlLikeSubstrings`, `serializePresignFailureForLog`) и использование в **`resolveMediaPlaybackPayload`** (`playback_presign_failed`) и **`GET /api/media/[id]`** (`[media GET] presign failed`). Поле лога **`err`** — объект `{ name, message }` без сырых URL в тексте сообщения.
- Юнит-тесты: `apps/webapp/src/app-layer/media/presignLogRedaction.test.ts`.

**Minor — документирование P09-2**

- В **`docs/REPORTS/S3_PRIVATE_MEDIA_EXECUTION_LOG.md`** добавлена секция **Revision — VIDEO_HLS_DELIVERY phase-09** с ops checklist (bucket policy, ACL audit, отсутствие публичной выдачи).

**Политика env vs DB (подтверждение)**

- TTL playback / progressive redirect по-прежнему только **`system_settings.video_presign_ttl_seconds`**; новых env для этого параметра не добавлялось. См. `videoPresignTtl.ts`, `CONFIGURATION_ENV_VS_DATABASE.md`.

**Повтор целевых проверок phase-09**

- `pnpm --dir apps/webapp exec vitest run src/app-layer/media/presignLogRedaction.test.ts src/modules/system-settings/configAdapter.test.ts src/app/api/media/[id]/playback/route.test.ts src/app/api/media/[id]/route.test.ts`
- `pnpm install --frozen-lockfile && pnpm run ci`

---

## MANDATORY FIX INSTRUCTIONS

**MF-1 (TTL / конфиг)**  
Не добавлять **env** для TTL presign GET playback / progressive redirect. Единственный операционный источник — **`system_settings.video_presign_ttl_seconds`** (admin), ключ в **`ALLOWED_KEYS`**, запись через admin Settings / `updateSetting`. Нарушение — пересмотреть по `.cursor/rules/000-critical-integration-config-in-db.mdc` и `CONFIGURATION_ENV_VS_DATABASE.md`.

**MF-2 (логи и телеметрия)**  
В новых/изменённых логах и клиентской диагностике **никогда** не писать полные **`masterUrl` / `posterUrl`** / Location после redirect. Допустимы `mediaId`, `delivery`, `presignTarget`, HTTP status, тип ошибки.

**MF-3 (доступ)**  
Не ослаблять **`getCurrentSession`** на `GET /api/media/[id]` и **`GET /api/media/[id]/playback`** без отдельного продуктового решения и threat model; не отдавать presigned URL для ключей вне trusted-проверок для HLS/постера.

**MF-4 (истечение URL / UX)**  
При изменении логики плеера сохранять цепочку: **таймер по `expiresInSeconds`** → при ошибках HLS/native — **refetch playback** → затем MP4 fallback и «Повторить».

**MF-5 (rollback TTL)**  
Операционный откат — изменить значение в админке (или SQL + **`invalidateConfigKey`** / ожидание TTL кэша `configAdapter` до 60 с). Не вводить параллельный env override для того же параметра.

---

## Definition of Done (для закрытия PENDING)

- Ops: зафиксировать в runbook/checklist, что приватный бакет не отдаёт анонимный `GetObject` (политика + периодический аудит ACL).

**Статус после FIX:** чеклист добавлен в **`docs/REPORTS/S3_PRIVATE_MEDIA_EXECUTION_LOG.md`** (Revision phase-09). Фактическое выполнение проверок на конкретном хосте остаётся за оператором (**DEFERRED (ops)** в таблице findings).
