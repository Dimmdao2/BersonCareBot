import { z } from "zod";

const short = z.string().max(500).optional();
const uuid = z.string().uuid().optional();

export const bookingAttributionBodySchema = z.object({
  organizationId: uuid,
  branchId: uuid,
  specialistId: uuid,
  serviceId: uuid,
  branchServiceId: uuid,
  promotionId: uuid,
  trafficSource: short,
  utmSource: short,
  utmMedium: short,
  utmCampaign: short,
  utmTerm: short,
  utmContent: short,
  presetCityCode: short,
  embedMode: z.enum(["iframe", "popup", "link", "page"]).optional(),
  referrer: short,
});
