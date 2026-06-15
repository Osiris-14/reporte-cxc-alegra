"use client";

import { useState } from "react";
import Topbar from "@/components/Topbar";
import { Badge, FactoryData, FactoryRow, MesData, WeekRow } from "@/lib/factory";
import { money, diaMes, diaMesAnio, MESES_LARGOS } from "@/lib/format";

function badgeClass(b: Badge): string {
  return b === "g" ? "fb-g" : b === "y" ? "fb-y" : b === "r" ? "fb-r" : "fb-gray";
}

function AperturasTable({
  title,
  color,
  rows,
}: {
  title: string;
  color: string;
  rows: FactoryRow[];
}) {
  const total = rows.reduce((a, r) => a + r.montoPendiente, 0);
  return (
    <div className="card">
      <div className="card-head">
        <div className="cdot" style={{ background: color }} />
        <span className="card-title">{title}</span>
        <span className="card-badge p-grn">{rows.length}</span>
      </div>
      <table className="tb-full">
        <thead>
          <tr>
            <th style={{ width: "26%" }}>NCF</th>
            <th style={{ width: "38%" }}>Cliente</th>
            <th className="a-l" style={{ width: "21%" }}>Monto pend.</th>
            <th className="a-c" style={{ width: "15%" }}>Creación</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr className="empty-row">
              <td colSpan={4}>Sin aperturas activas</td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.comprobante}>
              <td>{r.comprobante}</td>
              <td className="client-cell">{r.cliente}</td>
              <td className="a-l">{money(r.montoPendiente)}</td>
              <td className="muted a-c">{diaMes(r.fecha)}</td>
            </tr>
          ))}
          {rows.length > 0 && (
            <tr className="total-row">
              <td colSpan={2}>Total</td>
              <td className="a-l">{money(total)}</td>
              <td />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function MetricCard({
  label,
  icon,
  bg,
  color,
  num,
  delta,
  numColor,
}: {
  label: string;
  icon: string;
  bg: string;
  color: string;
  num: string | number;
  delta: string;
  numColor?: string;
}) {
  return (
    <div className="metric">
      <div className="m-top">
        <span className="m-lbl">{label}</span>
        <div className="m-ico" style={{ background: bg, color }}>
          <i className={`ti ${icon}`} aria-hidden="true" />
        </div>
      </div>
      <div className="m-num" style={numColor ? { color: numColor } : undefined}>
        {num}
      </div>
      <div className="m-delta" style={{ color: "#999" }}>
        {delta}
      </div>
    </div>
  );
}

function DrilldownRow({ w }: { w: WeekRow }) {
  return (
    <tr className="drill-row">
      <td colSpan={7} style={{ padding: 0 }}>
        <table className="tb-full drill">
          <thead>
            <tr>
              <th style={{ width: "16%" }}>NCF</th>
              <th style={{ width: "26%" }}>Cliente</th>
              <th className="a-l" style={{ width: "14%" }}>Monto esperado</th>
              <th className="a-l" style={{ width: "13%" }}>He recibido</th>
              <th className="a-l" style={{ width: "13%" }}>Pendiente</th>
              <th className="a-c" style={{ width: "8%" }}>¿Pagó?</th>
              <th className="a-c" style={{ width: "10%" }}>Se vence en</th>
            </tr>
          </thead>
          <tbody>
            {w.facturas.map((f) => (
              <tr key={f.comprobante}>
                <td>{f.comprobante}</td>
                <td className="client-cell">{f.cliente}</td>
                <td className="a-l">{money(f.montoApertura)}</td>
                <td className="a-l">{money(f.heRecibido)}</td>
                <td className="a-l">{money(f.pendiente)}</td>
                <td className="a-c">
                  <span className={`fb ${f.pago ? "fb-g" : "fb-r"}`}>
                    {f.pago ? "Sí" : "No"}
                  </span>
                </td>
                <td className="muted a-c">{diaMesAnio(f.vence)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </td>
    </tr>
  );
}

function MonthlyTable({ mesData }: { mesData: MesData }) {
  const t = mesData.total;
  const [abierta, setAbierta] = useState<string | null>(null);

  return (
    <div className="card">
      <table className="tb-full">
        <thead>
          <tr>
            <th style={{ width: "18%" }}>Semana</th>
            <th className="a-c" style={{ width: "9%" }}>Entraron</th>
            <th className="a-c" style={{ width: "15%" }}>Han pagado</th>
            <th className="a-l" style={{ width: "16%" }}>Entregué</th>
            <th className="a-l" style={{ width: "16%" }}>He recibido</th>
            <th className="a-l" style={{ width: "13%" }}>Pendiente</th>
            <th className="a-c" style={{ width: "13%" }}>Se vencen en</th>
          </tr>
        </thead>
        <tbody>
          {mesData.semanas.map((w) =>
            w.vacia ? (
              <tr key={w.label}>
                <td>
                  <b>{w.label}</b> <span className="muted">{w.rango}</span>
                </td>
                <td className="muted a-c" colSpan={6}>
                  --
                </td>
              </tr>
            ) : (
              <>
                <tr
                  key={w.label}
                  className={`week-row ${abierta === w.label ? "week-open" : ""}`}
                  onClick={() =>
                    setAbierta((a) => (a === w.label ? null : w.label))
                  }
                >
                  <td>
                    <i
                      className={`ti ti-chevron-${abierta === w.label ? "down" : "right"}`}
                      style={{ fontSize: 12, marginRight: 4, verticalAlign: "middle" }}
                      aria-hidden="true"
                    />
                    <b>{w.label}</b> <span className="muted">{w.rango}</span>
                  </td>
                  <td className="a-c">{w.entraron}</td>
                  <td className="a-c">
                    <span className={`fb ${badgeClass(w.hanPagadoBadge)}`}>
                      {w.hanPagado}/{w.entraron} · {w.hanPagadoPct}%
                    </span>
                  </td>
                  <td className="a-l">{money(w.entregue)}</td>
                  <td className="a-l">{money(w.recibido)}</td>
                  <td className="a-l">
                    <span className={`fb ${badgeClass(w.pendienteBadge)}`}>
                      {money(w.pendiente)}
                    </span>
                  </td>
                  <td className="a-c">
                    <span className={`fb ${badgeClass(w.vencenBadge)}`}>
                      {w.vencenRango}
                    </span>
                  </td>
                </tr>
                {abierta === w.label && <DrilldownRow w={w} />}
              </>
            ),
          )}
          <tr className="total-row">
            <td>Total del mes</td>
            <td className="a-c">{t.entraron}</td>
            <td className="a-c">
              <span className={`fb ${badgeClass(t.hanPagadoBadge)}`}>
                {t.hanPagado}/{t.entraron} · {t.hanPagadoPct}%
              </span>
            </td>
            <td className="a-l">{money(t.entregue)}</td>
            <td className="a-l">{money(t.recibido)}</td>
            <td className="a-l">
              <span className={`fb ${badgeClass(t.pendienteBadge)}`}>
                {money(t.pendiente)}
              </span>
            </td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function FactoryView({
  data,
  fechaCorte,
}: {
  data: FactoryData;
  fechaCorte: Date;
}) {
  const [mes, setMes] = useState(data.mesActual);
  const mesData = data.meses[mes];

  return (
    <div className="app">
      <Topbar fechaCorte={fechaCorte} active="factory" />

      <div className="view">
        {/* Sección 1 — cards */}
        <div className="section-label">Producción — aperturas de facturas</div>
        <div className="metric-row">
          <MetricCard
            label="Aperturas hoy"
            icon="ti-package"
            bg="#eafaf0"
            color="#1a7a44"
            num={data.aperturasHoyCount}
            delta={`${money(data.aperturasHoyMonto)} pendiente`}
          />
          <MetricCard
            label="Aperturas esta semana"
            icon="ti-calendar-week"
            bg="#e9f4f8"
            color="#2a7d96"
            num={data.aperturasSemanaCount}
            delta={`${money(data.aperturasSemanaMonto)} pendiente`}
          />
          <MetricCard
            label="Total a entregar sábado"
            icon="ti-truck-delivery"
            bg="#fff6e0"
            color="#b7770a"
            numColor="#b7770a"
            num={money(data.totalEntregarSabado)}
            delta="balance pendiente de la semana"
          />
          <MetricCard
            label={`Aperturas este mes (${MESES_LARGOS[mes]})`}
            icon="ti-calendar-month"
            bg="#f0eeff"
            color="#534AB7"
            numColor="#534AB7"
            num={mesData.total.entraron}
            delta={`${money(mesData.total.entregue)} pendiente`}
          />
        </div>

        {/* Sección 2 — dos tablas */}
        <div className="two-col" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <AperturasTable title="Aperturas de hoy" color="#3aa76d" rows={data.tablaHoy} />
          <AperturasTable
            title="Aperturas esta semana"
            color="#5bb8d4"
            rows={data.tablaSemana}
          />
        </div>

        {/* Sección 3 — seguimiento mensual por semana */}
        <div className="section-label">Seguimiento mensual por semana</div>
        <div className="month-tabs">
          {MESES_LARGOS.map((nombre, i) => (
            <button
              key={i}
              className={`month-tab ${i === mes ? "month-tab-active" : ""}`}
              onClick={() => setMes(i)}
            >
              {nombre}
            </button>
          ))}
        </div>
        <MonthlyTable mesData={mesData} />
      </div>
    </div>
  );
}
