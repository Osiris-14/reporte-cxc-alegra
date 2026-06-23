"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import Topbar from "@/components/Topbar";
import {
  Badge,
  CapitalBrutoTx,
  DeudaTx,
  FactoryData,
  FactoryRow,
  FondoCarryon,
  MesData,
  WeekFactura,
} from "@/lib/factory";
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
      <table className="tb-full tb-stack">
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
              <td data-label="NCF">{r.comprobante}</td>
              <td className="client-cell" data-label="Cliente">{r.cliente}</td>
              <td className="a-l" data-label="Monto pend.">{money(r.montoPendiente)}</td>
              <td className="muted a-c" data-label="Creación">{diaMes(r.fecha)}</td>
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
  onClick,
  expanded,
}: {
  label: string;
  icon: string;
  bg: string;
  color: string;
  num: string | number;
  delta: string;
  numColor?: string;
  onClick?: () => void;
  expanded?: boolean;
}) {
  const clickable = onClick !== undefined;
  return (
    <div
      className={`metric${clickable ? " metric-clickable" : ""}${expanded ? " metric-open" : ""}`}
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      <div className="m-top">
        <span className="m-lbl">
          {clickable && (
            <i
              className={`ti ti-chevron-${expanded ? "down" : "right"}`}
              style={{ fontSize: 11, marginRight: 3, verticalAlign: "middle" }}
              aria-hidden="true"
            />
          )}
          {label}
        </span>
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

function CapitalBrutoDrill({ tx }: { tx: CapitalBrutoTx[] }) {
  const totalValor = tx.reduce((a, t) => a + t.valor, 0);
  const totalAporte = tx.reduce((a, t) => a + t.aporte, 0);
  // tx llega DESCENDENTE; se recorre en ASCENDENTE (suma corriente del Valor)
  // para marcar los ciclos de $1M, y luego se invierte todo para mostrar la
  // tabla descendente con los marcadores en su frontera (igual que Deuda).
  const filas: ReactNode[] = [];
  let acum = 0;
  let ciclos = 0;
  [...tx].reverse().forEach((t, i) => {
    acum += t.valor;
    filas.push(
      <tr key={`tx-${i}`}>
        <td className="muted" data-label="Fecha">{diaMesAnio(t.fecha)}</td>
        <td className="client-cell" data-label="Tercero / Concepto">{t.tercero || "—"}</td>
        <td className="a-l" data-label="Valor">{money(t.valor)}</td>
        <td className="a-l" data-label="Aporte (6% extraído)">{money(t.aporte)}</td>
      </tr>,
    );
    // `while` por si una sola entrada cruza más de un millón de golpe.
    while (Math.floor(acum / CICLO) > ciclos) {
      ciclos += 1;
      filas.push(
        <tr key={`ciclo-${ciclos}`} className="ciclo-row ciclo-row-green">
          <td colSpan={4}>{cicloPagoLabel(ciclos)}</td>
        </tr>,
      );
    }
  });
  filas.reverse(); // mostrar descendente, marcadores ya en su posición
  return (
    <div className="fondo-drill">
      <table className="tb-full drill tb-stack">
        <thead>
          <tr>
            <th style={{ width: "16%" }}>Fecha</th>
            <th style={{ width: "44%" }}>Tercero / Concepto</th>
            <th className="a-l" style={{ width: "20%" }}>Valor</th>
            <th className="a-l" style={{ width: "20%" }}>Aporte (6% extraído)</th>
          </tr>
        </thead>
        <tbody>
          {tx.length === 0 && (
            <tr className="empty-row">
              <td colSpan={4}>Sin entradas desde feb-2026</td>
            </tr>
          )}
          {filas}
          {tx.length > 0 && (
            <tr className="total-row">
              <td colSpan={2}>Total ({tx.length})</td>
              <td className="a-l">{money(totalValor)}</td>
              <td className="a-l">{money(totalAporte)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const CICLO = 1_000_000;
const ORDINALES_CICLO = [
  "Primer", "Segundo", "Tercer", "Cuarto", "Quinto",
  "Sexto", "Séptimo", "Octavo", "Noveno", "Décimo",
];

function cicloLabel(n: number): string {
  const ord = ORDINALES_CICLO[n - 1];
  return ord ? `— ${ord} ciclo —` : `— Ciclo ${n} —`;
}

function cicloPagoLabel(n: number): string {
  const ord = ORDINALES_CICLO[n - 1];
  return ord
    ? `— Pago del ${ord.toLowerCase()} ciclo —`
    : `— Pago del ciclo ${n} —`;
}

function DeudaDrill({ tx }: { tx: DeudaTx[] }) {
  const total = tx.reduce((a, t) => a + t.valor, 0);
  // Los ciclos se calculan en orden ASCENDENTE (suma corriente, separador tras
  // la salida que cruza cada múltiplo de $1M). Luego se invierte la secuencia
  // completa para mostrar la tabla DESCENDENTE (más reciente primero) sin mover
  // los marcadores de su frontera entre transacciones.
  const filas: ReactNode[] = [];
  let acum = 0;
  let ciclos = 0;
  tx.forEach((t, i) => {
    acum += t.valor;
    filas.push(
      <tr key={`tx-${i}`}>
        <td className="muted" data-label="Fecha">{diaMesAnio(t.fecha)}</td>
        <td className="client-cell" data-label="Tercero">{t.tercero || "—"}</td>
        <td className="client-cell" data-label="CuentaContable">{t.cuentaContable || "—"}</td>
        <td className="a-l" data-label="Valor">{money(t.valor)}</td>
      </tr>,
    );
    // `while` por si una sola salida cruza más de un millón de golpe.
    while (Math.floor(acum / CICLO) > ciclos) {
      ciclos += 1;
      filas.push(
        <tr key={`ciclo-${ciclos}`} className="ciclo-row">
          <td colSpan={4}>{cicloLabel(ciclos)}</td>
        </tr>,
      );
    }
  });
  filas.reverse(); // mostrar descendente, marcadores ya en su posición
  return (
    <div className="fondo-drill">
      <table className="tb-full drill tb-stack">
        <thead>
          <tr>
            <th style={{ width: "16%" }}>Fecha</th>
            <th style={{ width: "38%" }}>Tercero</th>
            <th style={{ width: "28%" }}>CuentaContable</th>
            <th className="a-l" style={{ width: "18%" }}>Valor</th>
          </tr>
        </thead>
        <tbody>
          {tx.length === 0 && (
            <tr className="empty-row">
              <td colSpan={4}>Sin salidas desde feb-2026</td>
            </tr>
          )}
          {filas}
          {tx.length > 0 && (
            <tr className="total-row">
              <td colSpan={3}>Total ({tx.length})</td>
              <td className="a-l">{money(total)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function FondoCarryonBox({ fondo }: { fondo: FondoCarryon }) {
  const dispNeg = fondo.disponible < 0;
  const [abierta, setAbierta] = useState<"bruto" | "deuda" | null>(null);
  const toggle = (k: "bruto" | "deuda") =>
    setAbierta((a) => (a === k ? null : k));
  return (
    <div className="fondo-box">
      <div className="fondo-title">
        <i className="ti ti-building-bank" aria-hidden="true" />
        Fondo Carryon
      </div>
      <div className="metric-row">
        <MetricCard
          label="Capital Neto"
          icon="ti-wallet"
          bg="#f0eeff"
          color="#534AB7"
          num={money(fondo.capitalNeto)}
          delta=""
        />
        <MetricCard
          label="Capital Bruto"
          icon="ti-trending-up"
          bg="#eafaf0"
          color="#1a7a44"
          num={money(fondo.capitalBruto)}
          delta=""
          onClick={() => toggle("bruto")}
          expanded={abierta === "bruto"}
        />
        <MetricCard
          label="Deuda"
          icon="ti-arrow-down-right"
          bg="#fdecec"
          color="#c0392b"
          num={money(fondo.deuda)}
          delta=""
          onClick={() => toggle("deuda")}
          expanded={abierta === "deuda"}
        />
        <MetricCard
          label="Disponible"
          icon="ti-cash"
          bg={dispNeg ? "#fdecec" : "#e9f4f8"}
          color={dispNeg ? "#c0392b" : "#2a7d96"}
          numColor={dispNeg ? "#e05252" : undefined}
          num={money(fondo.disponible)}
          delta=""
        />
      </div>
      {abierta === "bruto" && <CapitalBrutoDrill tx={fondo.capitalBrutoTx} />}
      {abierta === "deuda" && <DeudaDrill tx={fondo.deudaTx} />}
    </div>
  );
}

function DrilldownRow({ facturas }: { facturas: WeekFactura[] }) {
  return (
    <tr className="drill-row">
      <td colSpan={7} style={{ padding: 0 }}>
        <table className="tb-full drill tb-stack">
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
            {facturas.map((f) => (
              <tr key={f.comprobante}>
                <td data-label="NCF">{f.comprobante}</td>
                <td className="client-cell" data-label="Cliente">{f.cliente}</td>
                <td className="a-l" data-label="Monto esperado">{money(f.montoApertura)}</td>
                <td className="a-l" data-label="He recibido">{money(f.heRecibido)}</td>
                <td className="a-l" data-label="Pendiente">{money(f.pendiente)}</td>
                <td className="a-c" data-label="¿Pagó?">
                  <span className={`fb ${f.pago ? "fb-g" : "fb-r"}`}>
                    {f.pago ? "Sí" : "No"}
                  </span>
                </td>
                <td className="muted a-c" data-label="Se vence en">{diaMesAnio(f.vence)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </td>
    </tr>
  );
}

function matchFactura(f: WeekFactura, q: string): boolean {
  return (
    f.comprobante.toLowerCase().includes(q) ||
    f.cliente.toLowerCase().includes(q)
  );
}

function MonthlyTable({ mesData, query }: { mesData: MesData; query: string }) {
  const t = mesData.total;
  const [abierta, setAbierta] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  // En búsqueda: cada semana se reduce a sus facturas coincidentes y las
  // semanas sin coincidencias se omiten.
  const semanasVista = searching
    ? mesData.semanas
        .map((w) => ({ w, facturas: w.facturas.filter((f) => matchFactura(f, q)) }))
        .filter((x) => x.facturas.length > 0)
    : [];

  return (
    <div className="card">
      <table className="tb-full tb-stack tb-stack-month">
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
        {searching ? (
          <tbody>
            {semanasVista.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={7}>Sin resultados</td>
              </tr>
            ) : (
              semanasVista.map(({ w, facturas }) => (
                <Fragment key={w.label}>
                  <tr className="week-row week-open">
                    <td data-label="Semana">
                      <b>{w.label}</b> <span className="muted">{w.rango}</span>
                    </td>
                    <td className="muted a-c" colSpan={6}>
                      {facturas.length}{" "}
                      {facturas.length === 1 ? "resultado" : "resultados"}
                    </td>
                  </tr>
                  <DrilldownRow facturas={facturas} />
                </Fragment>
              ))
            )}
          </tbody>
        ) : (
        <tbody>
          {mesData.semanas.map((w) =>
            w.vacia ? (
              <tr key={w.label}>
                <td data-label="Semana">
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
                  <td data-label="Semana">
                    <i
                      className={`ti ti-chevron-${abierta === w.label ? "down" : "right"}`}
                      style={{ fontSize: 12, marginRight: 4, verticalAlign: "middle" }}
                      aria-hidden="true"
                    />
                    <b>{w.label}</b> <span className="muted">{w.rango}</span>
                  </td>
                  <td className="a-c" data-label="Entraron">{w.entraron}</td>
                  <td className="a-c" data-label="Han pagado">
                    <span className={`fb ${badgeClass(w.hanPagadoBadge)}`}>
                      {w.hanPagado}/{w.entraron} · {w.hanPagadoPct}%
                    </span>
                  </td>
                  <td className="a-l" data-label="Entregué">{money(w.entregue)}</td>
                  <td className="a-l" data-label="He recibido">{money(w.recibido)}</td>
                  <td className="a-l" data-label="Pendiente">
                    <span className={`fb ${badgeClass(w.pendienteBadge)}`}>
                      {money(w.pendiente)}
                    </span>
                  </td>
                  <td className="a-c" data-label="Se vencen en">
                    <span className={`fb ${badgeClass(w.vencenBadge)}`}>
                      {w.vencenRango}
                    </span>
                  </td>
                </tr>
                {abierta === w.label && <DrilldownRow facturas={w.facturas} />}
              </>
            ),
          )}
          <tr className="total-row">
            <td data-label="Semana">Total del mes</td>
            <td className="a-c" data-label="Entraron">{t.entraron}</td>
            <td className="a-c" data-label="Han pagado">
              <span className={`fb ${badgeClass(t.hanPagadoBadge)}`}>
                {t.hanPagado}/{t.entraron} · {t.hanPagadoPct}%
              </span>
            </td>
            <td className="a-l" data-label="Entregué">{money(t.entregue)}</td>
            <td className="a-l" data-label="He recibido">{money(t.recibido)}</td>
            <td className="a-l" data-label="Pendiente">
              <span className={`fb ${badgeClass(t.pendienteBadge)}`}>
                {money(t.pendiente)}
              </span>
            </td>
            <td />
          </tr>
        </tbody>
        )}
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
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  // La búsqueda abarca TODO el año: al escribir, saltar al tab del mes con más
  // coincidencias (empate -> el más reciente). Si no hay coincidencias en ningún
  // mes, se queda en el mes actual (que mostrará "Sin resultados"). Cuando no se
  // busca, los tabs siguen siendo manuales.
  useEffect(() => {
    if (!q) return;
    let bestMes = -1;
    let bestCount = 0;
    data.meses.forEach((md, m) => {
      let count = 0;
      for (const w of md.semanas) {
        for (const f of w.facturas) if (matchFactura(f, q)) count++;
      }
      // `>=` con recorrido ascendente: ante empate gana el mes más reciente.
      if (count > 0 && count >= bestCount) {
        bestCount = count;
        bestMes = m;
      }
    });
    if (bestMes >= 0) setMes(bestMes);
  }, [q, data.meses]);

  const mesData = data.meses[mes];

  return (
    <div className="app">
      <Topbar fechaCorte={fechaCorte} active="factory" />

      <div className="view">
        {/* Fondo Carryon — recuadro superior */}
        <FondoCarryonBox fondo={data.fondo} />

        {/* Sección 1 — cards */}
        <div className="section-label">Producción — aperturas de facturas</div>
        <div className="metric-row">
          <MetricCard
            label="Aperturas hoy"
            icon="ti-package"
            bg="#eafaf0"
            color="#1a7a44"
            num={data.aperturasHoyCount}
            delta={`${money(data.aperturasHoyMonto)} esperado`}
          />
          <MetricCard
            label="Aperturas esta semana"
            icon="ti-calendar-week"
            bg="#e9f4f8"
            color="#2a7d96"
            num={data.aperturasSemanaCount}
            delta={`${money(data.aperturasSemanaMonto)} esperado`}
          />
          <MetricCard
            label="Total a entregar sábado"
            icon="ti-truck-delivery"
            bg="#fff6e0"
            color="#b7770a"
            numColor="#b7770a"
            num={money(data.totalEntregarSabado)}
            delta="monto esperado de la semana"
          />
          <MetricCard
            label={`Aperturas este mes (${MESES_LARGOS[mes]})`}
            icon="ti-calendar-month"
            bg="#f0eeff"
            color="#534AB7"
            numColor="#534AB7"
            num={mesData.total.entraron}
            delta={`${money(mesData.total.entregue)} esperado`}
          />
        </div>

        {/* Sección 2 — dos tablas */}
        <div className="two-col two-col-even">
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
        <div className="fac-search">
          <i className="ti ti-search" aria-hidden="true" />
          <input
            type="text"
            placeholder="Buscar por NCF o cliente..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              className="fac-clear"
              onClick={() => setQuery("")}
              aria-label="Limpiar búsqueda"
            >
              <i className="ti ti-x" aria-hidden="true" />
            </button>
          )}
        </div>
        <MonthlyTable mesData={mesData} query={query} />
      </div>
    </div>
  );
}
