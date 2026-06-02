import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CabinetInfoLinkTile } from "@/modules/help-content/cabinetInfoLinkTiles";
import { cn } from "@/lib/utils";
import { patientCardClass, patientInfoLinkTileClass } from "@/shared/ui/patientVisual";

export function CabinetInfoLinksCard({ tiles }: { tiles: CabinetInfoLinkTile[] }) {
  return (
    <Card className={cn(patientCardClass, "ring-0")} data-testid="cabinet-info-links">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Полезная информация</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className={patientInfoLinkTileClass}>
            {t.label}
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
