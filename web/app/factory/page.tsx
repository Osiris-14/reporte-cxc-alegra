import { hoyRD } from "@/lib/cxc-logic";
import { loadCxcData } from "@/lib/data";
import { computeFactory } from "@/lib/factory";
import FactoryView from "./FactoryView";

export const dynamic = "force-dynamic";
export const revalidate = 1800;

export default async function FactoryPage() {
  const hoy = hoyRD();
  const data = await loadCxcData();
  const factory = computeFactory(data.cxc, data.pagos, hoy);
  return <FactoryView data={factory} fechaCorte={data.fechaCorte} />;
}
