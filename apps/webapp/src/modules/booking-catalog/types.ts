/** Shared city shape used by the canonical patient booking flow. */

export type BookingCity = {
  id: string;
  code: string;
  title: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};
