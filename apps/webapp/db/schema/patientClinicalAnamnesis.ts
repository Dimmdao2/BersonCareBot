import { pgTable, uuid, text, timestamp, index, uniqueIndex, foreignKey } from 'drizzle-orm/pg-core';
import { platformUsers } from './schema';
import { beOrganizations } from './bookingEngine';

/**
 * Анамнез пациента (раздел «Анамнез» / «Анамнез жизни» в карте).
 *
 * Три биографические секции, каждая — отдельная таблица с append-log строками.
 * Записи НЕ привязаны к конкретному визиту (это биографические данные пациента,
 * а не клинические данные визита). Врач добавляет и исправляет строки; удаления нет.
 *
 * Соответствие UI (PatientTabKarta «Анамнез жизни»):
 *   clinical_anamnesis_trauma    → «Травмы и операции» (year / what / type / immobilization)
 *   clinical_anamnesis_illness   → «Болезни, стрессы» (period / what / comment)
 *   clinical_anamnesis_lifestyle → «Образ жизни» (date + text entries)
 *
 * Отдельно — «Анамнез заболевания» (clinical_disease_anamnesis): один изменяемый
 * patient×organization-scoped текст (не append-log), редактируется поверх, не смешивается
 * с биографическими секциями анамнеза жизни выше.
 */

// -- Травмы и операции -------------------------------------------------------

export const clinicalAnamnesisTrauma = pgTable(
  'clinical_anamnesis_trauma',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid('organization_id'),
    patientUserId: uuid('patient_user_id').notNull(),
    /** Год / период, напр. «1991 (15 лет)». */
    year: text('year').notNull(),
    /** Описание события, напр. «Перелом копчика». */
    what: text('what').notNull(),
    /** Тип: «Травма» / «Операция» / свободный текст. */
    type: text('type').notNull(),
    /** Иммобилизация / период восстановления, напр. «4 нед лёжа» / «—». */
    immobilization: text('immobilization').notNull().default('—'),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_clinical_anamnesis_trauma_organization_id').on(table.organizationId),
    index('idx_clinical_anamnesis_trauma_patient').on(table.patientUserId),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: 'clinical_anamnesis_trauma_organization_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.patientUserId],
      foreignColumns: [platformUsers.id],
      name: 'clinical_anamnesis_trauma_patient_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [platformUsers.id],
      name: 'clinical_anamnesis_trauma_created_by_fkey',
    }).onDelete('restrict'),
  ],
);

// -- Болезни и стрессы -------------------------------------------------------

export const clinicalAnamnesisIllness = pgTable(
  'clinical_anamnesis_illness',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid('organization_id'),
    patientUserId: uuid('patient_user_id').notNull(),
    /** Период, напр. «1999–2000» / «2020». */
    period: text('period').notNull(),
    /** Название болезни / стресса. */
    what: text('what').notNull(),
    /** Дополнительный комментарий / исход. */
    comment: text('comment').notNull().default(''),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_clinical_anamnesis_illness_organization_id').on(table.organizationId),
    index('idx_clinical_anamnesis_illness_patient').on(table.patientUserId),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: 'clinical_anamnesis_illness_organization_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.patientUserId],
      foreignColumns: [platformUsers.id],
      name: 'clinical_anamnesis_illness_patient_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [platformUsers.id],
      name: 'clinical_anamnesis_illness_created_by_fkey',
    }).onDelete('restrict'),
  ],
);

// -- Образ жизни (свободный текст + дата записи) ----------------------------

export const clinicalAnamnesisLifestyle = pgTable(
  'clinical_anamnesis_lifestyle',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid('organization_id'),
    patientUserId: uuid('patient_user_id').notNull(),
    /**
     * Дата записи (ISO-строка или ДД.ММ.ГГГГ — хранить в ISO).
     * Отображается в UI как «Запись от дата».
     */
    recordDate: text('record_date').notNull(),
    /** Свободный текст записи об образе жизни. */
    text: text('text').notNull(),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_clinical_anamnesis_lifestyle_organization_id').on(table.organizationId),
    index('idx_clinical_anamnesis_lifestyle_patient').on(table.patientUserId),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: 'clinical_anamnesis_lifestyle_organization_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.patientUserId],
      foreignColumns: [platformUsers.id],
      name: 'clinical_anamnesis_lifestyle_patient_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [platformUsers.id],
      name: 'clinical_anamnesis_lifestyle_created_by_fkey',
    }).onDelete('restrict'),
  ],
);

// -- Анамнез заболевания (единый изменяемый текст, не append-log) -----------

export const clinicalDiseaseAnamnesis = pgTable(
  'clinical_disease_anamnesis',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid('organization_id'),
    patientUserId: uuid('patient_user_id').notNull(),
    /** Единый текст «Анамнез заболевания»; правка заменяет значение целиком. */
    text: text('text').notNull().default(''),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('uq_clinical_disease_anamnesis_patient_org').on(
      table.patientUserId,
      table.organizationId,
    ),
    index('idx_clinical_disease_anamnesis_organization_id').on(table.organizationId),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: 'clinical_disease_anamnesis_organization_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.patientUserId],
      foreignColumns: [platformUsers.id],
      name: 'clinical_disease_anamnesis_patient_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [platformUsers.id],
      name: 'clinical_disease_anamnesis_created_by_fkey',
    }).onDelete('restrict'),
  ],
);
