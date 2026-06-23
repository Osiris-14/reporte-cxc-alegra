/**
 * kpis.ts — Agregados y medidas del dashboard, calculados sobre las filas ya
 * enriquecidas. Equivale a las medidas DAX de docs/MODELO_CXC.md. Todo recibe
 * `hoy` y se recalcula; nada se almacena.
 */
import {
  CxcRow,
  EstadoAgenda,
  UMBRAL_PAGADO,
  diffDias,
  estadoAgenda,
  estadoCuenta,
  estadoVencimiento,
  finSemana,
  inicioSemana,
  pendienteLIT,
  pillUrgencia,
  totalLIT,
  urgenciaReag,
} from "./cxc-logic";
import type { PagoRow } from "./data";
import { Alerta } from "./alertas";
import { diaMesAnio } from "./format";

/** Fila lista para render en tabla (ya formateada lo mínimo). */
export interface TableRow {
  comprobante: string;
  cliente: string;
  montoPendiente: number;
  montoTotal: number;
  fechaVencimiento: Date | null;
  fechaReagendamiento: Date | null;
  /** Clase de badge del reagendamiento por urgencia (rojo/naranja/amarillo/verde). */
  reagClass: string;
}

/** Fila del drilldown "Cobrado esta semana": una por comprobante distinto. */
export interface CobradoSemanaRow {
  comprobante: string;
  cliente: string;
  /** Fecha del pago que califica (la más reciente, si hubo varias en la semana). */
  fechaPago: Date | null;
  /** Monto cobrado = SUM(MontoPago) de los pagos que califican en la semana. */
  monto: number;
}

export interface StatusPill {
  tag: string;
  count: number;
  monto: number;
  colorClass: string;
  /** Pestaña a la que navega al hacer clic. */
  goTo: number;
}

export interface AgingBucket {
  label: string;
  monto: number;
  /** Porcentaje sobre el total del aging. */
  pct: number;
  /** Ancho de barra relativo al bucket mayor. */
  width: number;
  color: string;
}

export interface DonutSlice {
  label: string;
  count: number;
  pct: number;
  color: string;
}

/** Alerta individual de un reagendado crítico (Resumen). */
export interface AlertaReag {
  nivel: "vencido" | "hoy";
  cliente: string;
  fecha: Date;
}

export interface Dashboard {
  hoy: Date;
  // Metric cards (Resumen)
  carteraTotal: number;
  carteraComprobantes: number;
  cobrado: number;
  cobradoCount: number;
  /** "Cobrado esta semana": misma lógica que `cobrado` pero el criterio de
   *  fecha es la semana en curso (lunes a domingo) en vez de "hoy". */
  cobradoSemana: number;
  cobradoSemanaCount: number;
  cobradoSemanaRows: CobradoSemanaRow[];
  diasPromAtraso: number;
  concentracionPct: number;
  topDeudorNombre: string;
  // Status pills
  pills: StatusPill[];
  // Aging + donut + alerta
  aging: AgingBucket[];
  agingTotal: number;
  donut: DonutSlice[];
  donutTotal: number;
  alerta: {
    topDeudorNombre: string;
    topDeudorMonto: number;
    pctCarteraVencida: number;
    diasAtraso: number;
    fecha0: Date | null;
  } | null;
  /** Alertas individuales de reagendados críticos (vencidos / vencen hoy). */
  alertasReag: AlertaReag[];
  // Tablas
  instHoy: TableRow[];
  instSemana: TableRow[];
  reagendadas: TableRow[];
  vencidas: TableRow[];
  atrasadas: TableRow[];
  pagadas: TableRow[];
  // Pagadas — métricas
  pagadasTotal: number;
  pagadasTicketProm: number;
  pagadasMayor: number;
  pagadasMayorCliente: string;
}

const COLORS = {
  red: "#e05252",
  green: "#3aa76d",
  amber: "#e6a817",
  purple: "#7b68cc",
  dark: "#2b2b2b",
  blue: "#5bb8d4",
};

function toTableRow(r: CxcRow, hoy: Date): TableRow {
  return {
    comprobante: r.numeroComprobante,
    cliente: r.cliente || "—",
    montoPendiente: pendienteLIT(r),
    montoTotal: totalLIT(r),
    fechaVencimiento: r.fechaVencimiento,
    fechaReagendamiento: r.fechaReagendamiento,
    reagClass: pillUrgencia(urgenciaReag(r.fechaReagendamiento, hoy)),
  };
}

