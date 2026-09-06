import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Плейлист HLS приходит от FFmpeg с абсолютными ссылками на хранилище. Мы переписываем их на
 * свой origin — но только те, чей префикс признан своим. Пока список знал один бакет, плейлист
 * видео пациента уезжал бы клиенту с прямыми ссылками на шифрованное хранилище: и утечка адреса,
 * и неработающее воспроизведение (объект приватный).
 */

const envMock = {
  S3_ENDPOINT: 'https://storage.example',
  S3_PRIVATE_BUCKET: 'library-bucket',
  PATIENT_S3_ENDPOINT: '',
  PATIENT_S3_BUCKET: '',
};
vi.mock('@/config/env', () => ({ env: envMock }));

const { buildTrustedPrivateObjectUrlPrefixes } =
  await import('@/app-layer/media/hlsTrustedOriginPrefixes');

describe('доверенные префиксы объектов приватных бакетов', () => {
  beforeEach(() => {
    envMock.S3_ENDPOINT = 'https://storage.example';
    envMock.S3_PRIVATE_BUCKET = 'library-bucket';
    envMock.PATIENT_S3_ENDPOINT = '';
    envMock.PATIENT_S3_BUCKET = '';
  });

  it('без разделения перечисляет ровно один бакет, обеими формами адреса', () => {
    expect(buildTrustedPrivateObjectUrlPrefixes()).toEqual([
      'https://storage.example/library-bucket/',
      'https://library-bucket.storage.example/',
    ]);
  });

  it('с отдельным хранилищем пациентов доверяет и ему', () => {
    envMock.PATIENT_S3_ENDPOINT = 'https://encrypted.example';
    envMock.PATIENT_S3_BUCKET = 'patient-bucket';
    expect(buildTrustedPrivateObjectUrlPrefixes()).toEqual([
      'https://storage.example/library-bucket/',
      'https://library-bucket.storage.example/',
      'https://encrypted.example/patient-bucket/',
      'https://patient-bucket.encrypted.example/',
    ]);
  });

  it('хранилище пациентов на том же хосте берёт адрес основного', () => {
    envMock.PATIENT_S3_BUCKET = 'patient-bucket';
    expect(buildTrustedPrivateObjectUrlPrefixes()).toContain(
      'https://storage.example/patient-bucket/',
    );
  });

  it('без настроенного хранилища не выдаёт ни одного префикса', () => {
    envMock.S3_PRIVATE_BUCKET = '';
    expect(buildTrustedPrivateObjectUrlPrefixes()).toEqual([]);
  });
});
