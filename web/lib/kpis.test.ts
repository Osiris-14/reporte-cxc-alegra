import { describe, it, expect } from "vitest";
import { computeDashboard } from "./kpis";
import type { CxcRow } from "./cxc-logic";
import type { PagoRow } from "./data";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const cxcRow = (over: Partial<CxcRow>): CxcRow => ({
  numeroComprobante: "B0200003633",
  fecha: d("2026-08-12"),
  fechaVencimiento: d("2026-08-12"),
  cliente: "ALEXANDER",
  montoTotal: 38_600,
  balancePendiente: 0,
  estado: "closed",
  idCruce: null,
  etiqueta: null,
  fechaReagendamiento: null,
  titulo: null,
  observaciones: "",
  ...over,
});

const pagoRow = (over: Partial<PagoRow>): PagoRow => ({
  numeroComprobante: "B0200003633",
  cliente: "ALEXANDER",
  fechaPago: d("2026-08-12"),
  fechaVencimiento: d("2026-08-12"),
  montoPago: 0,
  balancePendiente: 0,
  estadoFactura: "closed",
  metodoPago: "cash",
  idCruce: null,
  ...over,
});

// Miércoles de la semana 24–30 ago 2026.
const HOY = d("2026-08-26");

describe("Entregar al Factory — factura mismo día cobrada después del vencimiento", () => {
  // Caso real B0200003633: abre y vence el 12-ago (semana anterior), pago
  // inicial de $20,000 ese día y el resto ($18,600) el 24-ago.
  const cxc = [cxcRow({})];
  const pagos = [
    pagoRow({ fechaPago: d("2026-08-12"), montoPago: 20_000 }),
    pagoRow({ fechaPago: d("2026-08-24"), montoPago: 18_600 }),
  ];

  it("entra al card aunque su vencimiento sea de una semana pasada", () => {
    const dash = computeDashboard(cxc, pagos, HOY);
    expect(dash.cobradoSemanaRows.map((r) => r.comprobante)).toContain(
      "B0200003633",
    );
    // Solo cuenta el pago DE la semana, no el inicial del 12-ago.
    expect(dash.cobradoSemana).toBe(18_600);
    expect(dash.cobradoSemanaFactory).toBeCloseTo(18_600 * 1.06, 2);
  });

  it("no aplica si apertura y vencimiento son días distintos", () => {
    const dash = computeDashboard(
      [cxcRow({ fechaVencimiento: d("2026-08-20") })],
      pagos,
      HOY,
    );
    expect(dash.cobradoSemana).toBe(0);
  });

  it("no aplica si el pago cae el mismo día del vencimiento", () => {
    const dash = computeDashboard(
      [cxcRow({ fecha: d("2026-08-26"), fechaVencimiento: d("2026-08-26") })],
      [
        pagoRow({
          fechaPago: d("2026-08-26"),
          montoPago: 18_600,
          fechaVencimiento: d("2026-08-26"),
        }),
      ],
      HOY,
    );
    // Cae por la vía normal (vencimiento en semana), no por la excepción.
    expect(dash.cobradoSemana).toBe(18_600);
  });

  it("sigue excluyendo facturas no factorizables (apertura >= $100,000)", () => {
    const dash = computeDashboard(
      [cxcRow({ montoTotal: 150_000 })],
      [
        pagoRow({ fechaPago: d("2026-08-12"), montoPago: 20_000 }),
        pagoRow({ fechaPago: d("2026-08-24"), montoPago: 130_000 }),
      ],
      HOY,
    );
    expect(dash.cobradoSemana).toBe(0);
  });
});
