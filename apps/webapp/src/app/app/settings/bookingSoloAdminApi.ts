import { apiJson } from '@/shared/lib/apiJson';
import { transliterateCyrillic } from '@/shared/lib/cyrillicTransliteration';
import { BOOKING_FORM_FIELD_KEY_PATTERN } from '@/modules/booking-form/fieldTypes';
export { apiJson } from '@/shared/lib/apiJson';

const BASE = '/api/admin/booking-engine';

export const SOLO_BOOKING_UNAVAILABLE_MESSAGE = 'Запись недоступна без подключения к базе данных.';

export type BookingDefaultKind = 'branch' | 'service' | 'specialist';

const BOOKING_DEFAULT_SETTING_KEYS: Record<BookingDefaultKind, string> = {
  branch: 'booking_calendar_default_branch_id',
  service: 'booking_calendar_default_service_id',
  specialist: 'booking_calendar_default_specialist_id',
};

export async function fetchBookingDefaultId(kind: BookingDefaultKind): Promise<string | null> {
  const json = await apiJson<{
    ok: boolean;
    settings: Array<{ key: string; valueJson: unknown }>;
  }>('/api/doctor/settings');
  const valueJson = json.settings.find(
    (setting) => setting.key === BOOKING_DEFAULT_SETTING_KEYS[kind],
  )?.valueJson;
  if (!valueJson || typeof valueJson !== 'object' || !('value' in valueJson)) return null;
  const value = valueJson.value;
  return typeof value === 'string' && value.trim() ? value : null;
}

export async function setBookingDefaultId(
  kind: BookingDefaultKind,
  id: string | null,
): Promise<void> {
  await apiJson('/api/doctor/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: BOOKING_DEFAULT_SETTING_KEYS[kind],
      value: { value: id },
    }),
  });
}

export type SoloOverview = {
  organizationId: string;
  organization: { id: string; title: string } | null;
  branches: {
    id: string;
    title: string;
    /** Short display name (e.g. «СПб», «Мск»). Migration 0117. */
    shortTitle: string | null;
    color: string | null;
    cityCode: string;
    address: string | null;
    timezone: string;
    isActive: boolean;
    sortOrder: number;
  }[];
  specialists: { id: string; fullName: string; isActive: boolean }[];
  services: {
    id: string;
    title: string;
    description: string | null;
    durationMinutes: number;
    bufferAfterMinutes: number;
    priceMinor: number;
    publicWidgetVisible: boolean;
    adminManualOnly: boolean;
    usableInPackages: boolean;
    prepaymentApplicable: boolean;
    onlinePaymentApplicable: boolean;
    isActive: boolean;
    sortOrder: number;
  }[];
  specialistAvailability: {
    id: string;
    specialistId: string;
    serviceId: string;
    branchId: string | null;
    isActive: boolean;
  }[];
  /**
   * Живые пересечения «услуга × специалист × филиал», посчитанные публичной дверью записи. Кабинет
   * их не вычисляет сам: правило «услугу кто-то делает» живёт в одном месте (#1102 §2.1).
   */
  serviceDoers: { serviceId: string; specialistId: string; branchId: string }[];
};

export async function fetchSoloOverview(): Promise<SoloOverview | null> {
  try {
    return await apiJson<SoloOverview & { ok?: boolean }>(`${BASE}/overview`);
  } catch (e) {
    if (e instanceof Error && e.message === 'booking_engine_unavailable') return null;
    throw e;
  }
}

export async function setOnlineLocationEnabled(isActive: boolean, color?: string): Promise<void> {
  await apiJson(`${BASE}/online-location`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isActive, ...(color ? { color } : {}) }),
  });
}

export function rublesToMinor(rubles: number): number {
  return Math.round(rubles * 100);
}

export function minorToRublesInput(minor: number): string {
  return String(minor / 100);
}

export function parseRublesInput(raw: string): number {
  const normalized = raw.replace(/\s/g, '').replace(',', '.');
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) throw new Error('invalid_price');
  return n;
}

/** Служебный city code для новой локации (скрыт от пользователя). */
export function slugCityCode(title: string): string {
  const latin = title
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
  if (latin.length >= 2) return latin;
  return `loc-${Date.now().toString(36).slice(-6)}`;
}

