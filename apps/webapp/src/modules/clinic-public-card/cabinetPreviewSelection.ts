import type { ClinicPublicCardLocation, ClinicPublicCardServiceItem } from './ports';

/**
 * Предпросмотр визитки В КАБИНЕТЕ — решение владельца 11.09, дословно: «Кабинет специалиста или
 * клиники показывает визитку всегжа и для всех специалистов и дает его настраивать. Страница
 * публичная показывает визитку специалиста всегда, когда специалист включен и его визитка включена
 * - тогда она доступна для всех публично. **В кабинете она вообще не фильтруется**».
 *
 * Поэтому здесь НЕТ отбора и заводить его нельзя. Кабинет — редактор: он показывает всё, что у
 * клиники есть, и помечает то, что наружу сегодня не идёт, чтобы клиника видела, ЧТО именно она
 * выключила. Правило «кого показывать посетителю» принадлежит публичной двери и только ей —
 * единственная его запись живёт в теле `app.read_public_clinic_card`, где она является защитой.
 *
 * Прежняя редакция этого файла отбор повторяла — владелец предпосылку снял: копия в кабинете была
 * не второй защитой, а лишней. Состояние живёт в базе, страница его только читает.
 *
 * **Что здесь осталось от той работы и осталось не зря — порядок.** Дверь сортирует в коллации базы
 * (`C.UTF-8`, проверено на DEV: `datcollate = C.UTF-8`), то есть по коду символа.
 * `String.prototype.localeCompare` сортирует по языковым правилам и на равных `sort_order` даёт
 * ДРУГОЙ порядок при разном регистре или разном алфавите — замерено аудитором на услугах
 * («массаж | Массаж Верх» против «Массаж Верх | массаж») и на филиалах. Кабинет обязан показывать
 * тот же порядок, что увидит посетитель.
 */

/** Сравнение по коду символа — тот же порядок, что даёт `ORDER BY` в коллации `C.UTF-8`. */
function byCodeUnit(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Подписей «выключено — наружу не идёт» здесь НЕТ: владелец 11.09 их снял дословно — «Нахуя нам
 * подпись про то, что она не показывается на публичной странице?.. Она выключена, всё». Состояние
 * видно по самому выключателю рядом, вторая его запись строкой — шум.
 */
export type ClinicPublicCardLocationPreview = ClinicPublicCardLocation;

export type ClinicPublicCardServicePreview = ClinicPublicCardServiceItem;

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

/** Строка услуги, как её отдаёт кабинетный каталог (`bookingEngine.services.listServices`). */
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

/** Все специалисты клиники, порядком двери. Кабинет показывает все, ничего не пряча. */
export function listCardSpecialistsForPreview(
  rows: readonly PreviewSpecialistRow[],
): ClinicPublicCardSpecialistPreview[] {
  return [...rows]
    .sort((left, right) => left.sortOrder - right.sortOrder || byCodeUnit(left.fullName, right.fullName))
    .map((row) => ({
      id: row.id,
      fullName: row.fullName,
      shortDescription: row.description,
      avatarMediaId: row.avatarMediaId,
    }));
}

/** Все услуги клиники, порядком двери. Кабинет показывает все, ничего не пряча. */
export function listCardServicesForPreview(
  rows: readonly PreviewServiceRow[],
): ClinicPublicCardServicePreview[] {
  return [...rows]
    .sort((left, right) => left.sortOrder - right.sortOrder || byCodeUnit(left.title, right.title))
    .map((row) => ({
      title: row.title,
      description: row.description,
      durationMinutes: row.durationMinutes,
      priceMinor: row.priceMinor,
    }));
}

/** Все филиалы клиники, порядком двери. Кабинет показывает все, ничего не пряча. */
export function listCardLocationsForPreview(
  rows: readonly PreviewBranchRow[],
): ClinicPublicCardLocationPreview[] {
  return [...rows]
    .sort((left, right) => left.sortOrder - right.sortOrder || byCodeUnit(left.title, right.title))
    .map((row) => ({
      title: row.title,
      cityCode: row.cityCode,
      address: row.address,
    }));
}
