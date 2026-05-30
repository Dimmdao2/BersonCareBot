"use client";

type OverviewSlice = {
  specialists: { id: string; fullName: string }[];
  services: { id: string; title: string }[];
  branches: { id: string; title: string }[];
  rooms: { id: string; title: string }[];
  specialistAvailability: {
    id: string;
    specialistId: string;
    serviceId: string;
    branchId: string | null;
  }[];
  locationAvailability: { id: string; serviceId: string; branchId: string }[];
  specialistRooms: { id: string; specialistId: string; roomId: string }[];
};

export function BookingAvailabilityMatrixTable({ data }: { data: OverviewSlice }) {
  const specById = new Map(data.specialists.map((s) => [s.id, s.fullName]));
  const svcById = new Map(data.services.map((s) => [s.id, s.title]));
  const branchById = new Map(data.branches.map((b) => [b.id, b.title]));
  const roomById = new Map(data.rooms.map((r) => [r.id, r.title]));

  const specServiceRows = data.specialistAvailability.map((row) => ({
    id: row.id,
    specialist: specById.get(row.specialistId) ?? row.specialistId,
    service: svcById.get(row.serviceId) ?? row.serviceId,
    branch: row.branchId ? (branchById.get(row.branchId) ?? row.branchId) : "—",
    kind: "Специалист × услуга",
  }));

  const locRows = data.locationAvailability.map((row) => ({
    id: row.id,
    specialist: "—",
    service: svcById.get(row.serviceId) ?? row.serviceId,
    branch: branchById.get(row.branchId) ?? row.branchId,
    kind: "Услуга × филиал",
  }));

  const roomRows = data.specialistRooms.map((row) => ({
    id: row.id,
    specialist: specById.get(row.specialistId) ?? row.specialistId,
    service: "—",
    branch: roomById.get(row.roomId) ?? row.roomId,
    kind: "Специалист × кабинет",
  }));

  const rows = [...specServiceRows, ...locRows, ...roomRows];

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Связей пока нет.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left">
            <th className="px-3 py-2 font-medium">Тип</th>
            <th className="px-3 py-2 font-medium">Специалист</th>
            <th className="px-3 py-2 font-medium">Услуга</th>
            <th className="px-3 py-2 font-medium">Филиал / кабинет</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border/60 last:border-0">
              <td className="px-3 py-2 text-muted-foreground">{row.kind}</td>
              <td className="px-3 py-2">{row.specialist}</td>
              <td className="px-3 py-2">{row.service}</td>
              <td className="px-3 py-2">{row.branch}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
