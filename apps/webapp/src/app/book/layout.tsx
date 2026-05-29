import type { ReactNode } from "react";
import { PublicBookingAttributionCapture } from "./PublicBookingAttributionCapture";

export default function PublicBookLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div id="public-book-shell" className="min-h-[100dvh] bg-background text-foreground">
      <PublicBookingAttributionCapture />
      {children}
    </div>
  );
}
