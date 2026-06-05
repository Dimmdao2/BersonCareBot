import type { BeAppointment } from "@/modules/booking-engine/types";
import type { ReverseMappingLookup } from "./reverseMapping";
import { parseRubitimeNumericId } from "./reverseMapping";
import type { RubitimeOutboundPatch } from "./types";

export function buildRubitimeOutboundPatchFromAppointment(
  appointment: Pick<
    BeAppointment,
    "startAt" | "endAt" | "branchId" | "specialistId" | "serviceId" | "status"
  >,
  reverse: ReverseMappingLookup,
  options?: { cancel?: boolean },
): RubitimeOutboundPatch {
  const patch: RubitimeOutboundPatch = {};
  if (options?.cancel) {
    patch.status = 4;
    return patch;
  }

  patch.record = appointment.startAt;
  patch.datetime_end = appointment.endAt;

  const branchId = appointment.branchId
    ? reverse.resolveRubitimeId("branch", appointment.branchId)
    : null;
  const specialistId = appointment.specialistId
    ? reverse.resolveRubitimeId("specialist", appointment.specialistId)
    : null;
  const serviceId = appointment.serviceId
    ? (reverse.resolveRubitimeId("service", appointment.serviceId) ??
      reverse.resolveRubitimeId("availability", appointment.serviceId))
    : null;

  const branchNum = parseRubitimeNumericId(branchId);
  const specialistNum = parseRubitimeNumericId(specialistId);
  const serviceNum = parseRubitimeNumericId(serviceId);
  if (branchNum !== undefined) patch.branch_id = branchNum;
  if (specialistNum !== undefined) patch.cooperator_id = specialistNum;
  if (serviceNum !== undefined) patch.service_id = serviceNum;

  return patch;
}