export function pickDefaultSpecialist(
  specialists: SoloOverview['specialists'],
): SoloOverview['specialists'][0] | null {
  const active = specialists.filter((s) => s.isActive);
  return active[0] ?? specialists[0] ?? null;
}

/**
 * Состояние ОДНОЙ галки на экране «Доступность услуг по филиалам»: делает ли соло-специалист эту
 * услугу в этом филиале. Это ровно та строка, которую пишет сам переключатель, — не вычисленное
 * «услугу кто-то делает» (`serviceDoers`): галка обязана показывать то, чем управляет, иначе
 * выключенный филиал или специалист гасил бы её и человек не понимал бы, что именно он снял.
 */
export function isServiceAvailableAtLocation(
  overview: Pick<SoloOverview, 'specialistAvailability' | 'specialists'>,
  serviceId: string,
  branchId: string,
): boolean {
  const specialist = pickDefaultSpecialist(overview.specialists);
  if (!specialist) return false;
  return overview.specialistAvailability.some(
    (r) =>
      r.specialistId === specialist.id &&
      r.serviceId === serviceId &&
      r.branchId === branchId &&
      r.isActive,
  );
}

/** Услугу никто не делает: ни одного живого пересечения «специалист × филиал» (#1102 §2.4). */
export function serviceHasNoDoer(
  serviceDoers: SoloOverview['serviceDoers'],
  serviceId: string,
): boolean {
  return !serviceDoers.some((doer) => doer.serviceId === serviceId);
}

/** Подпись к услуге, которую сегодня никто не делает; `null` — делает. */
export function serviceDoerNote(
  serviceDoers: SoloOverview['serviceDoers'],
  serviceId: string,
): string | null {
  return serviceHasNoDoer(serviceDoers, serviceId)
    ? 'услугу никто не оказывает — назначьте специалиста и филиал'
    : null;
}

/** Число активных услуг, которые сегодня никто не делает. */
export function countServicesWithoutAvailability(
  activeServices: { id: string }[],
  serviceDoers: SoloOverview['serviceDoers'],
): number {
  return activeServices.filter((service) => serviceHasNoDoer(serviceDoers, service.id)).length;
}

/** Есть ли активные интервалы на weekday хотя бы одного из ближайших daysAhead дней. */
export function hasScheduleOnUpcomingDays(
  rows: { weekday: number; isActive: boolean }[],
  daysAhead = 7,
  fromDate = new Date(),
): boolean {
  const activeWeekdays = new Set(rows.filter((r) => r.isActive).map((r) => r.weekday));
  if (activeWeekdays.size === 0) return false;
  for (let i = 0; i < daysAhead; i++) {
    const d = new Date(fromDate);
    d.setDate(d.getDate() + i);
    if (activeWeekdays.has(d.getDay())) return true;
  }
  return false;
}

/** Сузить или вернуть услугу в конкретном филиале руками — пишет ту же пару, что и автоматика. */
export async function setSpecialistServiceAtBranch(
  serviceId: string,
  branchId: string,
  enabled: boolean,
  specialistId: string,
): Promise<void> {
  await apiJson(`${BASE}/availability`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: 'specialist_service',
      specialistId,
      serviceId,
      branchId,
      roomId: null,
      cityCode: null,
      priceMinorOverride: null,
      isActive: enabled,
      sortOrder: 0,
    }),
  });
}

export function minuteToTimeLabel(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function timeLabelToMinute(value: string): number {
  const [h, m] = value.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) throw new Error('invalid_time');
  return h * 60 + m;
}

/**
 * Machine key for a new booking form question, derived from its human label. Labels here are
 * normally Russian while the server contract (`BOOKING_FORM_FIELD_KEY_PATTERN`) is latin, so the
 * label is transliterated instead of being passed through with its Cyrillic letters intact.
 */
export function slugFieldKey(label: string, existing: string[]): string {
  const latin = transliterateCyrillic(label)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  // The key must start with a latin letter, so a label made only of digits — or of characters
  // with no latin equivalent — still has to produce a key the server accepts.
  const candidate = /^[a-z]/.test(latin) ? latin : `field_${latin}`.slice(0, 40);
  const base = BOOKING_FORM_FIELD_KEY_PATTERN.test(candidate) ? candidate : 'field';
  let key = base;
  let i = 2;
  while (existing.includes(key)) {
    key = `${base}_${i++}`;
  }
  return key;
}
