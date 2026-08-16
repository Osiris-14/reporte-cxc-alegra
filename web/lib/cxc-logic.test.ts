import { describe, it, expect } from "vitest";
import {
  CxcRow,
  estadoAgenda,
  estadoCuenta,
  estadoVencimiento,
  esFactorizable,
  idCruce,
  pendienteLIT,
  pendienteInicial,
  parseFecha,
} from "./cxc-logic";

const HOY = parseFecha("2026-06-12")!;
const d = (s: string) => parseFecha(s)!;

function row(partial: Partial<CxcRow>): CxcRow {
  return {
    numeroComprobante: "B0200003404",
    fecha: d("2026-06-01"),
    fechaVencimiento: d("2026-06-01"),
    cliente: "Test",
    montoTotal: 1000,
    balancePendiente: 1000,
    estado: "open",
    idCruce: 3404,
    etiqueta: null,
    fechaReagendamiento: null,
    titulo: null,
    observaciones: "",
    ...partial,
  };
}

describe("idCruce", () => {
  it("toma los últimos 4 dígitos del comprobante", () => {
    expect(idCruce("B0200003404")).toBe(3404);
    expect(idCruce("B0200002863")).toBe(2863);
  });
});

describe("pendienteLIT", () => {
  it("aplica el 6% de ITBIS", () => {
    expect(pendienteLIT({ balancePendiente: 1000 })).toBeCloseTo(1060);
  });
});

describe("esFactorizable (regla única apertura factory)", () => {
  const f = (montoTotal: number, fecha?: string) =>
    row({
      montoTotal,
      balancePendiente: montoTotal,
      fecha: fecha ? d(fecha) : d("2026-08-12"),
    });

  it("TRUE para apertura < $100,000 (ej. factorizable)", () => {
    expect(esFactorizable(f(99_999, "2026-08-12"), [])).toBe(true);
  });
  it("FALSE para apertura >= $100,000 (B0200003631 $119,357)", () => {
    expect(esFactorizable(f(119_357, "2026-08-12"), [])).toBe(false);
  });
  it("FALSE para apertura exacta de $100,000", () => {
    expect(esFactorizable(f(100_000, "2026-08-12"), [])).toBe(false);
  });
  it("FALSE para apertura <= $300 (ya pagada/apartada)", () => {
    expect(esFactorizable(f(300, "2026-08-12"), [])).toBe(false);
  });
  it("resta el pago inicial del mismo día de la factura", () => {
    // monto 119,357 con pago inicial de 20,000 -> apertura 99,357 -> SI factorizable
    expect(
      esFactorizable(f(119_357, "2026-08-12"), [
        { fechaPago: d("2026-08-12"), montoPago: 20_000 },
      ]),
    ).toBe(true);
  });
});

describe("pendienteInicial", () => {
  it("usa BalancePendiente si un pago precede a la creación (error de captura)", () => {
    const r = row({
      fecha: d("2026-08-12"),
      montoTotal: 50_000,
      balancePendiente: 40_000,
    });
    expect(
      pendienteInicial(r, [{ fechaPago: d("2026-08-10"), montoPago: 10_000 }]),
    ).toBe(40_000);
  });
});

describe("estadoCuenta", () => {
  it("Cerrado si balance <= 450", () => {
    expect(estadoCuenta(450, d("2026-01-01"), HOY)).toBe("Cerrado");
    expect(estadoCuenta(0, null, HOY)).toBe("Cerrado");
  });
  it("Atraso si balance > 450 y venció", () => {
    expect(estadoCuenta(1000, d("2026-06-01"), HOY)).toBe("Atraso");
  });
  it("Open si balance > 450 y no venció", () => {
    expect(estadoCuenta(1000, d("2026-06-30"), HOY)).toBe("Open");
  });
});

describe("estadoVencimiento (semana lun-dom)", () => {
  it("Hoy cuando vence hoy", () => {
    expect(estadoVencimiento(HOY, HOY)).toBe("Hoy");
  });
  it("Semana dentro de la semana laboral", () => {
    // 2026-06-12 es viernes; domingo = 2026-06-14
    expect(estadoVencimiento(d("2026-06-14"), HOY)).toBe("Semana");
  });
  it("Vencido en el pasado", () => {
    expect(estadoVencimiento(d("2026-06-01"), HOY)).toBe("Vencido");
  });
  it("Otros fuera de la semana en el futuro", () => {
    expect(estadoVencimiento(d("2026-06-20"), HOY)).toBe("Otros");
  });
});

describe("estadoAgenda", () => {
  it("Reagendado: vencida con reagendamiento futuro", () => {
    const r = row({
      fechaVencimiento: d("2026-06-01"),
      fechaReagendamiento: d("2026-06-15"),
    });
    expect(estadoAgenda(r, HOY)).toBe("Reagendado");
  });

  it("Reagendado: vence hoy o después y reagendada hoy", () => {
    const r = row({
      fechaVencimiento: d("2026-06-13"),
      fechaReagendamiento: HOY,
    });
    expect(estadoAgenda(r, HOY)).toBe("Reagendado");
  });

  it("Vencidas: venció, reagendamiento ya pasó, sigue en atraso", () => {
    const r = row({
      fechaVencimiento: d("2026-06-01"),
      fechaReagendamiento: d("2026-06-05"),
      balancePendiente: 1000,
    });
    expect(estadoAgenda(r, HOY)).toBe("Vencidas");
  });

  it("Atrasado: venció, sin reagendamiento, sigue en atraso", () => {
    const r = row({
      fechaVencimiento: d("2026-06-01"),
      fechaReagendamiento: null,
      balancePendiente: 1000,
    });
    expect(estadoAgenda(r, HOY)).toBe("Atrasado");
  });

  it("null cuando ya está cerrada", () => {
    const r = row({
      fechaVencimiento: d("2026-06-01"),
      fechaReagendamiento: null,
      balancePendiente: 100,
    });
    expect(estadoAgenda(r, HOY)).toBeNull();
  });
});
