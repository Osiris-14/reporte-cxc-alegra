import Link from "next/link";
import { diaMesAnio, horaRD } from "@/lib/format";

export default function Topbar({
  fechaCorte,
  renderedAt,
  active = "cxc",
}: {
  fechaCorte: Date;
  /** Momento en que el server renderizó la página (new Date()); se muestra como
   *  hora de última actualización junto a la fecha de los datos. */
  renderedAt?: Date;
  active?: "cxc" | "factory" | "ordenes";
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
          <Link
            href="/ordenes"
            className={`tb-navlink ${active === "ordenes" ? "tb-navlink-active" : ""}`}
          >
            Órdenes
          </Link>
        </nav>
      </div>
      <div className="tb-right">
        <div className="tb-pill">
          <i className="ti ti-database" style={{ fontSize: 12 }} aria-hidden="true" /> Alegra
        </div>
        <div className="tb-pill" title="Frescura de datos: fecha = MAX(Fecha) del CSV (última corrida del pipeline); hora = momento en que se renderizó esta página (RD). Los estados se calculan contra la fecha real (hoy RD).">
          <i className="ti ti-calendar-stats" style={{ fontSize: 12 }} aria-hidden="true" /> Datos al:{" "}
          {diaMesAnio(fechaCorte)}
          {renderedAt && ` · ${horaRD(renderedAt)}`}
        </div>
        <div className="avatar">RD</div>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="tb-logout" title="Cerrar sesión">
            <i className="ti ti-logout" style={{ fontSize: 14 }} aria-hidden="true" />
            <span className="tb-logout-txt">Salir</span>
          </button>
        </form>
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
        <Link
          href="/ordenes"
          className={`bb-link ${active === "ordenes" ? "bb-link-active" : ""}`}
        >
          <i className="ti ti-clipboard-list" aria-hidden="true" />
          <span>Órdenes</span>
        </Link>
      </nav>
    </div>
  );
}
