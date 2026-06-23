/**
 * factory.ts — Lógica de la página Factory (seguimiento de aperturas/producción).
 * Fuente: cxc_Cuentasporcobrar (data.cxc, año en curso) + cxc_Pagos (data.pagos).
 * Todo se calcula contra `hoy` (hoyRD), nada se almacena.
 *
 * Definiciones clave (por factura, match detalle.NumeroComprobante = cxc.NumeroComprobante):
 *  - Pago inicial      = pagos con FechaPago = FechaFactura (día de apertura).
 *  - Pagos posteriores = pagos con FechaPago > FechaFactura.
 *  - fechaApertura     = primer FechaPago de la factura (fallback FechaCreación
 *                        si no tiene pagos). Define la semana/mes de apertura.
 *  - pendienteInicial  = MontoTotal − pagoInicial.
 *  - Apertura activa   = pendienteInicial > 300.
 *  - pagóCompleto      = BalancePendiente (CSV) <= 300. Lo confirma Alegra, que
 *                        ya descuenta notas de crédito (no depende de los pagos).
 *  - heRecibido        = SUM(MontoPago posteriores) * 1.06 (todos, aunque no
 *                        cubran el total).
 *  - Monto esperado    = pendienteInicial (= "Entregué" por factura).
 *  - Entregué          = SUM(pendienteInicial).
 *  - Monto pend.       = BalancePendiente (campo del CSV cxc), NO MontoTotal.
 *  - Pendiente         = SUM(BalancePendiente).
 *
 * Exclusión VOID: se descartan de toda la lógica las facturas con Estado=void
 * en cxc_Cuentasporcobrar o EstadoFactura=void en cxc_Pagos.
 */
import { CxcRow, inicioSemana } from "./cxc-logic";
import type { PagoRow, FactoringMovRow } from "./data";
import { rangoSemana } from "./format";

const DAY = 86_400_000;
const UMBRAL_APERTURA = 300;
const ITBIS = 1.06;

// --- Fondo Carryon -------------------------------------------------------
/** Capital neto: única constante fija del fondo (editable aquí). */
export const CAPITAL_NETO = 1_000_000;
/** Factor de interés (6%) incluido en el monto bruto de cada Entrada. */
const FACTOR_INTERES = 1.06;
/** Solo cuentan las Entradas desde el 2026-02-01 (inclusive). */
const APORTE_DESDE = Date.UTC(2026, 1, 1);
/** Salidas con esta CuentaContable se excluyen del drilldown de Deuda: es el
 *  desembolso inicial del préstamo que originó el fondo, no una salida del fondo. */
const CUENTA_PRESTAMO_INICIAL = "Préstamos por pagar";
/** Entradas duplicadas/no reales: se excluyen del Capital Bruto por coincidencia
 *  EXACTA de fecha (UTC) + valor (ni suman aporte ni aparecen en el drilldown). */
const ENTRADAS_EXCLUIDAS: { fecha: number; valor: number }[] = [
  { fecha: Date.UTC(2026, 2, 30), valor: 590_000 },
  { fecha: Date.UTC(2026, 2, 30), valor: 398_086 },
];
const esEntradaExcluida = (fecha: Date, valor: number): boolean =>
  ENTRADAS_EXCLUIDAS.some(
    (e) => e.fecha === fecha.getTime() && e.valor === valor,
  );

/** Transacción "Entrada" que aporta al Capital Bruto (drilldown). */
export interface CapitalBrutoTx {
  fecha: Date | null;
  tercero: string;
  valor: number; // monto recibido (bruto, incluye el 6%)
  aporte: number; // = valor − valor/1.06
}

/** Transacción "Salida" del fondo (drilldown de Deuda). */
export interface DeudaTx {
  fecha: Date | null;
  tercero: string;
  cuentaContable: string;
  valor: number; // magnitud de la salida (positivo)
}

export interface FondoCarryon {
  capitalNeto: number;
  capitalBruto: number;
  deuda: number;
  disponible: number;
  /** Entradas desde 2026-02-01 que componen el Capital Bruto (fecha desc). */
  capitalBrutoTx: CapitalBrutoTx[];
  /** Salidas desde 2026-02-01 (fecha desc). */
  deudaTx: DeudaTx[];
}

/**
 * Calcula el Fondo Carryon a partir de los movimientos de Factoring Banco y su
 * saldo. El capital bruto se acumula transacción por transacción: el Valor de
 * cada Entrada ya viene como monto BRUTO (incluye el 6%), así que el aporte real
 * se extrae del bruto -> aporte = Valor - (Valor / 1.06). Nuevas filas del CSV
 * aportan su parte individual sin reescribir la fórmula.
 */
