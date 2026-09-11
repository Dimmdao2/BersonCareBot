import type { ClinicPublicCardLocation, ClinicPublicCardServiceItem } from './ports';

/**
 * Отбор и порядок того, что попадает на визитку, — СТОРОНА КАБИНЕТА (#926 §17.M).
 *
 * Правило «кого и что показывать на визитке» записано дважды, и свести обе записи в одну нельзя:
 * внутри публичной двери копия является защитой, а предпросмотр в кабинете нужен ИМЕННО ТОГДА,
 * когда визитка выключена, — дверь в этот момент по построению возвращает `null` и источником
 * быть не может (решение ведущего 11.09, план §17.M).
 *
 * Раз копии две, они обязаны быть СЦЕПЛЕНЫ: на одних и тех же данных множество и порядок обеих
 * сторон совпадают, иначе клиника правит одну страницу, а посетитель видит другую, и расхождение
 * молчит. Сцепка — `clinicCardPreviewMatchesDoor.devDbProof.test.ts`. Здесь собрана вся кабинетная
 * копия целиком: страница настроек только вызывает эти функции, своего отбора у неё больше нет.
 *
 * **Сортировка строк — байтовая, а не языковая, и это не мелочь.** Дверь сортирует в коллации
 * базы (`C.UTF-8`, проверено на DEV: `datcollate = C.UTF-8`), то есть по коду символа.
 * `String.prototype.localeCompare` сортирует по языковым правилам и на равных `sort_order` даёт
 * ДРУГОЙ порядок при разном регистре или разном алфавите («Анна»/«анна», латиница рядом с
 * кириллицей). Так и было до этой сцепки — расхождение существовало и молчало.
 */

/** Сравнение по коду символа — тот же порядок, что даёт `ORDER BY` в коллации `C.UTF-8`. */
function byCodeUnit(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Ровно то, что показывает превью специалиста на визитке: фотография, имя, короткая строка. */
export type ClinicPublicCardSpecialistPreview = {
  id: string;
  fullName: string;
  shortDescription: string | null;
  avatarMediaId: string | null;
};

/** Строка специалиста, как её отдаёт кабинетный каталог (`bookingEngine.catalog.listSpecialists`). */
export type PreviewSpecialistRow = {
  id: string;
  fullName: string;
  description: string | null;
  avatarMediaId: string | null;
  isActive: boolean;
  cardIsPublished: boolean;
  sortOrder: number;
};

/** Строка услуги, как её отдаёт кабинетный каталог (`bookingEngine.catalog.listServices`). */
export type PreviewServiceRow = {
  title: string;
  description: string | null;
  durationMinutes: number;
  priceMinor: number;
  isActive: boolean;
  publicWidgetVisible: boolean;
  adminManualOnly: boolean;
  sortOrder: number;
};

/** Строка филиала, как её отдаёт кабинетный каталог (`bookingEngine.catalog.listBranches`). */
export type PreviewBranchRow = {
  title: string;
  cityCode: string | null;
  address: string | null;
  isActive: boolean;
  sortOrder: number;
};

/** Дверь: `is_active AND card_is_published`, `ORDER BY sort_order, full_name`. */
export function selectCardSpecialistsForPreview(
  rows: readonly PreviewSpecialistRow[],
): ClinicPublicCardSpecialistPreview[] {
  return rows
    .filter((row) => row.isActive && row.cardIsPublished)
    .sort((left, right) => left.sortOrder - right.sortOrder || byCodeUnit(left.fullName, right.fullName))
    .map((row) => ({
      id: row.id,
      fullName: row.fullName,
      shortDescription: row.description,
      avatarMediaId: row.avatarMediaId,
    }));
}

/**
 * Дверь: `is_active AND public_widget_visible AND NOT admin_manual_only`,
 * `ORDER BY sort_order, title`.
 */
export function selectCardServicesForPreview(
  rows: readonly PreviewServiceRow[],
): ClinicPublicCardServiceItem[] {
  return rows
    .filter((row) => row.isActive && row.publicWidgetVisible && !row.adminManualOnly)
    .sort((left, right) => left.sortOrder - right.sortOrder || byCodeUnit(left.title, right.title))
    .map((row) => ({
      title: row.title,
      description: row.description,
      durationMinutes: row.durationMinutes,
      priceMinor: row.priceMinor,
    }));
}

/** Дверь: `is_active`, `ORDER BY sort_order, title`. */
export function selectCardLocationsForPreview(
  rows: readonly PreviewBranchRow[],
): ClinicPublicCardLocation[] {
  return rows
    .filter((row) => row.isActive)
    .sort((left, right) => left.sortOrder - right.sortOrder || byCodeUnit(left.title, right.title))
    .map((row) => ({ title: row.title, cityCode: row.cityCode, address: row.address }));
}
