/**
 * ordenes.ts — Reporte diario de "Órdenes nuevas".
 *
 * Fuentes:
 *  - cxc_Cuentasporcobrar.csv → Factura (NumeroComprobante), MontoTotal,
 *    BalancePendiente (CXC), FechaVencimiento (Instalación), Fecha (creación →
 *    filtro), Observaciones (→ Talonario).
 *  - cxc_Items.csv → líneas de producto (→ Vehículo, del item principal).
 *  - cxc_Pagos.csv → Abono (SUM MontoPago), Método de Pago (del último pago).
 *
 * Talonario y Vehículo REEMPLAZAN la extracción anterior por calendario.
 * Todo se calcula contra `hoy` (hoyRD). Nada se almacena.
 *
 * Validación: Pendiente = MontoTotal − Abono − CXC. Debe dar 0 si todo cuadra;
 * la fila de totales expone la DIFERENCIA (SUM Pendiente) para detectar descuadres.
 */
import { CxcRow, inicioSemana, finSemana } from "./cxc-logic";
import type { PagoRow, ItemRow } from "./data";
import { rangoSemana, MESES_LARGOS } from "./format";

/**
 * Vehículos conocidos, en ORDEN DE PRIORIDAD: primero los de DOS palabras (para
 * que "ISUZU DMAX" gane a "ISUZU" y "NV 350" a "NV"), luego los de UNA. La
 * búsqueda se hace con límites de palabra sobre NombreProducto + Descripcion.
 */
const VEHICULOS = [
  // dos palabras
  "TOWN ACE",
  "LAND CRUISER",
  "PICK UP",
  "ISUZU DMAX",
  "NV 350",
  "RENAULT MASTER",
  // una palabra
  "ISUZU",
  "RENAULT",
  "NISSAN",
  "NV200",
  "NV350",
  "KIA",
  "TOYOTA",
  "DAIHATSU",
  "HIJET",
  "MIRA",
  "K2700",
  "MITSUBISHI",
  "L300",
  "HYUNDAI",
  "FORD",
  "CHEVROLET",
  "JAC",
  "HINO",
  "JEEP",
  "SUZUKI",
  "MAHINDRA",
  "FUSO",
  "CANTER",
  "CAMION",
  "CAMIONETA",
];

/**
 * Palabras que marcan un item como NO principal (accesorios/servicios). El item
 * principal de la factura es el primero cuyo NombreProducto no contiene ninguna.
 */
const ITEM_EXCLUIR = [
  "MATERIALES",
  "BOLA DE JALON",
  "DESINSTALACION",
  "INSTALACION",
  "SENSORES",
  "ARANDELAS",
  "MODIFICACION",
];

/**
 * Talonario a partir de la PRIMERA LÍNEA de Observaciones.
 *   1) prefijo FACT/FCT/ORDEN/NO (con variantes de tipeo) + número de 3–4 díg.
 *   2) fallback: número de 3–4 díg. al inicio de la línea.
 * Se quitan los ceros a la izquierda (0906 → 906). Sin match → "—".
 */
export function extractTalonario(observaciones: string | null | undefined): string {
  if (!observaciones) return "—";
  const primeraLinea = observaciones.split("\n")[0];
  const m =
    primeraLinea.match(/(?:F[A-Z]*T[;:_ ]*|ORDEN[;: ]*|NO[;:] *)0*(\d{3,4})/i) ||
    primeraLinea.match(/^0*(\d{3,4})\b/);
  if (!m) return "—";
  return String(parseInt(m[1], 10)); // quita ceros a la izquierda
}

