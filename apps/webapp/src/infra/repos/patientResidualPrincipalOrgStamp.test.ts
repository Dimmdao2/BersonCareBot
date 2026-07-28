import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runWithDbOrganizationPrincipal } from '@bersoncare/db-principal';

type InsertValues = Record<string, unknown>;
type SelectRow = Record<string, unknown>;

const { insertedValues, updatedValues, selectRows, txMock } = vi.hoisted(() => {
  const insertedValues: InsertValues[] = [];
  const updatedValues: InsertValues[] = [];
  const selectRows: SelectRow[][] = [];

  function makeInsertBuilder() {
    let currentValues: InsertValues = {};
    return {
      values: vi.fn((values: InsertValues) => {
        currentValues = values;
        insertedValues.push(values);
        return {
          returning: vi.fn(async () => [
            {
              id: `insert-${insertedValues.length}`,
              createdAt: '2026-07-09T00:00:00.000Z',
              ...currentValues,
            },
          ]),
        };
      }),
    };
  }

  function makeSelectBuilder() {
    return {
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => selectRows.shift() ?? []),
          orderBy: vi.fn(async () => selectRows.shift() ?? []),
        })),
        orderBy: vi.fn(async () => selectRows.shift() ?? []),
      })),
    };
  }

  function makeUpdateBuilder() {
    return {
      set: vi.fn((values: InsertValues) => {
        updatedValues.push(values);
        return {
          where: vi.fn(() => ({
            returning: vi.fn(async () => [{ id: 'updated' }]),
          })),
        };
      }),
    };
  }

  const txMock = {
    execute: vi.fn(),
    insert: vi.fn(() => makeInsertBuilder()),
    select: vi.fn(() => makeSelectBuilder()),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(txMock)),
    update: vi.fn(() => makeUpdateBuilder()),
  };

  return { insertedValues, updatedValues, selectRows, txMock };
});

vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappTransaction: vi.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
}));

vi.mock('@/app-layer/db/drizzle', () => ({
  getDrizzle: () => txMock,
}));

import { createPgPatientClinicalPort } from './pgPatientClinical';
import { createPgPatientComorbiditiesPort } from './pgPatientComorbidities';
import { createPgPatientFilesPort } from './pgPatientFiles';
import { pgEnsureClientPatientFolder } from './pgClientMediaFolders';
import { upsertClientSupportProfile } from './pgDoctorPatientSupport';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PATIENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DOCTOR_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function resetMocks() {
  insertedValues.length = 0;
  updatedValues.length = 0;
  selectRows.length = 0;
  txMock.insert.mockClear();
  txMock.execute.mockClear();
  txMock.select.mockClear();
  txMock.transaction.mockClear();
  txMock.update.mockClear();
}

