/**
 * Reporte de validación: corre el pipeline real (fs) e imprime los KPIs.
 * Ejecutar: CXC_DATA_SOURCE=fs npx vitest run scripts/report.test.ts
 */
import { it } from "vitest";
import { hoyRD } from "../lib/cxc-logic";
import { loadCxcData } from "../lib/data";
import { computeDashboard } from "../lib/kpis";
import { money, diaMesAnio } from "../lib/format";

it("imprime KPIs reales", async () => {
  process.env.CXC_DATA_SOURCE = "fs";
  const data = await loadCxcData();
  const hoy = hoyRD(); // hoy real RD, igual que la app y Power BI
  const d = computeDashboard(data.cxc, data.pagos, hoy);
  const L: string[] = [];
  L.push(`\n===== CXC MONITOR — KPIs reales (hoy ${diaMesAnio(hoy)}, datos al ${diaMesAnio(data.fechaCorte)}) =====`);
  L.push(`Filas cxc (año en curso): ${data.cxc.length}`);
  L.push(`\n--- Metric cards (Resumen) ---`);
  L.push(`Cartera total:      ${money(d.carteraTotal)}  (${d.carteraComprobantes} comprobantes)`);
  L.push(`Cobrado:            ${money(d.cobrado)}  (${d.cobradoCount} instalaciones)`);
  L.push(`Días prom. atraso:  ${d.diasPromAtraso}`);
  L.push(`Concentración top:  ${d.concentracionPct}%  (${d.topDeudorNombre})`);
  L.push(`\n--- Status pills ---`);
  for (const p of d.pills) L.push(`${p.tag.padEnd(14)} ${String(p.count).padStart(3)}  ${money(p.monto)}`);
  L.push(`\n--- Aging ---`);
  for (const b of d.aging) L.push(`${b.label.padEnd(14)} ${money(b.monto).padStart(12)}  ${b.pct}%`);
  L.push(`Aging total: ${money(d.agingTotal)}`);
  L.push(`\n--- Donut (peso por estado) ---`);
  for (const s of d.donut) L.push(`${s.label.padEnd(14)} ${s.count}  ${s.pct}%`);
  L.push(`Total casos: ${d.donutTotal}`);
  L.push(`\n--- Pagadas (medida DAX sobre detalle) ---`);
  L.push(`Instalaciones pagadas: ${d.pagadas.length}  |  total: ${money(d.pagadasTotal)}  ticket prom: ${money(d.pagadasTicketProm)}  mayor: ${money(d.pagadasMayor)} (${d.pagadasMayorCliente})`);
  for (const p of d.pagadas)
    L.push(`  ${p.comprobante}  ${p.cliente.padEnd(28)} ${money(p.montoTotal)}`);
  L.push(`\n--- Alertas reagendados (${d.alertasReag.length}) ---`);
  for (const a of d.alertasReag)
    L.push(`  [${a.nivel}] ${a.cliente} — ${diaMesAnio(a.fecha)}`);
  if (d.alerta)
    L.push(`\n--- Alerta ---\n${d.alerta.topDeudorNombre}: ${money(d.alerta.topDeudorMonto)} = ${d.alerta.pctCarteraVencida}% del vencido, ${d.alerta.diasAtraso} días desde ${diaMesAnio(d.alerta.fecha0)}`);
  L.push(`\n--- Conteos de tablas ---`);
  L.push(`Inst hoy: ${d.instHoy.length} | Inst semana: ${d.instSemana.length} | Reagendadas: ${d.reagendadas.length} | Vencidas: ${d.vencidas.length} | Atrasadas: ${d.atrasadas.length} | Pagadas: ${d.pagadas.length}`);
  // eslint-disable-next-line no-console
  console.log(L.join("\n"));
});