export function computeFondo(
  movs: FactoringMovRow[],
  saldo: number,
): FondoCarryon {
  let capitalBruto = CAPITAL_NETO;
  const capitalBrutoTx: CapitalBrutoTx[] = [];
  const deudaTx: DeudaTx[] = [];
  for (const m of movs) {
    if (!m.fecha || m.fecha.getTime() < APORTE_DESDE) continue;
    if (m.tipo === "Entrada") {
      if (esEntradaExcluida(m.fecha, m.valor)) continue; // duplicada/no real
      // El Valor es bruto (incluye el 6%): el aporte real se saca del bruto.
      const aporte = m.valor - m.valor / FACTOR_INTERES;
      capitalBruto += aporte;
      capitalBrutoTx.push({
        fecha: m.fecha,
        tercero: m.tercero,
        valor: m.valor,
        aporte,
      });
    } else if (m.tipo === "Salida") {
      if (m.cuentaContable === CUENTA_PRESTAMO_INICIAL) continue; // préstamo inicial
      deudaTx.push({
        fecha: m.fecha,
        tercero: m.tercero,
        cuentaContable: m.cuentaContable,
        valor: Math.abs(m.valor), // en el CSV las salidas vienen negativas
      });
    }
  }
  const ts = (x: { fecha: Date | null }) => x.fecha?.getTime() ?? 0;
  // Capital Bruto: más reciente primero. Deuda: cronológico ascendente (más
  // antigua primero), arrancando justo tras el préstamo inicial ya excluido,
  // para poder marcar los "ciclos" de $1,000,000 con la suma corriente.
  capitalBrutoTx.sort((a, b) => ts(b) - ts(a));
  deudaTx.sort((a, b) => ts(a) - ts(b));

  const deuda = Math.abs(saldo);
  return {
    capitalNeto: CAPITAL_NETO,
    capitalBruto,
    deuda,
    disponible: CAPITAL_NETO - deuda,
    capitalBrutoTx,
    deudaTx,
  };
}

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
  montoApertura: number; // "Monto esperado" = pendienteInicial
  heRecibido: number;
  pendiente: number; // BalancePendiente del CSV
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
  fondo: FondoCarryon;
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
  /** Fecha de apertura = primer FechaPago de la factura (fallback FechaCreación
   *  si no tiene pagos). Es la fecha con la que se agrupa por semana/mes. */
  fechaApertura: Date | null;
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

// "Han pagado": verde solo al 100%, rojo en cualquier % menor. Sin amarillo.
const badgePct = (pct: number): Badge => (pct >= 100 ? "g" : "r");

/** Calcula apertura/pagos para una factura usando sus pagos (FechaFactura = Fecha). */
export function calcFactura(row: CxcRow, pagos: PagoRow[]): FCalc {
  const fechaFactura = row.fecha;
  let pagoInicial = 0;
  let posterior = 0;
  let pagoAntesDeCrear = false; // pago con FechaPago < FechaCreación = error de captura
  let primerPago: Date | null = null; // FechaPago más temprana de la factura
  for (const p of pagos) {
    if (!p.fechaPago || !fechaFactura) continue;
    if (primerPago === null || p.fechaPago.getTime() < primerPago.getTime())
      primerPago = p.fechaPago;
    if (p.fechaPago.getTime() < fechaFactura.getTime()) pagoAntesDeCrear = true;
    else if (p.fechaPago.getTime() === fechaFactura.getTime()) pagoInicial += p.montoPago;
    else posterior += p.montoPago; // FechaPago > FechaCreación
  }
  // Apertura = primer pago (cuando existe); si no hay pagos, FechaCreación.
  const fechaApertura = primerPago ?? fechaFactura;
  // Excepción por error de captura: un pago NO puede ocurrir antes de que la
  // factura exista. Cuando se detecta, la lógica de "pago inicial" no es
  // confiable (el monto del pago no se resta como inicial), así que el Monto
  // Esperado se toma del BalancePendiente del CSV, que Alegra ya calculó bien.
  // En el caso normal se mantiene MontoTotal − pagoInicial.
  const pendienteInicial = pagoAntesDeCrear
    ? row.balancePendiente
    : row.montoTotal - pagoInicial;
  // ¿Pagó completo? Se decide por BalancePendiente del CSV (Alegra ya descuenta
  // notas de crédito), NO por la suma de pagos en efectivo:
  //  - CASO 1: BalancePendiente <= 300 -> pagó completo (la diferencia que no
  //    cubrieron los pagos la cubrió una nota de crédito).
  //  - CASO 2: BalancePendiente > 300  -> aún pendiente.
  // He recibido = TODOS los pagos posteriores (FechaPago > FechaCreación) * 1.06,
  // aunque no cubran el total, en ambos casos.
  return {
    row,
    fechaApertura,
    pendienteInicial,
    heRecibido: posterior * ITBIS,
    pagoCompleto: row.balancePendiente <= UMBRAL_APERTURA,
    activa: pendienteInicial > UMBRAL_APERTURA,
  };
}

