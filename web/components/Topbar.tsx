import Link from "next/link";
import { diaMesAnio } from "@/lib/format";

export default function Topbar({
  fechaCorte,
  active = "cxc",
}: {
  fechaCorte: Date;
  active?: "cxc" | "factory";
}) {
  return (
    <div className="topbar">
      <div className="tb-left">
        <div className="logo-dot">
          <i className="ti ti-shield-check" aria-hidden="true" />
        </div>
        <span className="app-name">Rubio Defensas</span>
        <nav className="tb-nav">
          <Link
            href="/cxc"
            className={`tb-navlink ${active === "cxc" ? "tb-navlink-active" : ""}`}
          >
            CXC Monitor
          </Link>
          <Link
            href="/factory"
            className={`tb-navlink ${active === "factory" ? "tb-navlink-active" : ""}`}
          >
            Factory
          </Link>
        </nav>
      </div>
      <div className="tb-right">
        <div className="tb-pill">
          <i className="ti ti-database" style={{ fontSize: 12 }} aria-hidden="true" /> Alegra
        </div>
        <div className="tb-pill" title="Frescura de datos: última corrida del pipeline. Los estados se calculan contra la fecha real (hoy RD).">
          <i className="ti ti-calendar-stats" style={{ fontSize: 12 }} aria-hidden="true" /> Datos al:{" "}
          {diaMesAnio(fechaCorte)}
        </div>
        <div className="avatar">RD</div>
      </div>

      {/* Bottom bar — solo visible en móvil (la nav superior se oculta) */}
      <nav className="bottombar" aria-label="Navegación principal">
        <Link
          href="/cxc"
          className={`bb-link ${active === "cxc" ? "bb-link-active" : ""}`}
        >
          <i className="ti ti-wallet" aria-hidden="true" />
          <span>CXC Monitor</span>
        </Link>
        <Link
          href="/factory"
          className={`bb-link ${active === "factory" ? "bb-link-active" : ""}`}
        >
          <i className="ti ti-building-factory-2" aria-hidden="true" />
          <span>Factory</span>
        </Link>
      </nav>
    </div>
  );
}
