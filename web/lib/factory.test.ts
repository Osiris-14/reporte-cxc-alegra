import { describe, it, expect } from "vitest";
import { calcFactura } from "./factory";
import type { CxcRow } from "./cxc-logic";
import type { PagoRow } from "./data";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

/** Factura mínima: se abre y vence el mismo día salvo que se indique otro venc. */
const f = (
  montoTotal: number,
  fecha: string,
  balancePendiente = 0,
  venc = fecha,
): CxcRow =>
  ({
    numeroComprobante: "B0200000001",
    fecha: d(fecha),
    fechaVencimiento: d(venc),
    cliente: "TEST",
    montoTotal,
    balancePendiente,
    estado: "closed",
    idCruce: null,
    etiqueta: null,
    fechaReagendamiento: null,
    titulo: null,
    observaciones: "",
  }) as CxcRow;

const p = (fechaPago: string, montoPago: number): PagoRow =>
  ({ fechaPago: d(fechaPago), montoPago }) as PagoRow;

describe("calcFactura — mismo día con deuda posterior", () => {
  it("activa la factura cuyo pago inicial cubrió todo pero recibió pagos después del vencimiento", () => {
    // Apertura = vencimiento el 10-ago, pago inicial cubre el total (apertura 0),
    // y el 20-ago entran 5,000 más: esos 5,000 son deuda del factory.
    const c = calcFactura(f(30_000, "2026-08-10"), [
      p("2026-08-10", 30_000),
      p("2026-08-20", 5_000),
    ]);
    expect(c.mismoDiaDeuda).toBe(true);
    expect(c.activa).toBe(true);
    expect(c.pendienteInicial).toBe(5_000);
    // La semana es la del VENCIMIENTO, no la del pago posterior.
    expect(c.fechaApertura).toEqual(d("2026-08-10"));
  });

  it("suma todos los pagos posteriores al vencimiento", () => {
    const c = calcFactura(f(30_000, "2026-08-10"), [
      p("2026-08-10", 30_000),
      p("2026-08-15", 2_000),
      p("2026-08-22", 3_500),
    ]);
    expect(c.pendienteInicial).toBe(5_500);
  });

  it("no aplica si los pagos posteriores no superan los 300", () => {
    const c = calcFactura(f(30_000, "2026-08-10"), [
      p("2026-08-10", 30_000),
      p("2026-08-20", 250),
    ]);
    expect(c.mismoDiaDeuda).toBe(false);
    expect(c.activa).toBe(false);
  });

  it("no aplica si apertura y vencimiento son días distintos", () => {
    const c = calcFactura(f(30_000, "2026-08-10", 0, "2026-08-24"), [
      p("2026-08-10", 30_000),
      p("2026-08-26", 5_000),
    ]);
    expect(c.mismoDiaDeuda).toBe(false);
  });

  it("no aplica si el pago inicial NO cubrió todo (ya es apertura activa normal)", () => {
    const c = calcFactura(f(30_000, "2026-08-10"), [
      p("2026-08-10", 20_000),
      p("2026-08-20", 10_000),
    ]);
    expect(c.mismoDiaDeuda).toBe(false);
    expect(c.activa).toBe(true);
    // Conserva el cálculo clásico: MontoTotal − pago inicial.
    expect(c.pendienteInicial).toBe(10_000);
  });

  it("respeta el tope de $100,000 de factorizabilidad", () => {
    const c = calcFactura(f(500_000, "2026-08-10"), [
      p("2026-08-10", 500_000),
      p("2026-08-20", 120_000),
    ]);
    expect(c.mismoDiaDeuda).toBe(true);
    expect(c.activa).toBe(false);
  });
});
