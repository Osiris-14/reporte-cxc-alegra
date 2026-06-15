/**
 * factory.ts — Lógica de la página Factory (seguimiento de aperturas/producción).
 * Fuente: cxc_Cuentasporcobrar (data.cxc, año en curso) + cxc_Pagos (data.pagos).
 * Todo se calcula contra `hoy` (hoyRD), nada se almacena.
 *
 * Definiciones clave (por factura, match detalle.NumeroComprobante = cxc.NumeroComprobante):
 *  - Pago inicial      = pagos con FechaPago = FechaFactura (día de apertura).
 *  - Pagos posteriores = pagos con FechaPago > FechaFactura.
 *  - pendienteInicial  = MontoTotal − pagoInicial.
 *  - Apertura activa   = pendienteInicial > 300.
 *  - pagóCompleto      = SUM(todos los MontoPago) * 1.06 >= MontoTotal.
 *  - heRecibido        = SUM(MontoPago posteriores) * 1.06.
 *  - Entregué          = SUM(pendienteInicial).
 *  - Pendiente         = Entregué − He recibido.
 */
import { CxcRow, inicioSemana } from "./cxc-logic";
import type { PagoRow } from "./data";
import { rangoSemana } from "./format";

const DAY = 86_400_000;
const UMBRAL_APERTURA = 300;
const ITBIS = 1.06;

export interface FactoryRow {
  comprobante: string;
  cliente: string;
  montoPendiente: number; // pendienteInicial
  fecha: Date | null;
}

export type Badge = "g" | "y" | "r" | "gray";

/** Factura individual para el drilldown de una semana. */
export interface WeekFactura {
  comprobante: string;
  cliente: string;
  montoApertura: number; // pendienteInicial
  heRecibido: number;
  pendiente: number; // montoApertura − heRecibido
  pago: boolean; // pagóCompleto
  vence: Date | null;
}

export interface WeekRow {
  label: string;
  rango: string;
  vacia: boolean;
  entraron: number;
  hanPagado: number;
  hanPagadoPct: number;
  hanPagadoBadge: Badge;
  entregue: number;
  recibido: number;
  pendiente: number;
  pendienteBadge: Badge;
  vencenRango: string;
  vencenBadge: Badge;
  facturas: WeekFactura[];
}

export interface MesTotal {
  entraron: number;
  hanPagado: number;
  hanPagadoPct: number;
  hanPagadoBadge: Badge;
  entregue: number;
  recibido: number;
  pendiente: number;
  pendienteBadge: Badge;
}

export interface MesData {
  mes: number;
  semanas: WeekRow[];
  total: MesTotal;
}

export interface FactoryData {
  hoy: Date;
  aperturasHoyCount: number;
  aperturasHoyMonto: number;
  aperturasSemanaCount: number;
  aperturasSemanaMonto: number;
  totalEntregarSabado: number;
  tablaHoy: FactoryRow[];
  tablaSemana: FactoryRow[];
  meses: MesData[];
  mesActual: number;
}

/** Cálculo por factura: apertura, pagos posteriores y si pagó completo. */
interface FCalc {
  row: CxcRow;
  pendienteInicial: number;
  heRecibido: number;
  pagoCompleto: boolean;
  activa: boolean;
}

const sameDay = (a: Date | null, b: Date) =>
  a !== null && a.getTime() === b.getTime();

const inRange = (d: Date | null, a: Date, b: Date) =>
  d !== null && d.getTime() >= a.getTime() && d.getTime() <= b.getTime();

function semanasDelMes(anio: number, mes: number): { start: Date; end: Date }[] {
  const primero = new Date(Date.UTC(anio, mes, 1));
  const ultimo = new Date(Date.UTC(anio, mes + 1, 0));
  const weeks: { start: Date; end: Date }[] = [];
  let ws = inicioSemana(primero);
  while (ws.getTime() <= ultimo.getTime()) {
    weeks.push({ start: ws, end: new Date(ws.getTime() + 6 * DAY) });
    ws = new Date(ws.getTime() + 7 * DAY);
  }
  return weeks;
}

const badgePct = (pct: number): Badge => (pct > 70 ? "g" : pct >= 30 ? "y" : "r");

