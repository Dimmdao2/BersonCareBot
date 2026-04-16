import Link from "next/link";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export default async function DoctorReferencesPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const categories = await deps.references.listCategories();

  return (
    <AppShell title="Справочники" user={session.user} variant="doctor" backHref="/app/doctor">
      <section className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Управление системными справочниками: область тела, тип нагрузки, стадия и другие.
        </p>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat) => (
            <li key={cat.id}>
              <Card size="sm">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2 text-base">
                    <span>{cat.title}</span>
                    <Badge variant={cat.isUserExtensible ? "secondary" : "outline"}>
                      {cat.isUserExtensible ? "Расширяемый" : "Системный"}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p className="text-xs text-muted-foreground">Код: {cat.code}</p>
                  <Link
                    href={`/app/doctor/references/${encodeURIComponent(cat.code)}`}
                    className={cn(buttonVariants({ size: "sm" }))}
                  >
                    Открыть
                  </Link>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
