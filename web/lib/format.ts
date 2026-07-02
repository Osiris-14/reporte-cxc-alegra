/** Helpers de formato compartidos cliente/servidor. */

/** "$329,543" — sin decimales, separador de miles, igual que el HTML de ref. */
export function money(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

const MESES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/** "11 jun" (fecha naive UTC). */
export function diaMes(d: Date | null): string {
  if (!d) return "—";
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

/** "4 feb 2026". */
export function diaMesAnio(d: Date | null): string {
  if (!d) return "—";
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Hora local de República Dominicana (America/Santo_Domingo, UTC-4) en formato
 * "9:45 AM". Se le pasa el `Date` del momento de render (new Date() en el server
 * component) para mostrar cuándo se cargó/renderizó la página, no cuándo se
 * generó el CSV.
 */
export function horaRD(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santo_Domingo",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/** Rango de una semana: "2–8 jun" o "29 jun – 5 jul" si cruza de mes. */
export function rangoSemana(start: Date, end: Date): string {
  if (start.getUTCMonth() === end.getUTCMonth()) {
    return `${start.getUTCDate()}–${end.getUTCDate()} ${MESES[end.getUTCMonth()]}`;
  }
  return `${start.getUTCDate()} ${MESES[start.getUTCMonth()]} – ${end.getUTCDate()} ${MESES[end.getUTCMonth()]}`;
}

/** Nombres de meses completos para los tabs. */
export const MESES_LARGOS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