describe('patient residual repo writes stamp the active organization principal', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('stamps clinical anamnesis inserts with current DB principal org', async () => {
    const port = createPgPatientClinicalPort();

    await runWithDbOrganizationPrincipal(ORG_ID, () =>
      port.appendAnamnesisTrauma({
        patientUserId: PATIENT_ID,
        year: '2024',
        what: 'Fall',
        type: 'injury',
        immobilization: 'none',
        createdBy: DOCTOR_ID,
      }),
    );

    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]).toMatchObject({ organizationId: ORG_ID, patientUserId: PATIENT_ID });
  });

  it('stamps every clinical visit insert branch with current DB principal org', async () => {
    const port = createPgPatientClinicalPort();

    await runWithDbOrganizationPrincipal(ORG_ID, () =>
      port.createVisit({
        patientUserId: PATIENT_ID,
        visitType: 'first',
        visitedAt: '2026-07-09T10:00:00.000Z',
        location: null,
        service: null,
        duration: null,
        anamnesisText: null,
        appointmentRecordId: null,
        exam: null,
        manipulations: null,
        trialResults: null,
        recommendations: null,
        createdBy: DOCTOR_ID,
        complaints: [{ text: 'Pain', description: null, priority: true, severity: 5 }],
        diagnoses: [{ text: 'Diagnosis', catalogId: null, priority: false, comment: null }],
      }),
    );

    expect(insertedValues).toHaveLength(4);
    for (const values of insertedValues) {
      expect(values).toMatchObject({ organizationId: ORG_ID });
    }
    expect(insertedValues[0]).toMatchObject({ patientUserId: PATIENT_ID, visitType: 'first' });
    expect(insertedValues[1]).toMatchObject({ patientUserId: PATIENT_ID, text: 'Pain' });
    expect(insertedValues[2]).toMatchObject({ severity: 5 });
    expect(insertedValues[3]).toMatchObject({ patientUserId: PATIENT_ID, text: 'Diagnosis' });
  });

  it('stamps patient comorbidity inserts with current DB principal org', async () => {
    const port = createPgPatientComorbiditiesPort();

    await runWithDbOrganizationPrincipal(ORG_ID, () =>
      port.add({
        patientUserId: PATIENT_ID,
        text: 'Asthma',
        createdBy: DOCTOR_ID,
      }),
    );

    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]).toMatchObject({ organizationId: ORG_ID, patientUserId: PATIENT_ID });
  });

  it('stamps media_files and patient_files inserts with current DB principal org', async () => {
    const port = createPgPatientFilesPort();

    await runWithDbOrganizationPrincipal(ORG_ID, () =>
      port.createFile({
        patientUserId: PATIENT_ID,
        category: 'прочее',
        fileName: 'scan.pdf',
        s3Key: 'patients/file.pdf',
        s3Bucket: 'private',
        mimeType: 'application/pdf',
        sizeBytes: 123,
        uploadedByUserId: DOCTOR_ID,
        folderId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      }),
    );

    expect(insertedValues).toHaveLength(2);
    expect(insertedValues[0]).toMatchObject({ organizationId: ORG_ID, s3Key: 'patients/file.pdf' });
    expect(insertedValues[1]).toMatchObject({ organizationId: ORG_ID, patientUserId: PATIENT_ID });
  });

  it('stamps auto-created client patient media folders with current DB principal org', async () => {
    selectRows.push(
      [],
      [],
      [],
      [],
      [
        {
          firstName: 'Anna',
          lastName: 'Patient',
          patronymic: null,
          displayName: 'Anna Patient',
          phoneNormalized: null,
        },
      ],
    );

    await runWithDbOrganizationPrincipal(ORG_ID, () => pgEnsureClientPatientFolder(PATIENT_ID));

    expect(insertedValues).toHaveLength(2);
    expect(insertedValues[0]).toMatchObject({
      organizationId: ORG_ID,
      kind: 'client_files_root',
    });
    expect(insertedValues[1]).toMatchObject({
      organizationId: ORG_ID,
      kind: 'client_patient',
      patientUserId: PATIENT_ID,
    });
  });

  it('stamps doctor patient support inserts with current DB principal org', async () => {
    selectRows.push([]);

    await runWithDbOrganizationPrincipal(ORG_ID, () =>
      upsertClientSupportProfile({
        patientUserId: PATIENT_ID,
        onSupport: true,
        commentsEnabled: true,
        mediaEnabled: true,
        updatedBy: DOCTOR_ID,
      }),
    );

    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]).toMatchObject({
      organizationId: ORG_ID,
      patientUserId: PATIENT_ID,
      onSupport: true,
    });
  });

  it('backfills doctor patient support null organization on update with current DB principal org', async () => {
    selectRows.push([
      {
        organizationId: null,
        patientUserId: PATIENT_ID,
        onSupport: false,
        supportStartedAt: null,
        commentsEnabled: null,
        mediaEnabled: null,
        updatedAt: '2026-01-01T00:00:00.000Z',
        updatedBy: null,
      },
    ]);

    await runWithDbOrganizationPrincipal(ORG_ID, () =>
      upsertClientSupportProfile({
        patientUserId: PATIENT_ID,
        mediaEnabled: true,
        updatedBy: DOCTOR_ID,
      }),
    );

    expect(updatedValues).toHaveLength(1);
    expect(updatedValues[0]).toMatchObject({
      organizationId: ORG_ID,
      mediaEnabled: true,
      updatedBy: DOCTOR_ID,
    });
  });
});