/** Calcula apertura/pagos para una factura usando sus pagos (FechaFactura = Fecha). */
export function calcFactura(row: CxcRow, pagos: PagoRow[]): FCalc {
  const fechaFactura = row.fecha;
  let pagoInicial = 0;
  let posterior = 0;
  let totalPagado = 0;
  for (const p of pagos) {
    totalPagado += p.montoPago;
    if (!p.fechaPago || !fechaFactura) continue;
    if (p.fechaPago.getTime() === fechaFactura.getTime()) pagoInicial += p.montoPago;
    else if (p.fechaPago.getTime() > fechaFactura.getTime()) posterior += p.montoPago;
  }
  const pendienteInicial = row.montoTotal - pagoInicial;
  // Pagó completo = misma lógica de "Cerrado" en CXC pero con ITBIS:
  // SUM(pagos)*1.06 >= MontoTotal  ó  MontoTotal − SUM(pagos)*1.06 <= 300.
  const pagadoConItbis = totalPagado * ITBIS;
  return {
    row,
    pendienteInicial,
    heRecibido: posterior * ITBIS,
    pagoCompleto: row.montoTotal - pagadoConItbis <= UMBRAL_APERTURA,
    activa: pendienteInicial > UMBRAL_APERTURA,
  };
}

export function computeFactory(
  cxc: CxcRow[],
  pagos: PagoRow[],
  hoy: Date,
): FactoryData {
  const anio = hoy.getUTCFullYear();
  const lunes = inicioSemana(hoy);
  const semanaActualStart = lunes.getTime();

  // Pagos del año en curso por comprobante (los NCF se reciclan cada año).
  const pagosByComp = new Map<string, PagoRow[]>();
  for (const p of pagos) {
    if (!p.fechaPago || p.fechaPago.getUTCFullYear() !== anio) continue;
    const arr = pagosByComp.get(p.numeroComprobante) ?? [];
    arr.push(p);
    pagosByComp.set(p.numeroComprobante, arr);
  }

  // Cálculo por factura (solo año en curso ya viene filtrado en data.cxc).
  const calc: FCalc[] = cxc.map((r) =>
    calcFactura(r, pagosByComp.get(r.numeroComprobante) ?? []),
  );
  const activas = calc.filter((c) => c.activa);

  const sumPend = (cs: FCalc[]) => cs.reduce((a, c) => a + c.pendienteInicial, 0);
  const sumRecibido = (cs: FCalc[]) => cs.reduce((a, c) => a + c.heRecibido, 0);
  const countPagaron = (cs: FCalc[]) => cs.filter((c) => c.pagoCompleto).length;
  // Pendiente por factura: 0 si pagó completo; nunca negativo.
  const pendienteFactura = (c: FCalc) =>
    c.pagoCompleto ? 0 : Math.max(0, c.pendienteInicial - c.heRecibido);
  const sumPendiente = (cs: FCalc[]) =>
    cs.reduce((a, c) => a + pendienteFactura(c), 0);

  const toRow = (c: FCalc): FactoryRow => ({
    comprobante: c.row.numeroComprobante,
    cliente: c.row.cliente || "—",
    montoPendiente: c.pendienteInicial,
    fecha: c.row.fecha,
  });

  // --- Cards + tablas (aperturas activas) ---
  const aperturasHoy = activas.filter((c) => sameDay(c.row.fecha, hoy));
  const aperturasSemana = activas.filter((c) =>
    inRange(c.row.fecha, lunes, hoy),
  );
  const aperturasSemanaMonto = sumPend(aperturasSemana);

  const tablaHoy = aperturasHoy
    .map(toRow)
    .sort((a, b) => b.montoPendiente - a.montoPendiente);
  const tablaSemana = aperturasSemana
    .map(toRow)
    .sort((a, b) => b.montoPendiente - a.montoPendiente);

  // "Se vencen en": semana de FechaVencimiento más frecuente.
  const vencenSemana = (cs: FCalc[]): { rango: string; badge: Badge } => {
    const tally = new Map<number, number>();
    for (const c of cs) {
      if (!c.row.fechaVencimiento) continue;
      const ws = inicioSemana(c.row.fechaVencimiento).getTime();
      tally.set(ws, (tally.get(ws) ?? 0) + 1);
    }
    if (tally.size === 0) return { rango: "--", badge: "gray" };
    let topWs = 0;
    let topN = -1;
    for (const [ws, n] of tally) {
      if (n > topN || (n === topN && ws < topWs)) {
        topN = n;
        topWs = ws;
      }
    }
    const badge: Badge =
      topWs > semanaActualStart ? "gray" : topWs === semanaActualStart ? "y" : "r";
    return { rango: rangoSemana(new Date(topWs), new Date(topWs + 6 * DAY)), badge };
  };

  // --- Seguimiento mensual por semana ---
  const meses: MesData[] = [];
  for (let m = 0; m < 12; m++) {
    const mesCalc = activas.filter(
      (c) =>
        c.row.fecha != null &&
        c.row.fecha.getUTCFullYear() === anio &&
        c.row.fecha.getUTCMonth() === m,
    );

    const semanas: WeekRow[] = semanasDelMes(anio, m).map((wk, i) => {
      const cs = mesCalc.filter((c) => inRange(c.row.fecha, wk.start, wk.end));
      const base = { label: `Sem ${i + 1}`, rango: rangoSemana(wk.start, wk.end) };
      if (cs.length === 0) {
        return {
          ...base,
          vacia: true,
          entraron: 0,
          hanPagado: 0,
          hanPagadoPct: 0,
          hanPagadoBadge: "gray" as Badge,
          entregue: 0,
          recibido: 0,
          pendiente: 0,
          pendienteBadge: "g" as Badge,
          vencenRango: "--",
          vencenBadge: "gray" as Badge,
          facturas: [],
        };
      }
      const entregue = sumPend(cs);
      const recibido = sumRecibido(cs);
      const pendiente = sumPendiente(cs);
      const hanPagado = countPagaron(cs);
      const hanPagadoPct = Math.round((hanPagado / cs.length) * 100);
      const v = vencenSemana(cs);
      return {
        ...base,
        vacia: false,
        entraron: cs.length,
        hanPagado,
        hanPagadoPct,
        hanPagadoBadge: badgePct(hanPagadoPct),
        entregue,
        recibido,
        pendiente,
        pendienteBadge: (Math.round(pendiente) > 0 ? "r" : "g") as Badge,
        vencenRango: v.rango,
        vencenBadge: v.badge,
        facturas: cs
          .map((c) => ({
            comprobante: c.row.numeroComprobante,
            cliente: c.row.cliente || "—",
            montoApertura: c.pendienteInicial,
            heRecibido: c.heRecibido,
            pendiente: pendienteFactura(c),
            pago: c.pagoCompleto,
            vence: c.row.fechaVencimiento,
          }))
          .sort((a, b) => b.montoApertura - a.montoApertura),
      };
    });

    const entregueMes = sumPend(mesCalc);
    const recibidoMes = sumRecibido(mesCalc);
    const pendienteMes = sumPendiente(mesCalc);
    const hanPagadoMes = countPagaron(mesCalc);
    const hanPagadoMesPct =
      mesCalc.length > 0 ? Math.round((hanPagadoMes / mesCalc.length) * 100) : 0;
    meses.push({
      mes: m,
      semanas,
      total: {
        entraron: mesCalc.length,
        hanPagado: hanPagadoMes,
        hanPagadoPct: hanPagadoMesPct,
        hanPagadoBadge: badgePct(hanPagadoMesPct),
        entregue: entregueMes,
        recibido: recibidoMes,
        pendiente: pendienteMes,
        pendienteBadge: Math.round(pendienteMes) > 0 ? "r" : "g",
      },
    });
  }

  return {
    hoy,
    aperturasHoyCount: aperturasHoy.length,
    aperturasHoyMonto: sumPend(aperturasHoy),
    aperturasSemanaCount: aperturasSemana.length,
    aperturasSemanaMonto,
    totalEntregarSabado: aperturasSemanaMonto,
    tablaHoy,
    tablaSemana,
    meses,
    mesActual: hoy.getUTCMonth(),
  };
}
