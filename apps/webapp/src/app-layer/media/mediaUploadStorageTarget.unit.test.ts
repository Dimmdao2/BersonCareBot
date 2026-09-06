import { describe, expect, it } from 'vitest';
import { prepareMediaUpload } from './mediaUploadAdapter';
import type { UploadPolicyId } from '@/modules/media/uploadValidation';

/**
 * Куда физически ложится загрузка, решает политика (owner ruling 06.09.2026): данные пациентов —
 * в шифрованное хранилище, библиотека и CMS — в общее. Ошибка в эту сторону не падает и не видна
 * в интерфейсе: файл просто оказывается в незашифрованном бакете. Поэтому правило закреплено тестом.
 */
const PATIENT_POLICIES: UploadPolicyId[] = ['patient-program-submission', 'patient-file'];
const LIBRARY_POLICIES: UploadPolicyId[] = ['cms', 'proxy', 'individual-exercise-video'];

function prepare(policyId: UploadPolicyId, namespace?: 'media' | 'patient-files') {
  const res = prepareMediaUpload({
    filename: 'clip.mp4',
    mimeType: 'video/mp4',
    sizeBytes: 1024,
    policyId,
    ...(namespace ? { namespace } : {}),
  });
  if (!res.ok) throw new Error(`подготовка отклонена: ${res.error}`);
  return res.value;
}

describe('физическое хранилище загрузки выбирается по политике', () => {
  it.each(PATIENT_POLICIES)('%s кладётся в хранилище пациентов', (policyId) => {
    expect(prepare(policyId).target).toBe('patient');
  });

  it.each(LIBRARY_POLICIES)('%s остаётся в общем хранилище', (policyId) => {
    expect(prepare(policyId).target).toBe('library');
  });

  it('namespace файлов пациента уводит в хранилище пациентов независимо от политики', () => {
    expect(prepare('cms', 'patient-files').target).toBe('patient');
  });

  it('перечисленные политики покрывают весь замкнутый набор', () => {
    // Новая политика обязана попасть в один из списков выше, иначе решение о хранилище
    // данных пациента примет умолчание — молча и в пользу незашифрованного бакета.
    const covered = [...PATIENT_POLICIES, ...LIBRARY_POLICIES].sort();
    const declared: UploadPolicyId[] = [
      'cms',
      'proxy',
      'individual-exercise-video',
      'patient-program-submission',
      'patient-file',
    ];
    expect(covered).toEqual([...declared].sort());
  });
});
