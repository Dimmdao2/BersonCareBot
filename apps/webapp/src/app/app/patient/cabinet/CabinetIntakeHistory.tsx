import { Badge } from "@/components/ui/badge";
import type { IntakeRequest } from "@/modules/online-intake/types";

const STATUS_LABELS: Record<string, string> = {
  new: "Отправлена",
  in_review: "На рассмотрении",
  contacted: "Связались",
  closed: "Завершена",
};

const TYPE_LABELS: Record<string, string> = {
  lfk: "ЛФК (онлайн)",
  nutrition: "Нутрициология (онлайн)",
};

type Props = {
  items: IntakeRequest[];
};

export function CabinetIntakeHistory({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-muted-foreground">Онлайн-заявки</h3>
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-lg border border-border bg-card px-4 py-3 flex flex-col gap-1 shadow-sm"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{TYPE_LABELS[item.type] ?? item.type}</span>
              <Badge variant="outline" className="text-xs">
                {STATUS_LABELS[item.status] ?? item.status}
              </Badge>
              <span className="ml-auto text-xs text-muted-foreground">
                {new Date(item.createdAt).toLocaleDateString("ru-RU")}
              </span>
            </div>
            {item.summary && (
              <p className="text-xs text-muted-foreground line-clamp-2">{item.summary}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
