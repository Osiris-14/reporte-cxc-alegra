# CXC Monitor — Rubio Defensas

Web app (Next.js App Router + TypeScript + Tailwind) que replica el dashboard de
cuentas por cobrar de Power BI. Vive **dentro** del repo del pipeline y **lee los
CSV en runtime** (no hardcodea datos); al actualizarse los CSV por GitHub Actions,
la web refleja los nuevos datos vía revalidación ISR (cada 30 min).

## Correr en local

```bash
cd web
npm install
npm run dev        # http://localhost:3000  (redirige a /cxc)
```

En desarrollo lee los CSV del repo por filesystem (`../*.csv`). En producción lee
por `raw.githubusercontent.com/Osiris-14/reporte-cxc-alegra/main/*.csv`.

Forzar la fuente: `CXC_DATA_SOURCE=fs` o `CXC_DATA_SOURCE=raw`.

## Comandos

```bash
npm run build      # build de producción (ISR, revalidate 30 min)
npm run start      # sirve el build
npm test           # tests de lógica (Vitest)
npm run report     # imprime los KPIs reales (valida contra Power BI)
```

## Estructura

```
web/
  app/
    cxc/page.tsx       Server Component: carga CSV + calcula, pasa a <Dashboard/>
    cxc/Dashboard.tsx  Client: 4 pestañas (Resumen/Cobranza/Mora/Pagadas)
  components/          Topbar + las 4 vistas (SVG/CSS, sin libs de charts)
  lib/
    cxc-logic.ts       Funciones puras (fila, hoy) → estados; hoyRD, idCruce, LIT
    data.ts            Carga fs|raw + papaparse + cruce contra calendario
    kpis.ts            Todas las medidas/agregados (= medidas DAX)
    format.ts          Formato de moneda y fechas
  lib/cxc-logic.test.ts  Tests de la lógica de estados
```

La lógica de negocio está en `docs/MODELO_CXC.md` y el diseño en
`docs/rubio_cxc_webapp_paginado.html` (raíz del repo). No se tocan los scripts
Python ni los workflows: la web solo consume sus salidas.
```
