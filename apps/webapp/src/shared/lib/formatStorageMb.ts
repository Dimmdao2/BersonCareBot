const BYTES_PER_MB = 1024 * 1024;
const BYTES_PER_GB = 1024 * 1024 * 1024;

function formatMbNumber(mb: number): string {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: mb >= 100 ? 0 : 1,
  }).format(mb);
}

/** Байты → «N МБ»; при объёме ≥ 1 ГиБ добавляет «(X ГБ)». Сырые байты в UI не показываем. */
export function formatBytesAsMb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const mb = bytes / BYTES_PER_MB;
  const mbText = `${formatMbNumber(mb)} МБ`;
  if (bytes >= BYTES_PER_GB) {
    const gbText = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(
      bytes / BYTES_PER_GB,
    );
    return `${mbText} (${gbText} ГБ)`;
  }
  return mbText;
}
