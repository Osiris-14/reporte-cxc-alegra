"use client";

import { useState } from "react";
import { Alerta } from "@/lib/alertas";

/**
 * Sección colapsable "Alertas activas". No se renderiza si no hay alertas.
 * Cada alerta lleva su color (rojo/naranja) e ícono.
 */
export default function AlertsSection({ alertas }: { alertas: Alerta[] }) {
  const [abierto, setAbierto] = useState(true);
  if (alertas.length === 0) return null;

  return (
    <div className="alerts-card">
      <button className="alerts-head" onClick={() => setAbierto((a) => !a)}>
        <i className="ti ti-alert-triangle" aria-hidden="true" />
        <span className="alerts-title">Alertas activas</span>
        <span className="alerts-count">{alertas.length}</span>
        <i
          className={`ti ti-chevron-${abierto ? "up" : "down"} alerts-chevron`}
          aria-hidden="true"
        />
      </button>
      {abierto && (
        <div className="alert-stack">
          {alertas.map((a, i) => (
            <div
              key={i}
              className={`alert-line ${a.nivel === "red" ? "alert-red" : "alert-org"}`}
            >
              <span className="alert-ico">{a.nivel === "red" ? "⚠" : "🔔"}</span>
              <span>{a.texto}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
