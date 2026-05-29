import type { BookingAttribution } from "./types";

const MAX_LEN = 500;

function pickString(params: URLSearchParams, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = params.get(key)?.trim();
    if (v && v.length > 0) return v.slice(0, MAX_LEN);
  }
  return undefined;
}

function pickUuid(params: URLSearchParams, ...keys: string[]): string | undefined {
  const v = pickString(params, ...keys);
  if (!v) return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v) ? v : undefined;
}

/** Нормализует query/data-атрибуты виджета в объект атрибуции. */
export function parseBookingAttributionFromSearchParams(params: URLSearchParams): BookingAttribution {
  const embedRaw = pickString(params, "embed", "mode");
  const embedMode =
    embedRaw === "iframe" || embedRaw === "popup" || embedRaw === "link" || embedRaw === "page" ? embedRaw : undefined;

  return {
    organizationId: pickUuid(params, "organizationId", "organization_id", "clinic", "clinicId"),
    branchId: pickUuid(params, "branchId", "branch_id", "branch"),
    specialistId: pickUuid(params, "specialistId", "specialist_id", "specialist"),
    serviceId: pickUuid(params, "serviceId", "service_id", "service"),
    branchServiceId: pickUuid(params, "branchServiceId", "branch_service_id"),
    promotionId: pickUuid(params, "promotionId", "promotion_id", "promo", "promotion"),
    trafficSource: pickString(params, "source", "traffic_source", "trafficSource"),
    utmSource: pickString(params, "utm_source", "utmSource"),
    utmMedium: pickString(params, "utm_medium", "utmMedium"),
    utmCampaign: pickString(params, "utm_campaign", "utmCampaign"),
    utmTerm: pickString(params, "utm_term", "utmTerm"),
    utmContent: pickString(params, "utm_content", "utmContent"),
    presetCityCode: pickString(params, "city", "cityCode", "city_code"),
    embedMode,
    referrer: pickString(params, "referrer"),
  };
}

export function mergeBookingAttribution(
  base: BookingAttribution | undefined,
  extra: BookingAttribution | undefined,
): BookingAttribution {
  return { ...base, ...extra };
}

export function bookingAttributionIsEmpty(attr: BookingAttribution): boolean {
  return Object.values(attr).every((v) => v === undefined || v === "");
}
