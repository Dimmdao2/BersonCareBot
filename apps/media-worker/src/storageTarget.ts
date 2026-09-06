/**
 * Куда физически ложится объект. Тот же словарь, что и у webapp: воркер получает значение в
 * наряде и не выбирает его сам.
 *
 * `library` — библиотека упражнений и медиа CMS. `patient` — файлы и видео пациентов.
 */
export type StorageTarget = 'library' | 'patient';

/** Всё, что не названо хранилищем пациента явно, читается как библиотека — так было до разделения. */
export function parseStorageTarget(value: unknown): StorageTarget {
  return value === 'patient' ? 'patient' : 'library';
}
