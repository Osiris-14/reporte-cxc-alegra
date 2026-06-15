import { Dashboard, TableRow } from "@/lib/kpis";
import { money, diaMes } from "@/lib/format";

function Total({ value, span, extra }: { value: string; span: number; extra?: number }) {
  return (
    <tr className="total-row">
      <td colSpan={span}>Total</td>
      <td className="a-l">{value}</td>
      {extra ? <td colSpan={extra} /> : null}
    </tr>
  );
}

function Empty({ cols }: { cols: number }) {
  return (
    <tr className="empty-row">
      <td colSpan={cols}>Sin registros para hoy</td>
    </tr>
  );
}

export default function CobranzaView({ dash }: { dash: Dashboard }) {
  const totalHoy = dash.instHoy.reduce((a, r) => a + r.montoPendiente, 0);
  const totalSemana = dash.instSemana.reduce((a, r) => a + r.montoPendiente, 0);
  const totalReag = dash.reagendadas.reduce((a, r) => a + r.montoPendiente, 0);

  return (
    <div className="view">
      <div className="section-label">Lo que entra — instalaciones por cobrar</div>

      {/* Instalaciones de hoy — I01 */}
      <div className="card">
        <div className="card-head">
          <div className="cdot" style={{ background: "#3aa76d" }} />
          <span className="card-title">Instalaciones de hoy — I01</span>
          <span className="card-badge p-grn">{dash.instHoy.length}</span>
        </div>
        <table className="tb-full">
          <thead>
            <tr>
              <th style={{ width: "22%" }}>Comprobante</th>
              <th style={{ width: "48%" }}>Cliente</th>
              <th className="a-l" style={{ width: "30%" }}>Monto a cobrar</th>
            </tr>
          </thead>
          <tbody>
            {dash.instHoy.length === 0 && <Empty cols={3} />}
            {dash.instHoy.map((r) => (
              <tr key={r.comprobante}>
                <td>{r.comprobante}</td>
                <td className="client-cell">{r.cliente}</td>
                <td className="a-l">{money(r.montoPendiente)}</td>
              </tr>
            ))}
            {dash.instHoy.length > 0 && <Total value={money(totalHoy)} span={2} />}
          </tbody>
        </table>
      </div>

      {/* Instalaciones de la semana — IS2 */}
      <div className="card">
        <div className="card-head">
          <div className="cdot" style={{ background: "#e6a817" }} />
          <span className="card-title">Instalaciones de la semana — IS2</span>
          <span className="card-badge p-amb">{dash.instSemana.length}</span>
        </div>
        <table className="tb-full">
          <thead>
            <tr>
              <th style={{ width: "22%" }}>Comprobante</th>
              <th style={{ width: "43%" }}>Cliente</th>
              <th className="a-l" style={{ width: "23%" }}>Monto pendiente</th>
              <th style={{ width: "12%", textAlign: "center" }}>Día</th>
            </tr>
          </thead>
          <tbody>
            {dash.instSemana.length === 0 && <Empty cols={4} />}
            {dash.instSemana.map((r) => (
              <tr key={r.comprobante}>
                <td>{r.comprobante}</td>
                <td className="client-cell">{r.cliente}</td>
                <td className="a-l">{money(r.montoPendiente)}</td>
                <td style={{ textAlign: "center" }}>
                  {r.fechaVencimiento ? r.fechaVencimiento.getUTCDate() : "—"}
                </td>
              </tr>
            ))}
            {dash.instSemana.length > 0 && (
              <Total value={money(totalSemana)} span={2} extra={1} />
            )}
          </tbody>
        </table>
      </div>

      {/* Reagendadas — R1 */}
      <div className="card">
        <div className="card-head">
          <div className="cdot" style={{ background: "#7b68cc" }} />
          <span className="card-title">Reagendadas — R1</span>
          <span className="card-badge" style={{ background: "#f0eeff", color: "#534AB7" }}>
            {dash.reagendadas.length}
          </span>
        </div>
        <table className="tb-full">
          <thead>
            <tr>
              <th style={{ width: "18%" }}>NCF</th>
              <th style={{ width: "27%" }}>Cliente</th>
              <th className="a-l" style={{ width: "20%" }}>Monto pend.</th>
              <th className="a-c" style={{ width: "15%" }}>Fecha 0</th>
              <th className="a-c" style={{ width: "20%" }}>Reagendamiento</th>
            </tr>
          </thead>
          <tbody>
            {dash.reagendadas.length === 0 && <Empty cols={5} />}
            {dash.reagendadas.map((r: TableRow) => (
              <tr key={r.comprobante}>
                <td>{r.comprobante}</td>
                <td className="client-cell">{r.cliente}</td>
                <td className="a-l">{money(r.montoPendiente)}</td>
                <td className="muted a-c">{diaMes(r.fechaVencimiento)}</td>
                <td className="a-c">
                  <span className={`pill ${r.reagClass}`}>
                    {diaMes(r.fechaReagendamiento)}
                  </span>
                </td>
              </tr>
            ))}
            {dash.reagendadas.length > 0 && (
              <Total value={money(totalReag)} span={2} extra={2} />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
