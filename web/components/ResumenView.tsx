import { Dashboard } from "@/lib/kpis";
import { money, diaMesAnio } from "@/lib/format";

/** Donut SVG calculado a partir de los slices (circunferencia r=36 → ~226.2). */
function DonutSvg({ dash }: { dash: Dashboard }) {
  const C = 2 * Math.PI * 36;
  let offset = 0;
  const segs = dash.donut
    .filter((s) => s.count > 0)
    .map((s) => {
      const len = dash.donutTotal > 0 ? (s.count / dash.donutTotal) * C : 0;
      const seg = (
        <circle
          key={s.label}
          cx="50"
          cy="50"
          r="36"
          fill="none"
          stroke={s.color}
          strokeWidth="14"
          strokeDasharray={`${len} ${C - len}`}
          strokeDashoffset={-offset}
          transform="rotate(-90 50 50)"
        />
      );
      offset += len;
      return seg;
    });
  return (
    <svg width="96" height="96" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="36" fill="none" stroke="#f0f0f0" strokeWidth="14" />
      {segs}
      <text x="50" y="46" textAnchor="middle" fontSize="13" fontWeight="600" fill="#111">
        {dash.donutTotal}
      </text>
      <text x="50" y="58" textAnchor="middle" fontSize="9" fill="#aaa">
        casos
      </text>
    </svg>
  );
}

export default function ResumenView({
  dash,
  onTab,
}: {
  dash: Dashboard;
  onTab: (n: number) => void;
}) {
  return (
    <div className="view">
      <div className="section-label">Indicadores de cartera</div>
      <div className="metric-row">
        <div className="metric">
          <div className="m-top">
            <span className="m-lbl">Cartera total</span>
            <div className="m-ico" style={{ background: "#fdecec", color: "#c0392b" }}>
              <i className="ti ti-wallet" aria-hidden="true" />
            </div>
          </div>
          <div className="m-num">{money(dash.carteraTotal)}</div>
          <div className="m-delta" style={{ color: "#999" }}>
            por cobrar · {dash.carteraComprobantes} comprobantes
          </div>
        </div>

        <div className="metric">
          <div className="m-top">
            <span className="m-lbl">Cobrado</span>
            <div className="m-ico" style={{ background: "#eafaf0", color: "#1a7a44" }}>
              <i className="ti ti-trending-up" aria-hidden="true" />
            </div>
          </div>
          <div className="m-num" style={{ color: "#1a7a44" }}>
            {money(dash.cobrado)}
          </div>
          <div className="m-delta" style={{ color: "#999" }}>
            {dash.cobradoCount} instalaciones pagadas
          </div>
        </div>

        <div className="metric">
          <div className="m-top">
            <span className="m-lbl">Días prom. atraso</span>
            <div className="m-ico" style={{ background: "#fff6e0", color: "#b7770a" }}>
              <i className="ti ti-clock" aria-hidden="true" />
            </div>
          </div>
          <div className="m-num" style={{ color: "#b7770a" }}>
            {dash.diasPromAtraso}
          </div>
          <div className="m-delta" style={{ color: "#999" }}>
            días promedio en mora
          </div>
        </div>

        <div className="metric">
          <div className="m-top">
            <span className="m-lbl">Concentración top deudor</span>
            <div className="m-ico" style={{ background: "#f0eeff", color: "#534AB7" }}>
              <i className="ti ti-user-exclamation" aria-hidden="true" />
            </div>
          </div>
          <div className="m-num" style={{ color: "#534AB7" }}>
            {dash.concentracionPct}%
          </div>
          <div className="m-delta" style={{ color: "#999" }}>
            {dash.topDeudorNombre}
          </div>
        </div>
      </div>

      {dash.alertasReag.length > 0 && (
        <div className="alert-stack">
          {dash.alertasReag.map((a, i) => (
            <div
              key={i}
              className={`alert-line ${a.nivel === "vencido" ? "alert-red" : "alert-org"}`}
            >
              {a.nivel === "vencido" ? (
                <span>
                  ⚠ <span className="who">{a.cliente}</span> — reagendado vencido
                  desde {diaMesAnio(a.fecha)}
                </span>
              ) : (
                <span>
                  🔔 <span className="who">{a.cliente}</span> — reagendamiento
                  vence HOY
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="section-label">Estados (clic para ver detalle)</div>
      <div className="status-row">
        {dash.pills.map((p) => (
          <button
            key={p.tag}
            className={`spill ${p.colorClass}`}
            onClick={() => onTab(p.goTo)}
          >
            <span className="sp-tag">{p.tag}</span>
            <span className="sp-num">{p.count}</span>
            <span className="sp-amt">{money(p.monto)}</span>
          </button>
        ))}
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-head">
            <div className="cdot" style={{ background: "#e05252" }} />
            <span className="card-title">Antigüedad de la deuda (aging)</span>
          </div>
          <div className="aging">
            {dash.aging.map((b) => (
              <div className="age-row" key={b.label}>
                <div className="age-meta">
                  <span className="lbl">{b.label}</span>
                  <span className="val">
                    {money(b.monto)} · {b.pct}%
                  </span>
                </div>
                <div className="age-track">
                  <div
                    className="age-fill"
                    style={{ width: `${b.width}%`, background: b.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card donut-card">
          <div className="card-title" style={{ alignSelf: "flex-start" }}>
            Peso por estado
          </div>
          <DonutSvg dash={dash} />
          <div className="leg">
            {dash.donut.map((s) => (
              <div className="leg-i" key={s.label}>
                <div className="leg-d" style={{ background: s.color }} />
                {s.label}
                <span className="v">{s.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {dash.alerta && (
        <div className="alert-box">
          <i className="ti ti-alert-triangle" aria-hidden="true" />
          <div className="alert-txt">
            <b>Riesgo de concentración:</b> el {dash.alerta.pctCarteraVencida}% de la
            cartera vencida ({money(dash.alerta.topDeudorMonto)}) está en un solo
            cliente — {dash.alerta.topDeudorNombre} — con {dash.alerta.diasAtraso} días
            de atraso desde el {diaMesAnio(dash.alerta.fecha0)}. Priorizar gestión de
            cobro.
          </div>
        </div>
      )}
    </div>
  );
}
