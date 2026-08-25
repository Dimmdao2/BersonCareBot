/** Общая организация-скоупированная смена архива пациента. */
import { z } from 'zod';
import type { DoctorClientsPort } from './ports';

export const clientArchiveBodySchema = z.object({
  archived: z.boolean(),
});

/**
 * @param userId — уже проверенный UUID
 */
export async function applyClientArchiveChange(
  clientsPort: DoctorClientsPort,
  userId: string,
  organizationId: string,
  archived: boolean,
): Promise<void> {
  await clientsPort.setOrganizationClientArchived({ userId, organizationId, archived });
}
