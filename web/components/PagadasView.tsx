import { Dashboard } from "@/lib/kpis";
import { money } from "@/lib/format";

export default function PagadasView({ dash }: { dash: Dashboard }) {
  return (
    <div className="view">
      <div className="section-label">Histórico — cobros confirmados</div>

      <div className="metric-row metric-row-3">
        <div className="metric">
          <span className="m-lbl">Total cobrado</span>
          <div className="m-num" style={{ color: "#1a7a44" }}>
            {money(dash.pagadasTotal)}
          </div>
          <div className="m-delta" style={{ color: "#999" }}>
            {dash.cobradoCount} instalaciones
          </div>
        </div>
        <div className="metric">
          <span className="m-lbl">Ticket promedio</span>
          <div className="m-num">{money(dash.pagadasTicketProm)}</div>
          <div className="m-delta" style={{ color: "#999" }}>
            por instalación
          </div>
        </div>
        <div className="metric">
          <span className="m-lbl">Mayor cobro</span>
          <div className="m-num">{money(dash.pagadasMayor)}</div>
          <div className="m-delta" style={{ color: "#999" }}>
            {dash.pagadasMayorCliente}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="cdot" style={{ background: "#5bb8d4" }} />
          <span className="card-title">Instalaciones pagadas — INS</span>
          <span className="card-badge p-grn">{dash.pagadas.length}</span>
        </div>
        <table className="tb-full tb-stack">
          <thead>
            <tr>
              <th style={{ width: "22%" }}>Comprobante</th>
              <th style={{ width: "50%" }}>Cliente</th>
              <th className="a-l" style={{ width: "28%" }}>Monto pagado</th>
            </tr>
          </thead>
          <tbody>
            {dash.pagadas.length === 0 && (
              <tr className="empty-row">
                <td colSpan={3}>Sin instalaciones pagadas hoy</td>
              </tr>
            )}
            {dash.pagadas.map((r) => (
              <tr key={r.comprobante}>
                <td data-label="Comprobante">{r.comprobante}</td>
                <td className="client-cell" data-label="Cliente">{r.cliente}</td>
                <td className="a-l" data-label="Monto pagado">{money(r.montoTotal)}</td>
              </tr>
            ))}
            {dash.pagadas.length > 0 && (
              <tr className="total-row">
                <td colSpan={2}>Total cobrado</td>
                <td className="a-l" style={{ color: "#1a7a44" }}>
                  {money(dash.pagadasTotal)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
