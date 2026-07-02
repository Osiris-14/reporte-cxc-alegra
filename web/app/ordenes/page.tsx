import { hoyRD } from "@/lib/cxc-logic";
import { loadCxcData } from "@/lib/data";
import { computeOrdenes } from "@/lib/ordenes";
import OrdenesView from "./OrdenesView";

export const dynamic = "force-dynamic";
// Sin ISR: el CSV se lee fresco (no-store) en cada request.
export const revalidate = 0;

export default async function OrdenesPage() {
  const hoy = hoyRD();
  const data = await loadCxcData();
  const ordenes = computeOrdenes(data.cxc, data.pagos, data.items, hoy);
  // Momento de render (server) → hora de "última actualización" en el Topbar.
  return (
    <OrdenesView
      data={ordenes}
      fechaCorte={data.fechaCorte}
      renderedAt={new Date()}
    />
  );
}
