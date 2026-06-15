import { describe, it, expect } from "vitest";
import {
  CxcRow,
  estadoAgenda,
  estadoCuenta,
  estadoVencimiento,
  idCruce,
  pendienteLIT,
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
