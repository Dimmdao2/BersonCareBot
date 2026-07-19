import { redirect } from "next/navigation";

export const metadata = {
  title: "Установить приложение — кабинет",
};

export default function DoctorInstallPage() {
  redirect("/app/settings?tab=install");
}
