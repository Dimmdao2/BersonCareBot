/** Matches scoped schedule block logic in pgBookingScheduling.listBusyIntervals. */
export function scheduleBlockAppliesToScope(input: {
  blockSpecialistId: string | null;
  blockBranchId?: string | null;
  blockRoomId?: string | null;
  specialistId?: string;
  branchId?: string;
  roomId?: string;
}): boolean {
  if (input.specialistId) {
    if (input.blockSpecialistId !== null && input.blockSpecialistId !== input.specialistId) {
      return false;
    }
  }
  if (input.branchId) {
    if (input.blockBranchId !== null && input.blockBranchId !== undefined && input.blockBranchId !== input.branchId) {
      return false;
    }
  }
  if (input.roomId) {
    if (input.blockRoomId !== null && input.blockRoomId !== undefined && input.blockRoomId !== input.roomId) {
      return false;
    }
  }
  return true;
}
