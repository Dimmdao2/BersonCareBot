import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ClientOption = { userId: string; displayName: string };

type Props = {
  clients: ClientOption[];
  selectedClientId?: string;
  selectedCategory?: string;
  dateFrom?: string;
  dateTo?: string;
  pageSize: number;
};

const CATEGORIES = [
  { value: "", label: "Все категории" },
  { value: "organizational", label: "Организационное" },
  { value: "reminder", label: "Напоминание" },
  { value: "appointment_clarification", label: "Уточнение по записи" },
  { value: "diary_request", label: "Просьба заполнить дневник" },
  { value: "feedback", label: "Обратная связь после приёма" },
  { value: "service", label: "Сервисное" },
];

export function DoctorMessagesLogFilters({
  clients,
  selectedClientId,
  selectedCategory,
  dateFrom,
  dateTo,
  pageSize,
}: Props) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="page" value="1" />
      <input type="hidden" name="pageSize" value={String(pageSize)} />
      <div className="flex min-w-[12rem] flex-col gap-1">
        <label htmlFor="doctor-messages-filter-client" className="text-xs text-muted-foreground">
          Клиент
        </label>
        <select
          id="doctor-messages-filter-client"
          name="clientId"
          defaultValue={selectedClientId ?? ""}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Все клиенты</option>
          {clients.map((c) => (
            <option key={c.userId} value={c.userId}>
              {c.displayName}
            </option>
          ))}
        </select>
      </div>

      <div className="flex min-w-[12rem] flex-col gap-1">
        <label htmlFor="doctor-messages-filter-category" className="text-xs text-muted-foreground">
          Категория
        </label>
        <select
          id="doctor-messages-filter-category"
          name="category"
          defaultValue={selectedCategory ?? ""}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {CATEGORIES.map((item) => (
            <option key={item.value || "all"} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="doctor-messages-filter-date-from" className="text-xs text-muted-foreground">
          С даты
        </label>
        <Input id="doctor-messages-filter-date-from" name="dateFrom" type="date" defaultValue={dateFrom ?? ""} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="doctor-messages-filter-date-to" className="text-xs text-muted-foreground">
          По дату
        </label>
        <Input id="doctor-messages-filter-date-to" name="dateTo" type="date" defaultValue={dateTo ?? ""} />
      </div>

      <Button type="submit" variant="secondary">
        Применить
      </Button>
      <Button type="submit" name="reset" value="1" variant="ghost">
        Сбросить
      </Button>
    </form>
  );
}
