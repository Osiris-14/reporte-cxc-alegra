/**
 * cxc-logic.ts — Lógica de negocio pura portada del modelo DAX de Power BI
 * (ver docs/MODELO_CXC.md). Cada función recibe la fila y "hoy" y NO almacena
 * estado: los estados se recalculan contra hoy en cada carga, igual que en el
 * Power BI. Nada aquí toca el filesystem ni la red.
 */

/** Fila base de cxc_Cuentasporcobrar ya parseada y enriquecida con el cruce. */
export interface CxcRow {
  numeroComprobante: string;
  fecha: Date | null;
  fechaVencimiento: Date | null;
  cliente: string;
  montoTotal: number;
  balancePendiente: number;
  estado: string;
  // Enriquecido por el cruce contra el calendario (idCruce -> p):
  idCruce: number | null;
  etiqueta: string | null; // Calendario[etiqueta] vía SELECTEDVALUE
  fechaReagendamiento: Date | null; // Calendario[inicio] vía SELECTEDVALUE
  titulo: string | null; // Calendario[titulo] vía SELECTEDVALUE (para Talonario/Vehículo)
  observaciones: string; // Nota impresa de la factura (para extraer Talonario)
}

export type EstadoCuenta = "Cerrado" | "Atraso" | "Open";
export type EstadoVencimiento = "Hoy" | "Semana" | "Vencido" | "Otros";
export type EstadoAgenda = "Reagendado" | "Vencidas" | "Atrasado" | null;

/** Umbral en RD$ bajo el cual una cuenta se considera pagada/cerrada. */
export const UMBRAL_PAGADO = 450;
/** Factor ITBIS 6% aplicado a todos los montos visibles. */
export const ITBIS = 1.06;

/**
 * Fecha de "hoy" en zona horaria de República Dominicana (America/Santo_Domingo,
 * UTC-4), normalizada a medianoche. Replica DAX `NOW() - TIME(4,0,0)`.
 */
export function hoyRD(now: Date = new Date()): Date {
  // Obtiene los componentes de fecha tal como se ven en RD.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);
  const d = Number(parts.find((p) => p.type === "day")!.value);
  // Fecha "naive" a medianoche en UTC para comparar día contra día sin TZ.
  return new Date(Date.UTC(y, m - 1, d));
}

