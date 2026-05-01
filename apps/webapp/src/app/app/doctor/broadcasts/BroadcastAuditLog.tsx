import type { BroadcastAuditEntry } from "@/modules/doctor-broadcasts/ports";
import {
  formatAudienceLabel,
  formatBroadcastDate,
  formatCategoryLabel,
  formatChannelsSummary,
} from "./labels";

type Props = {
  entries: BroadcastAuditEntry[];
};

export function BroadcastAuditLog({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <p id="broadcast-audit-empty" className="text-sm text-muted-foreground">
        Рассылок ещё не было.
      </p>
    );
  }

  const hasErrors = entries.some((e) => e.errorCount > 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Дата</th>
            <th className="pb-2 pr-4 font-medium">Категория</th>
            <th className="pb-2 pr-4 font-medium">Аудитория</th>
            <th className="pb-2 pr-4 font-medium">Каналы</th>
            <th className="pb-2 pr-4 font-medium">Заголовок</th>
            <th className="pb-2 pr-4 font-medium text-right">Охват</th>
            <th className="pb-2 pr-4 font-medium text-right">Отправлено</th>
            {hasErrors ? <th className="pb-2 font-medium text-right">Ошибки</th> : null}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b border-border/50 last:border-0">
              <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                {formatBroadcastDate(entry.executedAt)}
              </td>
              <td className="py-2 pr-4">{formatCategoryLabel(entry.category)}</td>
              <td className="py-2 pr-4 whitespace-nowrap">{formatAudienceLabel(entry.audienceFilter)}</td>
              <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                {formatChannelsSummary(entry.channels)}
              </td>
              <td className="py-2 pr-4">{entry.messageTitle}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{entry.audienceSize}</td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {entry.sentCount} / {entry.audienceSize}
              </td>
              {hasErrors ? (
                <td className="py-2 text-right tabular-nums text-destructive">{entry.errorCount}</td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
