# treatment-program-shared

Общие примитивы для экранов врача по программам лечения:

- **`treatmentProgramConstructorShellStyles.ts`** — цвета шапок карточек, классы карточек этапа/«общие рекомендации», `tplToolbarTextBtnClass`; алиасы `TPL_*` совпадают с именами в конструкторе шаблона и указывают на те же строки, что `INSTANCE_*`.
- **`programInstanceMutationGuard.ts`** — `isProgramInstanceEditLocked`, `requestProgramInstanceDataMutation` (sync guard), `runIfProgramInstanceMutationAllowed` (обёртка для async PATCH/POST после того же guard).

Импорт стилей из этого модуля и в экран инстанса, и в `TreatmentProgramConstructorClient`, чтобы не дублировать константы shell.
