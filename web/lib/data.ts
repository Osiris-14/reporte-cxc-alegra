/**
 * data.ts — Carga y parseo de los 3 CSV del repo + cruce contra el calendario.
 *
 * Fuente:
 *  - Desarrollo (NODE_ENV !== 'production'): lee los CSV del repo por filesystem.
 *  - Producción: lee por raw.githubusercontent.com con revalidación (cron-aligned).
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
/** Revalidación de 30 min, alineada al cron del pipeline (6:30 / 11:00 / 16:45 RD). */
export const REVALIDATE_SECONDS = 1800;

const FILES = {
  cxc: "cxc_Cuentasporcobrar.csv",
  pagos: "cxc_Pagos.csv",
  calendario: "calendario_instalacion.csv",
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
    const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
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
}

export interface PagoRow {
  numeroComprobante: string;
  cliente: string;
  fechaPago: Date | null;
  fechaVencimiento: Date | null;
  montoPago: number;
  balancePendiente: number;
  estadoFactura: string;
  idCruce: number | null;
}

/**
 * Carga los 3 CSV, cruza cxc con el calendario y filtra al año del corte.
 * La fecha de corte ("datos al") se deriva de max(Fecha) del propio CSV.
 */
export async function loadCxcData(): Promise<CxcData> {
  const [cxcText, pagosText, calText] = await Promise.all([
    readCsv("cxc"),
    readCsv("pagos"),
    readCsv("calendario"),
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
  const fechaCorte = corteMs ? new Date(corteMs) : hoyRD();

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
    idCruce: idCruce((r["NumeroComprobante"] ?? "").trim()),
  }));

  return { cxc, pagos, anioActual: anio, fechaCorte };
}