/** Una línea de producto reducida a lo que necesita la extracción de vehículo. */
export interface ItemNombreDesc {
  nombre: string;
  descripcion: string;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Busca el primer vehículo de la lista (dos palabras primero) en un texto. */
function buscarVehiculo(texto: string): string | null {
  const up = texto.toUpperCase();
  for (const v of VEHICULOS) {
    if (new RegExp(`\\b${escapeRe(v)}\\b`).test(up)) return v;
  }
  return null;
}

/**
 * Vehículo a partir de las líneas de producto de una factura. El vehículo puede
 * venir en el NombreProducto ("KIT-DEFENSA TOWN ACE") o en la Descripcion de un
 * item de servicio ("INSTALACION" → desc "DEFENSA DELANTERA DAIHATSU MIRA",
 * "NV 350 JALON"). Por eso:
 *  1) Se arma el texto NombreProducto + " " + Descripcion del item principal
 *     (primero cuyo nombre no es accesorio/servicio) y se busca un vehículo.
 *  2) Si no hay match (o no hay item principal), se busca sobre TODO el texto de
 *     la factura (todos los items, incluidos los excluidos, porque el vehículo
 *     suele estar en la descripción de un "INSTALACION"/"MODIFICACION").
 * Se prioriza siempre los vehículos de dos palabras.
 *
 * Fallback (nunca "—" si hay items): si no se encuentra ningún vehículo de la
 * lista, se muestra la Descripcion del item de referencia (el principal, o el
 * primero si todos son accesorios) y, si está vacía, su NombreProducto. Solo
 * se devuelve "—" cuando la factura no tiene NINGÚN item.
 */
export function extractVehiculo(items: ItemNombreDesc[]): string {
  if (items.length === 0) return "—";

  const limpio = (s: string | null | undefined) => (s || "").trim();
  const combinar = (it: ItemNombreDesc) =>
    `${limpio(it.nombre)} ${limpio(it.descripcion)}`;

  const principal = items.find((it) => {
    const u = limpio(it.nombre).toUpperCase();
    return u !== "" && !ITEM_EXCLUIR.some((e) => u.includes(e));
  });

  const textos: string[] = [];
  if (principal) textos.push(combinar(principal));
  textos.push(items.map(combinar).join(" ")); // fallback: toda la factura

  for (const t of textos) {
    const v = buscarVehiculo(t);
    if (v) return v;
  }

  // Sin vehículo en la lista → usar la descripción del item de referencia; si
  // no tiene, su nombre. Referencia = item principal, o el primero si no hay.
  const ref = principal ?? items[0];
  return limpio(ref.descripcion) || limpio(ref.nombre) || "—";
}

/** Traducción de MetodoPago de Alegra al español (fallback: el valor original). */
const METODO_ES: Record<string, string> = {
  transfer: "Transferencia",
  cash: "Efectivo",
  cheque: "Cheque",
};

function traducirMetodo(m: string | null | undefined): string {
  if (!m) return "—";
  return METODO_ES[m.trim().toLowerCase()] ?? m;
}

/** Una fila del reporte de órdenes. */
export interface OrdenRow {
  vehiculo: string;
  talonario: string;
  factura: string; // NumeroComprobante
  montoTotal: number; // cxc.MontoTotal
  abono: number; // MontoPago del PRIMER pago (FechaPago más antigua)
  cxc: number; // cxc.BalancePendiente
  pendiente: number; // MontoTotal − Abono − CXC
  metodoPago: string; // MetodoPago del primer pago, traducido al español
  instalacion: Date | null; // cxc.FechaVencimiento
  fechaCreacion: Date | null; // cxc.Fecha (para el filtro hoy/semana/mes)
}

export interface OrdenTotales {
  montoTotal: number;
  abono: number;
  cxc: number;
  diferencia: number; // SUM(pendiente) → 0 si todo cuadra
}

export interface OrdenesVista {
  rows: OrdenRow[];
  totales: OrdenTotales;
}

export interface OrdenesData {
  hoy: Date;
  hoyVista: OrdenesVista;
  semanaVista: OrdenesVista;
  mesVista: OrdenesVista;
  /** TODAS las órdenes del año (ya ordenadas), para el filtro por rango libre. */
  todas: OrdenRow[];
  rangoSemanaLabel: string; // "lunes–domingo" de la semana actual
  mesLabel: string; // nombre del mes actual
}

export function totalizar(rows: OrdenRow[]): OrdenTotales {
  return rows.reduce(
    (a, r) => ({
      montoTotal: a.montoTotal + r.montoTotal,
      abono: a.abono + r.abono,
      cxc: a.cxc + r.cxc,
      diferencia: a.diferencia + r.pendiente,
    }),
    { montoTotal: 0, abono: 0, cxc: 0, diferencia: 0 },
  );
}

const sameDay = (a: Date | null, b: Date) =>
  a !== null && a.getTime() === b.getTime();

const inRange = (d: Date | null, a: Date, b: Date) =>
  d !== null && d.getTime() >= a.getTime() && d.getTime() <= b.getTime();

/**
 * Vista filtrada por un rango de FechaCreación [desde, hasta] (inclusivo). Se
 * usa desde el cliente cuando el usuario activa el date range picker. Si falta
 * alguna fecha devuelve una vista vacía (aún no hay filtro completo).
 */
export function vistaRango(
  todas: OrdenRow[],
  desde: Date | null,
  hasta: Date | null,
): OrdenesVista {
  if (!desde || !hasta) {
    return { rows: [], totales: totalizar([]) };
  }
  // Tolera que el usuario invierta los campos (desde > hasta).
  const a = Math.min(desde.getTime(), hasta.getTime());
  const b = Math.max(desde.getTime(), hasta.getTime());
  const rows = todas.filter(
    (r) =>
      r.fechaCreacion !== null &&
      r.fechaCreacion.getTime() >= a &&
      r.fechaCreacion.getTime() <= b,
  );
  return { rows, totales: totalizar(rows) };
}

/**
 * Construye el reporte de órdenes para hoy / semana / mes.
 * `cxc` ya viene filtrado al año en curso (data.cxc). Se excluyen las facturas
 * VOID (Estado=void en cxc o EstadoFactura=void en algún pago), igual que Factory.
 */
export function computeOrdenes(
  cxc: CxcRow[],
  pagos: PagoRow[],
  items: ItemRow[],
  hoy: Date,
): OrdenesData {
  const anio = hoy.getUTCFullYear();
  const lunes = inicioSemana(hoy);
  const domingo = finSemana(hoy);

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

  // Items por comprobante, EN ORDEN (nombre + descripción para hallar el vehículo).
  const itemsByComp = new Map<string, ItemNombreDesc[]>();
  for (const it of items) {
    const arr = itemsByComp.get(it.numeroComprobante) ?? [];
    arr.push({ nombre: it.nombreProducto, descripcion: it.descripcion });
    itemsByComp.set(it.numeroComprobante, arr);
  }

  const rows: OrdenRow[] = [];
  for (const r of cxc) {
    if (r.estado.toLowerCase() === "void") continue;
    if (voidComprobantes.has(r.numeroComprobante)) continue;

    const misPagos = pagosByComp.get(r.numeroComprobante) ?? [];

    // Abono y Método de pago = SOLO el primer pago (FechaPago más antigua),
    // es decir, el abono inicial. NO se suman los pagos posteriores.
    let primero: PagoRow | null = null;
    for (const p of misPagos) {
      if (!p.fechaPago) continue;
      if (primero === null || p.fechaPago.getTime() < primero.fechaPago!.getTime()) {
        primero = p;
      }
    }
    const abono = primero?.montoPago ?? 0;
    const metodoPago = traducirMetodo(primero?.metodoPago);

    const talonario = extractTalonario(r.observaciones);
    const vehiculo = extractVehiculo(itemsByComp.get(r.numeroComprobante) ?? []);

    rows.push({
      vehiculo,
      talonario,
      factura: r.numeroComprobante,
      montoTotal: r.montoTotal,
      abono,
      cxc: r.balancePendiente,
      pendiente: r.montoTotal - abono - r.balancePendiente,
      metodoPago,
      instalacion: r.fechaVencimiento,
      fechaCreacion: r.fecha,
    });
  }

  // Orden estable: por fecha de creación desc, luego por factura.
  rows.sort((a, b) => {
    const fa = a.fechaCreacion?.getTime() ?? 0;
    const fb = b.fechaCreacion?.getTime() ?? 0;
    if (fb !== fa) return fb - fa;
    return a.factura.localeCompare(b.factura);
  });

  const hoyRows = rows.filter((r) => sameDay(r.fechaCreacion, hoy));
  const semanaRows = rows.filter((r) => inRange(r.fechaCreacion, lunes, domingo));
  const mesRows = rows.filter(
    (r) =>
      r.fechaCreacion != null &&
      r.fechaCreacion.getUTCFullYear() === anio &&
      r.fechaCreacion.getUTCMonth() === hoy.getUTCMonth(),
  );

  const mk = (rs: OrdenRow[]): OrdenesVista => ({ rows: rs, totales: totalizar(rs) });

  return {
    hoy,
    hoyVista: mk(hoyRows),
    semanaVista: mk(semanaRows),
    mesVista: mk(mesRows),
    todas: rows,
    rangoSemanaLabel: rangoSemana(lunes, domingo),
    mesLabel: MESES_LARGOS[hoy.getUTCMonth()],
  };
}
