/**
 * Размер картинки, измеренный В БРАУЗЕРЕ, до отправки файла на сервер.
 *
 * Нужен ровно для одного класса требований: «не давать загрузить» (владелец 10.09.2026 про иконку
 * приложения). Проверить размер после загрузки нельзя — сервер уже переупаковал файл в стандартный
 * рендишн (`STANDARD_IMAGE_SHORT_SIDE`), и слишком большой исходник к этому моменту уже уменьшен,
 * то есть «слишком большой» на сервере просто не виден. Поэтому мерить надо у врача на устройстве.
 *
 * Возвращает `null`, когда измерить нельзя (формат браузеру не по зубам, SVG без размеров,
 * отсутствующий `createImageBitmap`) — вызывающий трактует это как «размер неизвестен», а не как
 * отказ: последнее слово всё равно за сервером, который читает сохранённые байты.
 */
export async function readImageFileDimensions(
  file: Blob,
): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close?.();
      if (size.width > 0 && size.height > 0) return size;
    } catch {
      // Падаем в <img>: Safari не декодирует через createImageBitmap часть форматов.
    }
  }
  if (typeof Image !== 'function' || typeof URL?.createObjectURL !== 'function') return null;
  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise<{ width: number; height: number } | null>((resolve) => {
      const img = new Image();
      img.onload = () =>
        resolve(
          img.naturalWidth > 0 && img.naturalHeight > 0
            ? { width: img.naturalWidth, height: img.naturalHeight }
            : null,
        );
      img.onerror = () => resolve(null);
      img.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
