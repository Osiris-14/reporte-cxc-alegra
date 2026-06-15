import { Dashboard } from "@/lib/kpis";
import { money, diaMesAnio } from "@/lib/format";

function Empty({ cols }: { cols: number }) {
  return (
    <tr className="empty-row">
      <td colSpan={cols}>Sin cuentas en esta categoría</td>
    </tr>
  );
}

export default function MoraView({ dash }: { dash: Dashboard }) {
  const totalVencido = dash.vencidas.reduce((a, r) => a + r.montoPendiente, 0);
  const totalAtrasado = dash.atrasadas.reduce((a, r) => a + r.montoPendiente, 0);

  return (
    <div className="view">
      <div className="section-label">Lo problemático — cuentas en mora</div>

      {/* Vencidas — V06 */}
      <div className="card">
        <div className="card-head">
          <div className="cdot" style={{ background: "#e05252" }} />
          <span className="card-title">Vencidas — V06</span>
          <span className="card-badge p-red">{dash.vencidas.length}</span>
        </div>
        <table className="tb-full tb-stack">
          <thead>
            <tr>
              <th style={{ width: "17%" }}>Comprobante</th>
              <th style={{ width: "25%" }}>Cliente</th>
              <th className="a-c" style={{ width: "20%" }}>Fecha 0</th>
              <th className="a-c" style={{ width: "20%" }}>Reagendamiento</th>
              <th className="a-l" style={{ width: "18%" }}>Monto atraso</th>
            </tr>
          </thead>
          <tbody>
            {dash.vencidas.length === 0 && <Empty cols={5} />}
            {dash.vencidas.map((r, i) => (
              <tr key={r.comprobante}>
                <td data-label="Comprobante">{r.comprobante}</td>
                <td className="client-cell" data-label="Cliente">{r.cliente}</td>
                <td className="muted a-c" data-label="Fecha 0">{diaMesAnio(r.fechaVencimiento)}</td>
                <td className="muted a-c" data-label="Reagendamiento">{diaMesAnio(r.fechaReagendamiento)}</td>
                <td
                  className="a-l"
                  data-label="Monto atraso"
                  style={i === 0 ? { color: "#c0392b", fontWeight: 600 } : undefined}
                >
                  {money(r.montoPendiente)}
                </td>
              </tr>
            ))}
            {dash.vencidas.length > 0 && (
              <tr className="total-row">
                <td colSpan={4}>Total vencido</td>
                <td className="a-l">{money(totalVencido)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Atrasadas — A01 */}
      <div className="card">
        <div className="card-head">
          <div className="cdot" style={{ background: "#2b2b2b" }} />
          <span className="card-title">Atrasadas — A01</span>
          <span className="card-badge" style={{ background: "#eee", color: "#333" }}>
            {dash.atrasadas.length}
          </span>
        </div>
        <table className="tb-full tb-stack">
          <thead>
            <tr>
              <th style={{ width: "18%" }}>NCF</th>
              <th style={{ width: "40%" }}>Cliente</th>
              <th className="a-l" style={{ width: "22%" }}>Monto pend.</th>
              <th className="a-c" style={{ width: "20%" }}>Fecha 0</th>
            </tr>
          </thead>
          <tbody>
            {dash.atrasadas.length === 0 && <Empty cols={4} />}
            {dash.atrasadas.map((r) => (
              <tr key={r.comprobante}>
                <td data-label="NCF">{r.comprobante}</td>
                <td className="client-cell" data-label="Cliente">{r.cliente}</td>
                <td className="a-l" data-label="Monto pend.">{money(r.montoPendiente)}</td>
                <td className="muted a-c" data-label="Fecha 0">{diaMesAnio(r.fechaVencimiento)}</td>
              </tr>
            ))}
            {dash.atrasadas.length > 0 && (
              <tr className="total-row">
                <td colSpan={2}>Total atrasado</td>
                <td className="a-l">{money(totalAtrasado)}</td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
