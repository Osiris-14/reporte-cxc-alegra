import { describe, it, expect } from "vitest";
import { extractTalonario, extractVehiculo, vistaRango, OrdenRow } from "./ordenes";
import { parseFecha } from "./cxc-logic";

describe("extractTalonario", () => {
  it("extrae de la primera línea con prefijo FACT/FCT/ORDEN/NO y variantes", () => {
    const casos: [string, string][] = [
      ["FACT: 0906", "906"],
      ["FACT:0810", "810"],
      ["FACT; 0864", "864"],
      ["FCT: 0830", "830"],
      ["FACT0563", "563"],
      ["FRACT: 0146", "146"],
      ["AFCT: 0296", "296"],
      ["FCAT: 0174", "174"],
      ["ORDEN:0389", "389"],
      ["ORDEN 0849", "849"],
      ["NO:0377", "377"],
      ["0871", "871"],
    ];
    for (const [obs, esperado] of casos) {
      expect(extractTalonario(obs)).toBe(esperado);
    }
  });

  it("usa solo la PRIMERA línea de Observaciones", () => {
    expect(extractTalonario("FACT: 0904\nTRANF:RD$ 30,231\nCOTIZACION: 26872")).toBe("904");
  });

  it("devuelve '—' cuando no hay número reconocible", () => {
    expect(extractTalonario(null)).toBe("—");
    expect(extractTalonario("")).toBe("—");
    expect(extractTalonario("COLOR: BLANCO")).toBe("—");
  });
});

const mk = (nombre: string, descripcion = "") => ({ nombre, descripcion });

describe("extractVehiculo", () => {
  it("encuentra el vehículo en el NombreProducto (dos palabras primero)", () => {
    expect(extractVehiculo([mk("ISUZU DMAX DEFENSA TRASERA 2014")])).toBe("ISUZU DMAX");
    expect(extractVehiculo([mk("RENAULT MASTER KIT DE DEFENSAS")])).toBe("RENAULT MASTER");
    expect(extractVehiculo([mk("KIT-DEFENSA TOWN ACE COMPLETA! 2024")])).toBe("TOWN ACE");
    expect(extractVehiculo([mk("KIT-COMPLETA DEFENSA HIJET")])).toBe("HIJET");
    expect(extractVehiculo([mk("TOYOTA HILUX KIT DEFENSA TRASERA")])).toBe("TOYOTA");
  });

  it("encuentra el vehículo en la Descripcion de un item de servicio", () => {
    expect(extractVehiculo([mk("INSTALACION", "117 | NV 350 JALON")])).toBe("NV 350");
    expect(extractVehiculo([mk("INSTALACION", "DEFENSA DELANTERA DAIHATSU MIRA")])).toBe(
      "DAIHATSU",
    );
    expect(extractVehiculo([mk("MODIFICACION", "ISUZU DMAX AGREGARLE TUBITOS")])).toBe(
      "ISUZU DMAX",
    );
  });

  it("distingue CAMIONETA de CAMION por límite de palabra", () => {
    expect(extractVehiculo([mk("INSTALACION", "CAMIONETA POER DEFENSA")])).toBe("CAMIONETA");
  });

  it("fallback: sin vehículo en lista usa la descripción, si no el nombre", () => {
    // sin descripción → nombre del producto
    expect(extractVehiculo([mk("GOMAS")])).toBe("GOMAS");
    expect(extractVehiculo([mk("REPARACION GRADO (C)")])).toBe("REPARACION GRADO (C)");
    // con descripción (sin vehículo conocido) → la descripción
    expect(extractVehiculo([mk("PORTA ESCALERA", "detalle libre del cliente")])).toBe(
      "detalle libre del cliente",
    );
    // aunque el item principal sea excluido, se usa el primero como referencia
    expect(extractVehiculo([mk("INSTALACION", "trabajo especial")])).toBe("trabajo especial");
  });

  it("devuelve '—' SOLO si la factura no tiene items", () => {
    expect(extractVehiculo([])).toBe("—");
  });
});

function ordenEn(fecha: string, mt = 100, abono = 60, cxc = 40): OrdenRow {
  return {
    vehiculo: "ISUZU",
    talonario: "001",
    factura: `B${fecha}`,
    montoTotal: mt,
    abono,
    cxc,
    pendiente: mt - abono - cxc,
    metodoPago: "cash",
    instalacion: parseFecha(fecha),
    fechaCreacion: parseFecha(fecha),
  };
}

describe("vistaRango", () => {
  const todas = [
    ordenEn("2026-06-10"),
    ordenEn("2026-06-15"),
    ordenEn("2026-06-20"),
    ordenEn("2026-06-25"),
  ];

  it("filtra inclusivo por FechaCreación y suma totales", () => {
    const v = vistaRango(todas, parseFecha("2026-06-15"), parseFecha("2026-06-20"));
    expect(v.rows.map((r) => r.factura)).toEqual(["B2026-06-15", "B2026-06-20"]);
    expect(v.totales.montoTotal).toBe(200);
    expect(v.totales.abono).toBe(120);
    expect(v.totales.cxc).toBe(80);
    expect(v.totales.diferencia).toBe(0);
  });

  it("tolera fechas invertidas (desde > hasta)", () => {
    const v = vistaRango(todas, parseFecha("2026-06-20"), parseFecha("2026-06-15"));
    expect(v.rows.length).toBe(2);
  });

  it("devuelve vista vacía si falta alguna fecha", () => {
    expect(vistaRango(todas, null, parseFecha("2026-06-20")).rows).toEqual([]);
    expect(vistaRango(todas, parseFecha("2026-06-15"), null).rows).toEqual([]);
  });
});
