/**
 * Врач не мог загрузить ни одного файла пациента: `POST /api/doctor/patients/<id>/files` отвечал
 * пустым 500, а в журнале лежало `permission denied for table media_folders` (42501), следом —
 * то же самое на `media_files`. В `patient_files` не было ни одной строки.
 *
 * Причина — та же, что в L-8 у владельца клиники, и она НЕ «мало прав вообще»: drizzle в INSERT
 * именует КАЖДУЮ колонку таблицы, включая те, что уходят значением `default`, а PostgreSQL
 * проверяет привилегию на каждую НАЗВАННУЮ колонку. Колоночный грант, суженный до «что мы реально
 * пишем», отказывает, хотя по списку выглядит достаточным. Ни типы, ни моки такого не видят:
 * отказывает движок, и только на живой базе.
 *
 * Тест сравнивает ровно два исполняемых артефакта и ничего больше:
 *   слева  — SQL, который drizzle СОБИРАЕТ для трёх шагов живой загрузки файла пациента
 *            (`pgClientMediaFolders.insertClientPatientFolder` → `pgPatientFiles.createFile`:
 *            media_folders, media_files, patient_files) и для шага подтверждения;
 *   справа — SQL, который деплой ПРИМЕНЯЕТ к базе (`deploy/postgres/generated/privileges.*.sql`,
 *            он же предмет `generate-cli.mjs --check` и reconcile-аудита каталога).
 *
 * Вторая половина теста держит цену этого расширения. Шесть колонок `media_files` —
 * `owner_kind` и результат транскодера — принадлежат медиа-воркеру: персонал их не пишет нигде в
 * приложении, но drizzle обязан их назвать. Грант на них — водопровод; стеной остаётся
 * RESTRICTIVE-политика, принимающая вставку персонала только пока эти шесть несут свой default.
 *
 * Краснеет, если: у таблицы появилась колонка, а грант не расширили; грант сузили; drizzle сменил
 * форму INSERT/UPDATE; из артефакта пропала политика, удерживающая колонки воркера на default;
 * персоналу выдали UPDATE на эти колонки в обход политики.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { mediaFiles, mediaFolders } from '../../../db/schema/schema';
import { patientFiles } from '../../../db/schema/patientFiles';

const REPO_ROOT = resolve(__dirname, '../../../../..');
const MANAGED_DATABASES = ['bcb_webapp_dev', 'bersoncarebot_test'] as const;
const STAFF_ROLE = 'app_staff';

/** Колонки, которые персонал обязан НАЗВАТЬ (так строит drizzle), но не вправе ЗАПОЛНИТЬ. */
const MEDIA_WORKER_OWNED_COLUMNS = [
  'available_qualities_json',
  'hls_artifact_prefix',
  'hls_master_playlist_s3_key',
  'owner_kind',
  'poster_s3_key',
  'video_duration_seconds',
] as const;

/** Никакого соединения: `.toSQL()` собирает тот же текст, что уходит в движок в проде. */
const db = drizzle({ client: { query: async () => ({ rows: [] }) } as never });

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const PATIENT_ID = '00000000-0000-4000-8000-000000000002';
const STAFF_ID = '00000000-0000-4000-8000-000000000003';
const FOLDER_ID = '00000000-0000-4000-8000-000000000004';
const MEDIA_ID = '00000000-0000-4000-8000-000000000005';

