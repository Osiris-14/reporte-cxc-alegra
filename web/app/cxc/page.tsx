import { hoyRD } from "@/lib/cxc-logic";
import { loadCxcData } from "@/lib/data";
import { computeDashboard } from "@/lib/kpis";
import Dashboard from "./Dashboard";

// No prerenderizar: "hoy" debe evaluarse en cada request, no en build time.
export const dynamic = "force-dynamic";
// Sin ISR: el CSV se lee fresco (no-store) en cada request.
export const revalidate = 0;

export default async function CxcPage() {
  // "hoy" SIEMPRE es la fecha real en America/Santo_Domingo (UTC-4), igual que
  // Power BI (Hoy_RD = NOW()-TIME(4,0,0)). NUNCA se usa la fecha del CSV para
  // calcular estados. `fechaCorte` solo alimenta el banner de frescura.
  const hoy = hoyRD();
  const data = await loadCxcData();
  const dash = computeDashboard(data.cxc, data.pagos, hoy);
  // Momento de render (server) → hora de "última actualización" en el Topbar.
  return <Dashboard dash={dash} fechaCorte={data.fechaCorte} renderedAt={new Date()} />;
}
