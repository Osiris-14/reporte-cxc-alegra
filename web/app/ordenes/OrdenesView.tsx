"use client";

import { useMemo, useState } from "react";
import Topbar from "@/components/Topbar";
import { OrdenesData, OrdenesVista, OrdenRow, vistaRango } from "@/lib/ordenes";
import { parseFecha } from "@/lib/cxc-logic";
import { money, diaMesAnio } from "@/lib/format";

type Tab = "hoy" | "semana" | "mes";

/** Instalación en formato DD/MM (fecha naive UTC). */
function ddmm(d: Date | null): string {
  if (!d) return "—";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

/** Umbral bajo el cual la DIFERENCIA se considera cuadrada (redondeo de centavos). */
const UMBRAL_CUADRE = 1;

function OrdenesTable({ vista }: { vista: OrdenesVista }) {
  const { rows, totales } = vista;
  const cuadra = Math.abs(totales.diferencia) < UMBRAL_CUADRE;
  const difColor = cuadra ? "#1a7a44" : "#c0392b";

  return (
    <div className="card">
      <table className="tb-full tb-stack">
        <thead>
          <tr>
            <th className="a-c" style={{ width: "9%" }}>Fecha de Orden</th>
            <th style={{ width: "11%" }}>Vehículo</th>
            <th style={{ width: "8%" }}>Talonario</th>
            <th style={{ width: "12%" }}>Factura</th>
            <th className="a-l" style={{ width: "11%" }}>Monto Total</th>
            <th className="a-l" style={{ width: "10%" }}>Abono</th>
            <th className="a-l" style={{ width: "10%" }}>CXC</th>
            <th className="a-l" style={{ width: "10%" }}>Pendiente</th>
            <th style={{ width: "10%" }}>Método de Pago</th>
            <th className="a-c" style={{ width: "9%" }}>Instalación</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr className="empty-row">
              <td colSpan={10}>Sin órdenes nuevas en este período</td>
            </tr>
          )}
          {rows.map((r: OrdenRow) => {
            const desc = Math.abs(r.pendiente) >= UMBRAL_CUADRE;
            return (
              <tr key={r.factura}>
                <td className="a-c" data-label="Fecha de Orden">{ddmm(r.fechaCreacion)}</td>
                <td className="client-cell" data-label="Vehículo">{r.vehiculo}</td>
                <td data-label="Talonario">{r.talonario}</td>
                <td data-label="Factura">{r.factura}</td>
                <td className="a-l" data-label="Monto Total">{money(r.montoTotal)}</td>
                <td className="a-l" data-label="Abono">{money(r.abono)}</td>
                <td className="a-l" data-label="CXC">{money(r.cxc)}</td>
                <td
                  className="a-l"
                  data-label="Pendiente"
                  style={desc ? { color: "#c0392b", fontWeight: 600 } : undefined}
                >
                  {money(r.pendiente)}
                </td>
                <td data-label="Método de Pago">{r.metodoPago}</td>
                <td className="muted a-c" data-label="Instalación">{ddmm(r.instalacion)}</td>
              </tr>
            );
          })}
          {rows.length > 0 && (
            <tr className="total-row">
              <td colSpan={4}>Total ({rows.length})</td>
              <td className="a-l">{money(totales.montoTotal)}</td>
              <td className="a-l">{money(totales.abono)}</td>
              <td className="a-l">{money(totales.cxc)}</td>
              <td className="a-l" style={{ color: difColor, fontWeight: 700 }}>
                {money(totales.diferencia)}
              </td>
              <td colSpan={2} className="a-c" style={{ color: difColor, fontWeight: 600 }}>
                {cuadra ? "Cuadra ✓" : "Descuadre"}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function OrdenesView({
  data,
  fechaCorte,
  renderedAt,
}: {
  data: OrdenesData;
  fechaCorte: Date;
  renderedAt?: Date;
}) {
  const [tab, setTab] = useState<Tab>("hoy");
  // Date range picker. Cuando ambos campos están completos, el rango manda y los
  // tabs se desactivan; al pulsar un tab se limpia el rango (y viceversa).
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const rangoActivo = desde !== "" && hasta !== "";

  const vistas: Record<Tab, { vista: OrdenesVista; label: string }> = {
    hoy: { vista: data.hoyVista, label: "Hoy" },
    semana: { vista: data.semanaVista, label: `Semana (${data.rangoSemanaLabel})` },
    mes: { vista: data.mesVista, label: `Mes (${data.mesLabel})` },
  };

  const vistaRangoCalc = useMemo(
    () => vistaRango(data.todas, parseFecha(desde), parseFecha(hasta)),
    [data.todas, desde, hasta],
  );

  const vistaActiva = rangoActivo ? vistaRangoCalc : vistas[tab].vista;

  const elegirTab = (k: Tab) => {
    setDesde("");
    setHasta("");
    setTab(k);
  };
  const limpiarRango = () => {
    setDesde("");
    setHasta("");
    setTab("hoy");
  };

  return (
    <div className="app">
      <Topbar fechaCorte={fechaCorte} renderedAt={renderedAt} active="ordenes" />

      <div className="view">
        <div className="section-label">Órdenes nuevas — reporte diario</div>

        <div className="ord-toolbar">
          <div className="month-tabs">
            {(Object.keys(vistas) as Tab[]).map((k) => (
              <button
                key={k}
                className={`month-tab ${!rangoActivo && k === tab ? "month-tab-active" : ""}`}
                onClick={() => elegirTab(k)}
              >
                {vistas[k].label}
                <span className="ord-count">{vistas[k].vista.rows.length}</span>
              </button>
            ))}
          </div>

          <div className={`ord-range ${rangoActivo ? "ord-range-active" : ""}`}>
            <label className="ord-range-field">
              <span>Desde</span>
              <input
                type="date"
                value={desde}
                max={hasta || undefined}
                onChange={(e) => setDesde(e.target.value)}
              />
            </label>
            <label className="ord-range-field">
              <span>Hasta</span>
              <input
                type="date"
                value={hasta}
                min={desde || undefined}
                onChange={(e) => setHasta(e.target.value)}
              />
            </label>
            {(desde || hasta) && (
              <button
                className="ord-range-clear"
                onClick={limpiarRango}
                aria-label="Limpiar filtro de fechas"
                title="Limpiar filtro de fechas"
              >
                <i className="ti ti-x" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {rangoActivo && (
          <div className="ord-range-note">
            Rango: {diaMesAnio(parseFecha(desde))} — {diaMesAnio(parseFecha(hasta))}
            {" · "}
            {vistaActiva.rows.length}{" "}
            {vistaActiva.rows.length === 1 ? "orden" : "órdenes"}
          </div>
        )}

        <OrdenesTable vista={vistaActiva} />
      </div>
    </div>
  );
}