function statementColumns(sql: string, verb: 'insert' | 'update'): string[] {
  if (verb === 'insert') {
    const match = /^insert into "[^"]+" \(([^)]+)\)/u.exec(sql);
    if (!match) throw new Error(`не разобрал INSERT: ${sql.slice(0, 120)}`);
    return match[1].split(',').map((column) => column.trim().replaceAll('"', ''));
  }
  const match = /^update "[^"]+" set (.+?) where /u.exec(sql);
  if (!match) throw new Error(`не разобрал UPDATE: ${sql.slice(0, 120)}`);
  return match[1]
    .split(/,\s*(?=")/u)
    .map((assignment) => assignment.split('=')[0].trim().replaceAll('"', ''));
}

function deployedSql(database: (typeof MANAGED_DATABASES)[number]): string {
  return readFileSync(
    resolve(REPO_ROOT, `deploy/postgres/generated/privileges.${database}.sql`),
    'utf8',
  );
}

function grantedColumns(
  artifact: string,
  table: string,
  operation: 'INSERT' | 'SELECT' | 'UPDATE',
): string[] | null {
  const pattern = new RegExp(
    `^GRANT ${operation} \\(([^)]+)\\) ON TABLE "public"\\."${table}" TO "${STAFF_ROLE}";$`,
    'mu',
  );
  const match = pattern.exec(artifact);
  if (!match) return null;
  return match[1].split(',').map((column) => column.trim().replaceAll('"', ''));
}

/** Ровно те значения, что кладут живые пути загрузки файла пациента. */
const clientPatientFolderInsertSql = db
  .insert(mediaFolders)
  .values({
    organizationId: ORG_ID,
    name: 'Иванов Иван',
    parentId: FOLDER_ID,
    kind: 'client_patient',
    patientUserId: PATIENT_ID,
  })
  .returning()
  .toSQL().sql;

const mediaFileInsertSql = db
  .insert(mediaFiles)
  .values({
    organizationId: ORG_ID,
    displayName: 'analysis.pdf',
    originalName: 'analysis.pdf',
    storedPath: 'patient-files/analysis.pdf',
    s3Key: 'patient-files/analysis.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    uploadedBy: STAFF_ID,
    folderId: FOLDER_ID,
    status: 'pending',
    previewStatus: 'pending',
  })
  .returning({ id: mediaFiles.id })
  .toSQL().sql;

const patientFileInsertSql = db
  .insert(patientFiles)
  .values({
    organizationId: ORG_ID,
    patientUserId: PATIENT_ID,
    category: 'анализ',
    fileName: 'analysis.pdf',
    s3Key: 'patient-files/analysis.pdf',
    s3Bucket: 'bcb-media',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    uploadedByUserId: STAFF_ID,
    mediaFileId: MEDIA_ID,
  })
  .returning()
  .toSQL().sql;

/** Второй шаг того же пути: PUT в S3 состоялся, строка переводится в «готово». */
const mediaFileConfirmSql = db
  .update(mediaFiles)
  .set({ status: 'ready' })
  .where(and(eq(mediaFiles.id, MEDIA_ID), eq(mediaFiles.organizationId, ORG_ID)))
  .returning({ id: mediaFiles.id })
  .toSQL().sql;

const patientFileConfirmSql = db
  .update(patientFiles)
  .set({ sizeBytes: 1024 })
  .where(and(eq(patientFiles.mediaFileId, MEDIA_ID), eq(patientFiles.organizationId, ORG_ID)))
  .returning()
  .toSQL().sql;

const UPLOAD_INSERTS = [
  ['media_folders', clientPatientFolderInsertSql],
  ['media_files', mediaFileInsertSql],
  ['patient_files', patientFileInsertSql],
] as const;

const UPLOAD_UPDATES = [
  ['media_files', mediaFileConfirmSql],
  ['patient_files', patientFileConfirmSql],
] as const;

describe('загрузка файла пациента: drizzle INSERT ⊆ гранты, которые ставит деплой', () => {
  it('drizzle именует и DEFAULT-колонки — иначе объяснение отказа было бы другим', () => {
    expect(statementColumns(clientPatientFolderInsertSql, 'insert')).toContain('created_at');
    expect(statementColumns(mediaFileInsertSql, 'insert')).toContain('hls_master_playlist_s3_key');
    expect(statementColumns(patientFileInsertSql, 'insert')).toContain('visit_id');
    for (const [, sql] of UPLOAD_INSERTS) expect(sql).toContain('default');
  });

  for (const database of MANAGED_DATABASES) {
    const artifact = deployedSql(database);

    for (const [table, sql] of UPLOAD_INSERTS) {
      it(`${database}: ${table} — врач пишет только названные разрешённые колонки`, () => {
        const granted = grantedColumns(artifact, table, 'INSERT');
        expect(granted, `нет GRANT INSERT на ${table} для ${STAFF_ROLE}`).not.toBeNull();
        for (const column of statementColumns(sql, 'insert')) {
          expect(granted, `${table}.${column}`).toContain(column);
        }
      });
    }

    for (const [table, sql] of UPLOAD_UPDATES) {
      it(`${database}: ${table} — подтверждение загрузки правит только разрешённые колонки`, () => {
        const granted = grantedColumns(artifact, table, 'UPDATE');
        expect(granted, `нет GRANT UPDATE на ${table} для ${STAFF_ROLE}`).not.toBeNull();
        for (const column of statementColumns(sql, 'update')) {
          expect(granted, `${table}.${column}`).toContain(column);
        }
      });
    }

    it(`${database}: колонки медиа-воркера остаются на своём default при вставке персоналом`, () => {
      const policy =
        /^CREATE POLICY "rev10_media_files_staff_worker_columns_\d+" ON "public"\."media_files" AS RESTRICTIVE FOR INSERT TO "app_staff" WITH CHECK \((.+)\);$/mu.exec(
          artifact,
        );
      expect(policy, 'нет стены на колонки воркера при вставке в media_files').not.toBeNull();
      expect(policy?.[1]).toContain("owner_kind = 'organization'");
      expect(policy?.[1]).toContain('hls_master_playlist_s3_key IS NULL');
      expect(policy?.[1]).toContain('hls_artifact_prefix IS NULL');
      expect(policy?.[1]).toContain('poster_s3_key IS NULL');
      expect(policy?.[1]).toContain('video_duration_seconds IS NULL');
      expect(policy?.[1]).toContain('available_qualities_json IS NULL');
    });

    it(`${database}: персонал не может дописать колонки воркера следующим UPDATE`, () => {
      const granted = grantedColumns(artifact, 'media_files', 'UPDATE') ?? [];
      for (const column of MEDIA_WORKER_OWNED_COLUMNS) {
        expect(granted, `media_files.${column} — колонка медиа-воркера`).not.toContain(column);
      }
    });
  }
});
