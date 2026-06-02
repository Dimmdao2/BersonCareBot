# treatment-program-shared

Общие примитивы для экранов врача по программам лечения:

- **`treatmentProgramConstructorShellStyles.ts`** — цвета шапок карточек, классы карточек этапа/«общие рекомендации», `tplToolbarTextBtnClass`; алиасы `TPL_*` совпадают с именами в конструкторе шаблона и указывают на те же строки, что `INSTANCE_*`.
- **`InstanceAddLibraryItemDialog.tsx`** — модалка «Элемент из библиотеки» для экрана назначенной программы (POST `.../instances/.../stages/.../items`; для этапа 0 дополнительно POST `.../items/from-freeform-recommendation`). Режим «Свой текст» на этапе 0: **`MarkdownEditorToastUi`** (как в форме каталога рекомендаций), один запрос на composite endpoint. Тесты: `InstanceAddLibraryItemDialog.test.tsx`.
- **`treatmentProgramLibraryTypes.ts`** — типы строк каталога для шаблона и инстанса.
- **`TreatmentProgramDndUi.tsx`** — `@dnd-kit` обёртки: DnD pipeline-этапов и элементов этапа (grip на строке/этапе).
- **`treatmentProgramReorderHelpers.ts`** — расчёт `orderedStageIds` / `orderedItemIds` после DnD и chevrons; `planStageItemDndReorder` для PATCH `groupId` + bulk reorder.
- Тесты: `treatmentProgramReorderHelpers.test.ts`, `treatmentProgramInstanceItemDnd.test.ts`; RTL шаблона — `TreatmentProgramConstructorClient.reorder.test.tsx`.
- **Конструктор шаблона** (`TreatmentProgramConstructorClient.tsx`): CTA внизу через `DoctorCatalogPersistPublishBar` — у **черновика** «Сохранить черновик» disabled, публикация через «Опубликовать»; у **опубликованного** «Сохранить черновик» (перевод в `draft`) disabled, пока нет несохранённых правок названия/описания (`templateBasicsDirty`; структура этапов пишется в API сразу). См. [`docs/APP_RESTRUCTURE_INITIATIVE/LOG.md`](../../../../../../docs/APP_RESTRUCTURE_INITIATIVE/LOG.md) § 2026-06-02.
