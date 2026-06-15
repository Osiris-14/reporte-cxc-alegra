"use client";

import { useState } from "react";
import { Dashboard as DashboardData } from "@/lib/kpis";
import Topbar from "@/components/Topbar";
import ResumenView from "@/components/ResumenView";
import CobranzaView from "@/components/CobranzaView";
import MoraView from "@/components/MoraView";
import PagadasView from "@/components/PagadasView";

const TABS = [
  { label: "Resumen", icon: "ti-layout-dashboard" },
  { label: "Cobranza activa", icon: "ti-cash" },
  { label: "Mora", icon: "ti-alert-triangle" },
  { label: "Pagadas", icon: "ti-circle-check" },
];

export default function Dashboard({
  dash,
  fechaCorte,
}: {
  dash: DashboardData;
  fechaCorte: Date;
}) {
  const [tab, setTab] = useState(0);

  return (
    <div className="app">
      <Topbar fechaCorte={fechaCorte} active="cxc" />

      <div className="tabbar">
        {TABS.map((t, i) => (
          <button
            key={t.label}
            className={`tab ${i === tab ? "tab-active" : ""}`}
            onClick={() => setTab(i)}
          >
            <i className={`ti ${t.icon}`} aria-hidden="true" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 0 && <ResumenView dash={dash} onTab={setTab} />}
      {tab === 1 && <CobranzaView dash={dash} />}
      {tab === 2 && <MoraView dash={dash} />}
      {tab === 3 && <PagadasView dash={dash} />}
    </div>
  );
}
