/**
 * data.ts — Carga y parseo de los 3 CSV del repo + cruce contra el calendario.
 *
 * Fuente:
 *  - Desarrollo (NODE_ENV !== 'production'): lee los CSV del repo por filesystem.
 *  - Producción: lee por raw.githubusercontent.com SIN caché (no-store) para
 *    reflejar de inmediato los cambios del pipeline (p. ej. facturas marcadas void).
 *
 * El parseo ocurre en el servidor (Server Component / route). Al cliente solo
 * se manda lo ya calculado. Usa papaparse de verdad por los campos con comillas
 * y saltos de línea embebidos (descripcion/notas del calendario).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { CxcRow, idCruce, parseFecha, hoyRD } from "./cxc-logic";

const REPO = "Osiris-14/reporte-cxc-alegra";
const BRANCH = "main";

const FILES = {
  cxc: "cxc_Cuentasporcobrar.csv",
  pagos: "cxc_Pagos.csv",
  calendario: "calendario_instalacion.csv",
  factoringBanco: "cxc_FactoringBanco.csv",
  factoringSaldo: "cxc_FactoringBancoSaldo.csv",
  items: "cxc_Items.csv",
} as const;

type FileKey = keyof typeof FILES;

/** Lee el texto crudo de un CSV, por fs en dev o por raw GitHub en prod. */
async function readCsv(key: FileKey): Promise<string> {
  const file = FILES[key];
  // Permite forzar la fuente con CXC_DATA_SOURCE=fs|raw.
  const forced = process.env.CXC_DATA_SOURCE;
  const useRaw =
    forced === "raw" ||
    (forced !== "fs" && process.env.NODE_ENV === "production");

  if (useRaw) {
    const url = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${file}`;
    // no-store: nunca cachear el CSV en el Data Cache de Next; cada request lee
    // la versión fresca de GitHub (evita servir facturas void ya retiradas).
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`No se pudo leer ${file} (${res.status}) desde ${url}`);
    }
    return res.text();
  }

  // fs: el repo es el padre de /web.
  const repoRoot = path.resolve(process.cwd(), "..");
  const full = path.join(repoRoot, file);
  return fs.readFile(full, "utf8");
}

/**
 * Fecha del último commit que tocó el CSV de CxC en GitHub = momento real en que
 * el pipeline actualizó los datos, aunque ese día no se hayan aperturado
 * facturas nuevas (p. ej. fines de semana). Es la mejor señal de frescura para
 * el banner "Datos al": max(Fecha) se queda pegado al último día hábil, pero el
 * pipeline igual corre y refresca saldos/pagos. Devuelve el día-calendario RD
 * del commit (medianoche UTC, misma convención que hoyRD/parseFecha) o null.
 *
 * Solo aplica cuando la fuente es raw GitHub (producción). En dev cae al
 * fallback max(Fecha). Se revalida cada 10 min para no agotar el rate-limit de
 * la API de GitHub (60 req/h sin auth); ante cualquier fallo devuelve null.
 */
async function fetchFechaCommitRD(): Promise<Date | null> {
  const forced = process.env.CXC_DATA_SOURCE;
  const useRaw =
    forced === "raw" ||
    (forced !== "fs" && process.env.NODE_ENV === "production");
  if (!useRaw) return null;

  const url = `https://api.github.com/repos/${REPO}/commits?path=${encodeURIComponent(
    FILES.cxc,
  )}&sha=${BRANCH}&per_page=1`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "reporte-cxc-alegra",
      },
      // El commit solo cambia cuando corre el pipeline: cachear 10 min evita
      // gastar rate-limit sin restarle frescura útil al banner.
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const arr = (await res.json()) as Array<{
      commit?: { committer?: { date?: string } };
    }>;
    const iso = arr?.[0]?.commit?.committer?.date;
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return hoyRD(d); // día-calendario RD del instante del commit
  } catch {
    return null;
  }
}

/**
 * Lee un CSV opcional: si aún no existe (p. ej. cxc_Items.csv sin commitear a
 * GitHub todavía), devuelve "" en vez de romper toda la carga. Los consumidores
 * lo tratan como "sin filas".
 */
async function readCsvOpcional(key: FileKey): Promise<string> {
  try {
    return await readCsv(key);
  } catch {
    return "";
  }
}

/** Parsea un CSV a objetos con headers, tolerando comillas/saltos de línea. */
function parse<T = Record<string, string>>(text: string): T[] {
  // Quita BOM si viene.
  const clean = text.replace(/^﻿/, "");
  const out = Papa.parse<T>(clean, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  return out.data;
}

/** cxc_Cuentasporcobrar usa PUNTO decimal (ej. "50003.9"). */
function toNumber(raw: string | undefined): number {
  if (raw == null) return 0;
  const n = parseFloat(String(raw).replace(/,/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

/**
 * cxc_Pagos usa COMA decimal (ej. "48899,44" = 48899.44). Quita separadores de
 * miles (puntos) y convierte la coma decimal en punto. NO usar para cxc.
 */
function toNumberComma(raw: string | undefined): number {
  if (raw == null) return 0;
  const n = parseFloat(String(raw).trim().replace(/\./g, "").replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
}

/** Una entrada del calendario relevante para el cruce. */
interface CalEntry {
  p: number;
  etiqueta: string | null;
  inicio: Date | null;
  titulo: string | null;
}

/**
 * Construye el índice de cruce: Codigo cruce (p) -> entrada.
 * Si un mismo `p` aparece en >1 evento, se marca como ambiguo y el cruce
 * devuelve blank, replicando SELECTEDVALUE (que da BLANK ante múltiples valores).
 */
function buildCalendarIndex(
  rows: Record<string, string>[],
): Map<number, CalEntry | "AMBIGUOUS"> {
  const map = new Map<number, CalEntry | "AMBIGUOUS">();
  for (const r of rows) {
    const pRaw = (r["p"] ?? "").trim();
    if (!pRaw) continue;
    const p = parseInt(pRaw, 10);
    if (Number.isNaN(p)) continue;

    const entry: CalEntry = {
      p,
      etiqueta: (r["etiqueta"] ?? "").trim() || null,
      inicio: parseFecha(r["inicio"]),
      titulo: (r["titulo"] ?? "").trim() || null,
    };

    const existing = map.get(p);
    if (existing === undefined) {
      map.set(p, entry);
    } else if (existing === "AMBIGUOUS") {
      // ya ambiguo
    } else {
      // ¿Mismo valor efectivo? Si difiere en etiqueta o fecha -> ambiguo.
      const sameEtiqueta = existing.etiqueta === entry.etiqueta;
      const sameFecha =
        (existing.inicio?.getTime() ?? null) ===
        (entry.inicio?.getTime() ?? null);
      if (!sameEtiqueta || !sameFecha) {
        map.set(p, "AMBIGUOUS");
      }
    }
  }
  return map;
}

/** Resultado de la carga: filas de cxc enriquecidas + filas de pagos. */
export interface CxcData {
  cxc: CxcRow[];
  pagos: PagoRow[];
  /** Año en curso usado para el filtro base. */
  anioActual: number;
  /**
   * Fecha "datos al" = máxima Fecha de creación del CSV (= última corrida del
   * pipeline). Es SOLO un indicador de frescura para el banner; los estados
   * NUNCA se calculan contra esta fecha, siempre contra hoyRD() (hoy real RD),
   * igual que Power BI. No se usa max(FechaVencimiento) porque hay vencimientos
   * futuros.
   */
  fechaCorte: Date;
  /** Movimientos de la cuenta Factoring Banco (para el "Fondo Carryon"). */
  factoringMovs: FactoringMovRow[];
  /** Saldo actual de Factoring Banco (negativo = deuda). */
  factoringSaldo: number;
  /** Líneas de producto por factura (para extraer el Vehículo en Órdenes). */
  items: ItemRow[];
}

export interface PagoRow {
  numeroComprobante: string;
  cliente: string;
  fechaPago: Date | null;
  fechaVencimiento: Date | null;
  montoPago: number;
  balancePendiente: number;
  estadoFactura: string;
  metodoPago: string;
  idCruce: number | null;
}

/** Una línea de producto/servicio de una factura (cxc_Items.csv, solo 2026). */
export interface ItemRow {
  numeroComprobante: string;
  fechaFactura: Date | null;
  idItem: string;
  nombreProducto: string;
  descripcion: string;
  cantidad: number;
  precio: number;
  total: number;
}

/** Movimiento de la cuenta "Factoring Banco" (cxc_FactoringBanco.csv). */
export interface FactoringMovRow {
  fecha: Date | null;
  tercero: string;
  cuentaContable: string;
  tipo: string; // "Entrada" | "Salida"
  valor: number; // punto decimal; + Entrada, − Salida
}

/**
 * Carga los 3 CSV, cruza cxc con el calendario y filtra al año del corte.
 * La fecha de corte ("datos al") se deriva de max(Fecha) del propio CSV.
 */
export async function loadCxcData(): Promise<CxcData> {
  // Arranca en paralelo con la lectura de CSV: fecha real de la última corrida
  // del pipeline (commit del CSV en GitHub) para el banner "Datos al".
  const fechaCommitP = fetchFechaCommitRD();

  const [cxcText, pagosText, calText, factBancoText, factSaldoText, itemsText] =
    await Promise.all([
      readCsv("cxc"),
      readCsv("pagos"),
      readCsv("calendario"),
      readCsv("factoringBanco"),
      readCsv("factoringSaldo"),
      readCsvOpcional("items"),
    ]);

  const calRows = parse(calText);
  const calIndex = buildCalendarIndex(calRows);

  const cxcRaw = parse(cxcText);

  // Año del filtro base = año REAL en curso (igual que Power Query
  // IsInCurrentYear), NUNCA el del CSV.
  const anio = hoyRD().getUTCFullYear();

  // Fecha de corte = máxima Fecha de creación de toda la tabla (= última corrida
  // del pipeline). Solo se usa para el banner "Datos al", NO para calcular
  // estados (eso siempre va contra hoyRD()).
  let corteMs = 0;
  for (const r of cxcRaw) {
    const f = parseFecha(r["Fecha"]);
    if (f) corteMs = Math.max(corteMs, f.getTime());
  }
  const maxFechaCorte = corteMs ? new Date(corteMs) : hoyRD();

  // "Datos al" = la fecha MÁS RECIENTE entre max(Fecha) del CSV y la fecha del
  // último commit del CSV (= última corrida del pipeline). Así el banner avanza
  // aunque un día sin facturas nuevas (fin de semana) deje max(Fecha) pegado al
  // último día hábil. Si el lookup del commit falla, cae a max(Fecha).
  const fechaCommit = await fechaCommitP;
  const fechaCorte =
    fechaCommit && fechaCommit.getTime() > maxFechaCorte.getTime()
      ? fechaCommit
      : maxFechaCorte;

  const cxc: CxcRow[] = [];
  for (const r of cxcRaw) {
    const numeroComprobante = (r["NumeroComprobante"] ?? "").trim();
    const fecha = parseFecha(r["Fecha"]);
    // Filtro base: solo facturas del año del corte.
    if (!fecha || fecha.getUTCFullYear() !== anio) continue;

    const id = idCruce(numeroComprobante);
    const cal = id != null ? calIndex.get(id) : undefined;
    const match = cal && cal !== "AMBIGUOUS" ? cal : null;

    cxc.push({
      numeroComprobante,
      fecha,
      fechaVencimiento: parseFecha(r["FechaVencimiento"]),
      cliente: (r["Cliente"] ?? "").trim(),
      montoTotal: toNumber(r["MontoTotal"]),
      balancePendiente: toNumber(r["BalancePendiente"]),
      estado: (r["Estado"] ?? "").trim(),
      idCruce: id,
      etiqueta: match ? match.etiqueta : null,
      fechaReagendamiento: match ? match.inicio : null,
      titulo: match ? match.titulo : null,
      observaciones: (r["Observaciones"] ?? "").trim(),
    });
  }

  const pagos: PagoRow[] = parse(pagosText).map((r) => ({
    numeroComprobante: (r["NumeroComprobante"] ?? "").trim(),
    cliente: (r["Cliente"] ?? "").trim(),
    fechaPago: parseFecha(r["FechaPago"]),
    fechaVencimiento: parseFecha(r["FechaVencimiento"]),
    montoPago: toNumberComma(r["MontoPago"]), // cxc_Pagos usa coma decimal
    balancePendiente: toNumberComma(r["BalancePendiente"]),
    estadoFactura: (r["EstadoFactura"] ?? "").trim(),
    metodoPago: (r["MetodoPago"] ?? "").trim(),
    idCruce: idCruce((r["NumeroComprobante"] ?? "").trim()),
  }));

  // Factoring Banco: movimientos (punto decimal) + saldo actual.
  const factoringMovs: FactoringMovRow[] = parse(factBancoText).map((r) => ({
    fecha: parseFecha(r["Fecha"]),
    tercero: (r["Tercero"] ?? "").trim(),
    cuentaContable: (r["CuentaContable"] ?? "").trim(),
    tipo: (r["Tipo"] ?? "").trim(),
    valor: toNumber(r["Valor"]),
  }));
  const saldoRows = parse(factSaldoText);
  const factoringSaldo = saldoRows.length ? toNumber(saldoRows[0]["Saldo"]) : 0;

  // Items (líneas de producto). El orden del CSV = orden de los items en la
  // factura; se preserva para poder elegir el "item principal" (el primero no
  // excluido) al extraer el Vehículo.
  const items: ItemRow[] = parse(itemsText).map((r) => ({
    numeroComprobante: (r["NumeroComprobante"] ?? "").trim(),
    fechaFactura: parseFecha(r["FechaFactura"]),
    idItem: (r["IdItem"] ?? "").trim(),
    nombreProducto: (r["NombreProducto"] ?? "").trim(),
    descripcion: (r["Descripcion"] ?? "").trim(),
    cantidad: toNumber(r["Cantidad"]),
    precio: toNumber(r["Precio"]),
    total: toNumber(r["Total"]),
  }));

  return {
    cxc,
    pagos,
    anioActual: anio,
    fechaCorte,
    factoringMovs,
    factoringSaldo,
    items,
  };
}
