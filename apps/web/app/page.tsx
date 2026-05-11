import { Dashboard } from "@/components/dashboard";
import { getDashboardData } from "@/lib/data";
import { requireSession } from "@/lib/auth";

export default async function HomePage() {
  await requireSession();
  const data = await getDashboardData();

  return <Dashboard initialData={data} />;
}

