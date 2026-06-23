import { hoyRD } from "@/lib/cxc-logic";
import { loadCxcData } from "@/lib/data";
import { computeFactory } from "@/lib/factory";
import FactoryView from "./FactoryView";

export const dynamic = "force-dynamic";
// Sin ISR: el CSV se lee fresco (no-store) en cada request.
export const revalidate = 0;

export default async function FactoryPage() {
  const hoy = hoyRD();
  const data = await loadCxcData();
  const factory = computeFactory(
    data.cxc,
    data.pagos,
    hoy,
    data.factoringMovs,
    data.factoringSaldo,
  );
  return <FactoryView data={factory} fechaCorte={data.fechaCorte} />;
}
