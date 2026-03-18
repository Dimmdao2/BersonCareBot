import type { ChannelBindings } from "@/shared/types/session";

/** Фильтры для списка клиентов специалиста. */
export type DoctorClientsFilters = {
  search?: string;
  hasUpcomingAppointment?: boolean;
  hasTelegram?: boolean;
  hasMax?: boolean;
};

/** Строка клиента в списке. */
export type ClientListItem = {
  userId: string;
  displayName: string;
  phone: string | null;
  bindings: ChannelBindings;
  nextAppointmentLabel: string | null;
  cancellationCount30d: number;
};

/** Базовая идентичность клиента (для профиля и агрегации). */
export type ClientIdentity = {
  userId: string;
  displayName: string;
  phone: string | null;
  bindings: ChannelBindings;
  createdAt: string | null;
};

export type DoctorClientsPort = {
  listClients(filters: DoctorClientsFilters): Promise<ClientListItem[]>;
  getClientIdentity(userId: string): Promise<ClientIdentity | null>;
};
