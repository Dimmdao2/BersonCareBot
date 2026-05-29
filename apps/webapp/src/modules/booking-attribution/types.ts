/** Параметры встраивания / UTM, сохраняемые в `be_appointments.attribution_json`. */
export type BookingAttribution = {
  organizationId?: string;
  branchId?: string;
  specialistId?: string;
  serviceId?: string;
  branchServiceId?: string;
  promotionId?: string;
  trafficSource?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  presetCityCode?: string;
  embedMode?: "iframe" | "popup" | "link" | "page";
  referrer?: string;
};