const sum = (rows: CxcRow[], f: (r: CxcRow) => number) =>
  rows.reduce((acc, r) => acc + f(r), 0);

export function computeDashboard(
  cxc: CxcRow[],
  pagos: PagoRow[],
  hoy: Date,
): Dashboard {
  // Clasificación una sola vez por fila.
  const withState = cxc.map((r) => ({
    row: r,
    ec: estadoCuenta(r.balancePendiente, r.fechaVencimiento, hoy),
    ev: estadoVencimiento(r.fechaVencimiento, hoy),
    ea: estadoAgenda(r, hoy),
  }));

  const byAgenda = (ea: EstadoAgenda) =>
    withState.filter((x) => x.ea === ea).map((x) => x.row);

  // Filtro crítico: solo facturas con FechaVencimiento >= 2026-02-01 (excluye
  // enero 2026 y todo lo anterior). Se aplica a los TRES conteos de Estado
  // Agenda (Vencidas, Reagendadas, Atrasadas) ANTES de clasificar.
  // NO altera la lógica de Estado Agenda.
  const desdeFebrero = new Date("2026-02-01");
  const desdeFeb = (r: CxcRow) =>
    r.fechaVencimiento != null &&
    r.fechaVencimiento.getTime() >= desdeFebrero.getTime();

  // --- Cartera total: todo lo que tiene balance > 450 (cuentas abiertas) ---
  const cartera = cxc.filter((r) => r.balancePendiente > UMBRAL_PAGADO);
  const carteraTotal = sum(cartera, pendienteLIT);
  const carteraComprobantes = cartera.length;

  // --- Tablas por estado ---
  const instHoyRows = withState
    .filter((x) => x.ev === "Hoy" && x.ec !== "Cerrado")
    .map((x) => x.row);
  const instSemanaRows = withState
    .filter((x) => x.ev === "Semana" && x.ec !== "Cerrado")
    .map((x) => x.row);
  // Los tres conteos de Estado Agenda se filtran desde febrero en adelante,
  // más sus reglas específicas:
  //  - Vencidas: excluye eventos ya instalados (etiqueta "Instalacion
  //    completada"). Sin match en calendario igual cuenta (etiqueta = null).
  //  - Reagendadas: solo si pendienteLIT (= balance * 1.06) > 300.
  //  - Atrasadas: estadoAgenda "Atrasado" ya implica venc<hoy, reag === null
  //    y estadoCuenta "Atraso".
  const vencidasRows = byAgenda("Vencidas")
    .filter(desdeFeb)
    .filter((r) => r.etiqueta !== "Instalacion completada");
  const reagendadasRows = byAgenda("Reagendado")
    .filter(desdeFeb)
    .filter((r) => pendienteLIT(r) > 300);
  const atrasadasRows = byAgenda("Atrasado").filter(desdeFeb);

  // --- Alertas de reagendados críticos (Resumen) ---
  // Reagendamientos reales (etiqueta "Cliente reagendado") aún sin pagar, cuya
  // fecha ya venció (rojo) o vence hoy (naranja). Una alerta por cliente.
  const alertaPorCliente = new Map<string, AlertaReag>();
  for (const r of cxc) {
    if (r.etiqueta !== "Cliente reagendado") continue;
    if (r.balancePendiente <= UMBRAL_PAGADO) continue;
    if (!desdeFeb(r)) continue;
    const u = urgenciaReag(r.fechaReagendamiento, hoy);
    if (u !== "vencido" && u !== "hoy") continue;
    const cliente = r.cliente || "—";
    const fecha = r.fechaReagendamiento as Date;
    const prev = alertaPorCliente.get(cliente);
    // Una por cliente: se queda con la más urgente (vencido > hoy; fecha más antigua).
    const masUrgente =
      !prev ||
      (prev.nivel === "hoy" && u === "vencido") ||
      (prev.nivel === u && fecha.getTime() < prev.fecha.getTime());
    if (masUrgente) alertaPorCliente.set(cliente, { nivel: u, cliente, fecha });
  }
  const alertasReag = [...alertaPorCliente.values()].sort((a, b) => {
    if (a.nivel !== b.nivel) return a.nivel === "vencido" ? -1 : 1;
    return a.fecha.getTime() - b.fecha.getTime();
  });

  // INS Instalaciones pagadas — medida DAX sobre la tabla `detalle` (cxc_Pagos),
  // con join a cxc por NumeroComprobante. Cuenta DISTINCT NumeroComprobante donde:
  //   FechaPago = hoy  &&  BalancePendiente(detalle) < 450  &&
  //   (cxc.FechaVencimiento = hoy  ||  cxc.FechaReagendamiento = hoy)
  const cxcMap = new Map<string, CxcRow>();
  for (const r of cxc) cxcMap.set(r.numeroComprobante, r);
  const mismaFecha = (a: Date | null, b: Date) =>
    a !== null && a.getTime() === b.getTime();

  // Agrupa los pagos que califican por comprobante (suma MontoPago, guarda cliente).
  const pagadasMap = new Map<string, { cliente: string; monto: number }>();
  for (const d of pagos) {
    const c = cxcMap.get(d.numeroComprobante);
    if (!c) continue;
    const califica =
      mismaFecha(d.fechaPago, hoy) &&
      d.balancePendiente < UMBRAL_PAGADO &&
      (mismaFecha(c.fechaVencimiento, hoy) ||
        mismaFecha(c.fechaReagendamiento, hoy));
    if (!califica) continue;
    const cur = pagadasMap.get(d.numeroComprobante) ?? {
      cliente: d.cliente || c.cliente || "—",
      monto: 0,
    };
    cur.monto += d.montoPago; // SUM(detalle[MontoPago])
    pagadasMap.set(d.numeroComprobante, cur);
  }
  // Filas de la tabla "Instalaciones pagadas": una por comprobante distinto.
  const pagadasRows: TableRow[] = [...pagadasMap.entries()]
    .map(([comprobante, v]) => ({
      comprobante,
      cliente: v.cliente,
      montoPendiente: 0,
      montoTotal: v.monto, // monto pagado (suma de MontoPago)
      fechaVencimiento: cxcMap.get(comprobante)?.fechaVencimiento ?? null,
      fechaReagendamiento: cxcMap.get(comprobante)?.fechaReagendamiento ?? null,
      reagClass: "p-amb",
    }))
    .sort((a, b) => b.montoTotal - a.montoTotal);

  // "Cobrado esta semana" — MISMA lógica que "Cobrado", pero el criterio de
  // fecha pasa de "hoy" a "la semana en curso" (lunes a domingo):
  //   FechaPago ∈ semana  &&  BalancePendiente(detalle) < 450  &&
  //   (cxc.FechaVencimiento ∈ semana  ||  cxc.FechaReagendamiento ∈ semana)
  const lunes = inicioSemana(hoy);
  const domingo = finSemana(hoy);
  const enSemana = (d: Date | null) =>
    d !== null && d.getTime() >= lunes.getTime() && d.getTime() <= domingo.getTime();

  const cobradoSemanaMap = new Map<
    string,
    { cliente: string; monto: number; fechaPago: Date | null }
  >();
  for (const d of pagos) {
    const c = cxcMap.get(d.numeroComprobante);
    if (!c) continue;
    const califica =
      enSemana(d.fechaPago) &&
      d.balancePendiente < UMBRAL_PAGADO &&
      (enSemana(c.fechaVencimiento) || enSemana(c.fechaReagendamiento));
    if (!califica) continue;
    const cur = cobradoSemanaMap.get(d.numeroComprobante) ?? {
      cliente: d.cliente || c.cliente || "—",
      monto: 0,
      fechaPago: null as Date | null,
    };
    cur.monto += d.montoPago; // SUM(detalle[MontoPago]) de la semana
    // Fecha de pago representativa: la más reciente que califica.
    if (
      d.fechaPago &&
      (cur.fechaPago === null || d.fechaPago.getTime() > cur.fechaPago.getTime())
    ) {
      cur.fechaPago = d.fechaPago;
    }
    cobradoSemanaMap.set(d.numeroComprobante, cur);
  }
  const cobradoSemanaRows: CobradoSemanaRow[] = [...cobradoSemanaMap.entries()]
    .map(([comprobante, v]) => ({
      comprobante,
      cliente: v.cliente,
      fechaPago: v.fechaPago,
      monto: v.monto,
    }))
    .sort((a, b) => b.monto - a.monto);
  const cobradoSemana = cobradoSemanaRows.reduce((a, r) => a + r.monto, 0);

  // --- Días promedio de atraso (cuentas en atraso, desde febrero) ---
  const enAtraso = withState.filter((x) => x.ec === "Atraso" && desdeFeb(x.row));
  const diasPromAtraso =
    enAtraso.length === 0
      ? 0
      : Math.round(
          enAtraso.reduce(
            (acc, x) =>
              acc + (x.row.fechaVencimiento ? diffDias(x.row.fechaVencimiento, hoy) : 0),
            0,
          ) / enAtraso.length,
        );

  // --- Concentración top deudor (sobre la cartera total) ---
  const porCliente = new Map<string, number>();
  for (const r of cartera) {
    const k = r.cliente || "—";
    porCliente.set(k, (porCliente.get(k) ?? 0) + pendienteLIT(r));
  }
  let topDeudorNombre = "—";
  let topDeudorMonto = 0;
  for (const [k, v] of porCliente) {
    if (v > topDeudorMonto) {
      topDeudorMonto = v;
      topDeudorNombre = k;
    }
  }
  const concentracionPct =
    carteraTotal > 0 ? Math.round((topDeudorMonto / carteraTotal) * 100) : 0;

  // --- Aging: buckets por días de atraso sobre cuentas en atraso ---
  const bucketDefs = [
    { label: "+90 días", min: 91, max: Infinity, color: COLORS.red },
    { label: "61 – 90 días", min: 61, max: 90, color: COLORS.amber },
    { label: "31 – 60 días", min: 31, max: 60, color: COLORS.amber },
    { label: "0 – 30 días", min: 0, max: 30, color: COLORS.green },
  ];
  const bucketMontos = bucketDefs.map((b) =>
    sum(
      enAtraso
        .map((x) => x.row)
        .filter((r) => {
          const d = r.fechaVencimiento ? diffDias(r.fechaVencimiento, hoy) : 0;
          return d >= b.min && d <= b.max;
        }),
      pendienteLIT,
    ),
  );
  const agingTotal = bucketMontos.reduce((a, b) => a + b, 0);
  const maxBucket = Math.max(1, ...bucketMontos);
  const aging: AgingBucket[] = bucketDefs.map((b, i) => ({
    label: b.label,
    monto: bucketMontos[i],
    pct: agingTotal > 0 ? Math.round((bucketMontos[i] / agingTotal) * 100) : 0,
    width: Math.round((bucketMontos[i] / maxBucket) * 100),
    color: b.color,
  }));

  // --- Donut: conteo por Estado Agenda ---
  const cVencidas = vencidasRows.length;
  const cReagendado = reagendadasRows.length;
  const cAtrasado = atrasadasRows.length;
  const donutTotal = cVencidas + cReagendado + cAtrasado;
  const donut: DonutSlice[] = [
    { label: "Atraso", count: cVencidas, color: COLORS.red, pct: 0 },
    { label: "Reagendado", count: cReagendado, color: COLORS.purple, pct: 0 },
    { label: "Sin reagendar", count: cAtrasado, color: COLORS.amber, pct: 0 },
  ].map((s) => ({
    ...s,
    pct: donutTotal > 0 ? Math.round((s.count / donutTotal) * 100) : 0,
  }));

  // --- Status pills ---
  const montoVencidas = sum(vencidasRows, pendienteLIT);
  const montoInstHoy = sum(instHoyRows, pendienteLIT);
  const montoInstSemana = sum(instSemanaRows, pendienteLIT);
  const montoReagendadas = sum(reagendadasRows, pendienteLIT);
  const montoAtrasadas = sum(atrasadasRows, pendienteLIT);
  // Monto pagado = SUM(detalle[MontoPago]) ya agregado por comprobante.
  const montoPagadas = pagadasRows.reduce((a, r) => a + r.montoTotal, 0);

  const pills: StatusPill[] = [
    { tag: "Vencidas", count: vencidasRows.length, monto: montoVencidas, colorClass: "c-red2", goTo: 2 },
    { tag: "Inst. hoy", count: instHoyRows.length, monto: montoInstHoy, colorClass: "c-grn2", goTo: 1 },
    { tag: "Inst. semana", count: instSemanaRows.length, monto: montoInstSemana, colorClass: "c-ylw2", goTo: 1 },
    { tag: "Reagendadas", count: reagendadasRows.length, monto: montoReagendadas, colorClass: "c-pur2", goTo: 1 },
    { tag: "Atrasadas", count: atrasadasRows.length, monto: montoAtrasadas, colorClass: "c-drk2", goTo: 2 },
    { tag: "Pagadas", count: pagadasRows.length, monto: montoPagadas, colorClass: "c-blu2", goTo: 3 },
  ];

  // --- Alerta de riesgo de concentración (mayor deudor del aging vencido) ---
  // Reagrupa la cartera vencida (en atraso) por cliente.
  const porClienteVencido = new Map<string, { monto: number; row: CxcRow }>();
  for (const x of enAtraso) {
    const k = x.row.cliente || "—";
    const cur = porClienteVencido.get(k);
    const monto = (cur?.monto ?? 0) + pendienteLIT(x.row);
    // guarda la fila con mayor monto individual para fecha 0
    const row = cur && cur.monto >= pendienteLIT(x.row) ? cur.row : x.row;
    porClienteVencido.set(k, { monto, row });
  }
  let alerta: Dashboard["alerta"] = null;
  if (porClienteVencido.size > 0 && agingTotal > 0) {
    let topNombre = "—";
    let top = { monto: 0, row: null as CxcRow | null };
    for (const [k, v] of porClienteVencido) {
      if (v.monto > top.monto) {
        top = v;
        topNombre = k;
      }
    }
    const fecha0 = top.row?.fechaVencimiento ?? null;
    alerta = {
      topDeudorNombre: topNombre,
      topDeudorMonto: top.monto,
      pctCarteraVencida: Math.round((top.monto / agingTotal) * 100),
      diasAtraso: fecha0 ? diffDias(fecha0, hoy) : 0,
      fecha0,
    };
  }

  // --- Pagadas: métricas (sobre el monto pagado por comprobante) ---
  const pagadasTotal = montoPagadas;
  const pagadasTicketProm =
    pagadasRows.length > 0 ? pagadasTotal / pagadasRows.length : 0;
  let pagadasMayor = 0;
  let pagadasMayorCliente = "—";
  for (const r of pagadasRows) {
    if (r.montoTotal > pagadasMayor) {
      pagadasMayor = r.montoTotal;
      pagadasMayorCliente = r.cliente || "—";
    }
  }

  // --- Ordenamientos para tablas (mayor monto primero) ---
  const byMonto = (a: TableRow, b: TableRow) => b.montoPendiente - a.montoPendiente;
  const byReag = (a: TableRow, b: TableRow) =>
    (a.fechaReagendamiento?.getTime() ?? 0) -
    (b.fechaReagendamiento?.getTime() ?? 0);

  return {
    hoy,
    carteraTotal,
    carteraComprobantes,
    cobrado: pagadasTotal,
    cobradoCount: pagadasRows.length,
    cobradoSemana,
    cobradoSemanaCount: cobradoSemanaRows.length,
    cobradoSemanaRows,
    diasPromAtraso,
    concentracionPct,
    topDeudorNombre,
    pills,
    aging,
    agingTotal,
    donut,
    donutTotal,
    alerta,
    alertasReag,
    instHoy: instHoyRows.map((r) => toTableRow(r, hoy)).sort(byMonto),
    instSemana: instSemanaRows.map((r) => toTableRow(r, hoy)).sort(byMonto),
    reagendadas: reagendadasRows.map((r) => toTableRow(r, hoy)).sort(byReag),
    vencidas: vencidasRows.map((r) => toTableRow(r, hoy)).sort(byMonto),
    atrasadas: atrasadasRows.map((r) => toTableRow(r, hoy)).sort(byMonto),
    pagadas: pagadasRows, // ya son TableRow[] ordenadas por monto pagado
    pagadasTotal,
    pagadasTicketProm,
    pagadasMayor,
    pagadasMayorCliente,
  };
}
