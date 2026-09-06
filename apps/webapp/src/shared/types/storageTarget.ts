/**
 * Куда физически ложится объект (решение владельца 06.09.2026).
 *
 * `library` — библиотека упражнений и медиа CMS: основной объём и трафик, дешёвое хранилище.
 * `patient` — файлы и видео пациентов: хранилище с серверным шифрованием, отдельный доступ.
 *
 * Тип живёт в shared, потому что его называют оба края: порт хранилища в infra и контракты
 * модулей. Конфигурация самих хранилищ при этом остаётся одна — в `@/infra/s3/client`.
 */
export type StorageTarget = 'library' | 'patient';

/**
 * Хранилище строки БД. Колонка `storage_target` объявлена NOT NULL DEFAULT 'library', поэтому у
 * любой живой строки значение есть. Неизвестное значение означает, что читающий запрос нарушил
 * контракт и не должен молча отправлять пациентский файл в библиотечное хранилище.
 */
export function parseStorageTarget(value: unknown): StorageTarget {
  if (value === 'patient' || value === 'library') return value;
  throw new Error(`storage_target_missing_on_row: ${JSON.stringify(value)}`);
}