/** Parsea "YYYY-MM-DD" (o ISO) a una fecha naive a medianoche UTC. */
export function parseFecha(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) {
    const d = new Date(s);
    return isNaN(d.getTime())
      ? null
      : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Días enteros entre dos fechas naive (b - a). */
export function diffDias(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** ID cruce = últimos 4 dígitos del comprobante (DAX VALUE(RIGHT(...,4))). */
export function idCruce(numeroComprobante: string): number | null {
  if (!numeroComprobante) return null;
  const last4 = numeroComprobante.slice(-4);
  const n = parseInt(last4, 10);
  return Number.isNaN(n) ? null : n;
}

/** pendiente LIT = BalancePendiente * 1.06 */
export function pendienteLIT(row: Pick<CxcRow, "balancePendiente">): number {
  return row.balancePendiente * ITBIS;
}

/** total LIT = MontoTotal * 1.06 */
export function totalLIT(row: Pick<CxcRow, "montoTotal">): number {
  return row.montoTotal * ITBIS;
}

/**
 * Estado Cuenta — clasificación de cobro (umbral de $450 = "Cerrado/pagado").
 * SWITCH del DAX.
 */
export function estadoCuenta(
  balance: number,
  fechaVenc: Date | null,
  hoy: Date,
): EstadoCuenta {
  if (balance <= UMBRAL_PAGADO) return "Cerrado";
  if (fechaVenc && fechaVenc.getTime() < hoy.getTime()) return "Atraso";
  return "Open";
}

/** Lunes (WEEKDAY tipo 2) de la semana de `hoy`, a medianoche. */
export function inicioSemana(hoy: Date): Date {
  // getUTCDay(): 0=domingo..6=sábado. WEEKDAY(,2): lunes=1..domingo=7.
  const dow = hoy.getUTCDay();
  const weekday2 = dow === 0 ? 7 : dow;
  return new Date(hoy.getTime() - (weekday2 - 1) * 86_400_000);
}

/** Domingo de la semana de `hoy`. */
export function finSemana(hoy: Date): Date {
  return new Date(inicioSemana(hoy).getTime() + 6 * 86_400_000);
}

/**
 * Estado Vencimiento — ubica la factura en el tiempo (semana lun–dom).
 */
export function estadoVencimiento(
  fechaVenc: Date | null,
  hoy: Date,
): EstadoVencimiento {
  if (!fechaVenc) return "Otros";
  const fin = finSemana(hoy);
  const t = fechaVenc.getTime();
  if (t === hoy.getTime()) return "Hoy";
  if (t > hoy.getTime() && t <= fin.getTime()) return "Semana";
  if (t < hoy.getTime()) return "Vencido";
  return "Otros";
}

/**
 * Estado Agenda — clasificador maestro del dashboard.
 * Reagendado / Vencidas / Atrasado / null (BLANK).
 */
export function estadoAgenda(row: CxcRow, hoy: Date): EstadoAgenda {
  const venc = row.fechaVencimiento;
  const reag = row.fechaReagendamiento;
  if (!venc) return null;
  const vt = venc.getTime();
  const ht = hoy.getTime();
  const ec = estadoCuenta(row.balancePendiente, venc, hoy);

  // REAGENDADO: vencida con reagendamiento futuro, o vence hoy y reagendada hoy.
  const reagFuturo = reag !== null && reag.getTime() >= ht;
  const reagHoy = reag !== null && reag.getTime() === ht;
  if ((vt < ht && reagFuturo) || (vt >= ht && reagHoy)) {
    return "Reagendado";
  }

  // VENCIDAS: vencida, el reagendamiento ya pasó, sigue en atraso.
  if (vt < ht && reag !== null && reag.getTime() < ht && ec === "Atraso") {
    return "Vencidas";
  }

  // ATRASADO: vencida, sin reagendamiento, sigue en atraso.
  if (vt < ht && reag === null && ec === "Atraso") {
    return "Atrasado";
  }

  return null;
}

/**
 * Color Fondo Reagendamiento — color condicional por cercanía del reagendamiento.
 * Devuelve el hex del DAX original; la UI lo simplifica a rojo/ámbar.
 */
export function colorReagendamiento(
  fechaReag: Date | null,
  hoy: Date,
): string {
  if (!fechaReag) return "#FFFFFF";
  const dias = diffDias(hoy, fechaReag);
  if (dias <= 0) return "#FF0000";
  if (dias <= 3) return "#FF6666";
  if (dias <= 7) return "#FFB366";
  if (dias <= 15) return "#FFE699";
  return "#FFFFFF";
}

/** Clase de pill simplificada (rojo/ámbar) usada en el diseño de referencia. */
export function pillReagendamiento(
  fechaReag: Date | null,
  hoy: Date,
): "p-red" | "p-amb" {
  if (!fechaReag) return "p-amb";
  const dias = diffDias(hoy, fechaReag);
  return dias <= 3 ? "p-red" : "p-amb";
}

/** Urgencia del reagendamiento según días desde hoy hasta la fecha reagendada. */
export type UrgenciaReag = "vencido" | "hoy" | "proximo" | "futuro";

/**
 * Clasifica la fecha de reagendamiento:
 *  - `vencido` → fecha < hoy (ya pasó)
 *  - `hoy`     → fecha = hoy
 *  - `proximo` → 1–2 días desde hoy
 *  - `futuro`  → 3+ días desde hoy
 */
export function urgenciaReag(
  fechaReag: Date | null,
  hoy: Date,
): UrgenciaReag | null {
  if (!fechaReag) return null;
  const dias = diffDias(hoy, fechaReag); // fechaReag - hoy
  if (dias < 0) return "vencido";
  if (dias === 0) return "hoy";
  if (dias <= 2) return "proximo";
  return "futuro";
}

/** Clase CSS del badge según urgencia: rojo / naranja / amarillo / verde. */
export function pillUrgencia(u: UrgenciaReag | null): string {
  switch (u) {
    case "vencido":
      return "p-red";
    case "hoy":
      return "p-org";
    case "proximo":
      return "p-amb";
    case "futuro":
      return "p-grn";
    default:
      return "p-amb";
  }
}