export function computeFactory(
  cxc: CxcRow[],
  pagos: PagoRow[],
  hoy: Date,
  factoringMovs: FactoringMovRow[] = [],
  factoringSaldo = 0,
): FactoryData {
  const anio = hoy.getUTCFullYear();
  const lunes = inicioSemana(hoy);
  const semanaActualStart = lunes.getTime();

  // Pagos del año en curso por comprobante (los NCF se reciclan cada año).
  // De paso se recolectan los comprobantes marcados VOID en cxc_Pagos.
  const pagosByComp = new Map<string, PagoRow[]>();
  const voidComprobantes = new Set<string>();
  for (const p of pagos) {
    if (!p.fechaPago || p.fechaPago.getUTCFullYear() !== anio) continue;
    if (p.estadoFactura.toLowerCase() === "void") {
      voidComprobantes.add(p.numeroComprobante);
    }
    const arr = pagosByComp.get(p.numeroComprobante) ?? [];
    arr.push(p);
    pagosByComp.set(p.numeroComprobante, arr);
  }

  // Excluir facturas VOID de TODA la lógica de Factory: Estado=void en
  // cxc_Cuentasporcobrar o EstadoFactura=void en cxc_Pagos (cualquiera basta).
  const cxcVigente = cxc.filter(
    (r) =>
      r.estado.toLowerCase() !== "void" &&
      !voidComprobantes.has(r.numeroComprobante),
  );

  // Cálculo por factura (solo año en curso ya viene filtrado en data.cxc).
  const calc: FCalc[] = cxcVigente.map((r) =>
    calcFactura(r, pagosByComp.get(r.numeroComprobante) ?? []),
  );
  const activas = calc.filter((c) => c.activa);

  // "Monto esperado" / "Entregué" = pendienteInicial (MontoTotal − pago inicial).
  // NO usar BalancePendiente: ese ya descuenta los pagos posteriores y queda en 0
  // cuando el cliente terminó de pagar, perdiendo el monto que se entregó.
  const sumPend = (cs: FCalc[]) => cs.reduce((a, c) => a + c.pendienteInicial, 0);
  const sumRecibido = (cs: FCalc[]) => cs.reduce((a, c) => a + c.heRecibido, 0);
  const countPagaron = (cs: FCalc[]) => cs.filter((c) => c.pagoCompleto).length;
  // "Monto pend." (tablas de aperturas) y "Pendiente" = BalancePendiente del CSV.
  const balancePend = (c: FCalc) => c.row.balancePendiente;
  const sumBalance = (cs: FCalc[]) =>
    cs.reduce((a, c) => a + balancePend(c), 0);

  const toRow = (c: FCalc): FactoryRow => ({
    comprobante: c.row.numeroComprobante,
    cliente: c.row.cliente || "—",
    montoPendiente: balancePend(c),
    fecha: c.fechaApertura,
  });

  // --- Cards + tablas (aperturas activas) ---
  // "Apertura" se agrupa por fechaApertura (primer pago), no por FechaCreación.
  const aperturasHoy = activas.filter((c) => sameDay(c.fechaApertura, hoy));
  const aperturasSemana = activas.filter((c) =>
    inRange(c.fechaApertura, lunes, hoy),
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
        c.fechaApertura != null &&
        c.fechaApertura.getUTCFullYear() === anio &&
        c.fechaApertura.getUTCMonth() === m,
    );

    const semanas: WeekRow[] = semanasDelMes(anio, m).map((wk, i) => {
      const cs = mesCalc.filter((c) => inRange(c.fechaApertura, wk.start, wk.end));
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
      const pendiente = sumBalance(cs);
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
            pendiente: balancePend(c),
            pago: c.pagoCompleto,
            vence: c.row.fechaVencimiento,
          }))
          .sort((a, b) => b.montoApertura - a.montoApertura),
      };
    });

    const entregueMes = sumPend(mesCalc);
    const recibidoMes = sumRecibido(mesCalc);
    const pendienteMes = sumBalance(mesCalc);
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
    fondo: computeFondo(factoringMovs, factoringSaldo),
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
