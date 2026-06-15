# PROMPT PARA CLAUDE CODE — Construir "CXC Monitor" (Rubio Defensas)

> Pégale este archivo completo a Claude Code dentro del repo. Adjunta también
> `MODELO_CXC.md` y el archivo `rubio_cxc_webapp_paginado.html` (el diseño de referencia).

---

## OBJETIVO

Construir una **web app llamada "CXC Monitor"** que replica el dashboard de Power BI de
cuentas por cobrar de Rubio Defensas, **pero como aplicación web** (no Power BI).

- El **diseño visual** debe quedar **idéntico** al archivo `rubio_cxc_webapp_paginado.html`
  que adjunto. Ese HTML es la fuente de verdad del layout, colores, tipografía y estructura.
  No reinventes el diseño: respétalo pixel a pixel (4 pestañas, KPIs de colores, aging, donut, tablas).
- La **lógica y los datos** salen de `MODELO_CXC.md` (medidas, columnas calculadas, cruces, reglas).
- Los datos reales ya están en este repo: `cxc_Cuentasporcobrar.csv`, `cxc_Pagos.csv`,
  `calendario_instalacion.csv`.

El diseño HTML usa variables CSS de un host (`var(--font-sans)`, `var(--color-...)`); al
portarlo, **reemplázalas por valores fijos** equivalentes (ya están los hex en el HTML: `#f2f3f5`,
`#e05252`, `#3aa76d`, `#e6a817`, `#7b68cc`, `#2b2b2b`, `#5bb8d4`, etc.).

---

## STACK

- **Next.js (App Router) + TypeScript + Tailwind**
- Sin librerías de gráficos pesadas: el donut y las barras de aging son SVG/CSS como en el HTML.

## DÓNDE SE CONSTRUYE Y DE DÓNDE SALEN LOS DATOS (crítico)

- **La web app se construye DENTRO de este mismo repo** (`reporte-cxc-alegra`), el que ya
  contiene los scripts del pipeline y los CSV. NO es un repo nuevo. Agrega la app Next.js
  aquí mismo (ej. en una carpeta `/web` o en la raíz, como prefieras, sin romper los scripts
  de Python ni los workflows existentes).

- **Los 3 CSV se ACTUALIZAN SOLOS** por GitHub Actions (cron 6:30 / 11:00 / 16:45 hora RD):
  `cxc_Cuentasporcobrar.csv`, `cxc_Pagos.csv`, `calendario_instalacion.csv`.
  Por eso la web app **NO debe hardcodear los datos ni copiarlos a otro lado**. Debe **leer
  los CSV del repo en tiempo de ejecución** (en cada carga / con revalidación), para que
  siempre refleje la última corrida del pipeline.

- **Cómo leer los CSV** (elige según el tipo de deploy):
  - Si la app corre con acceso al filesystem del repo: leer los archivos locales
    (`fs.readFile` en un Server Component / route handler) y parsear con `papaparse`.
  - Si se despliega en Vercel y el repo es público: leer por la URL raw de GitHub
    (`https://raw.githubusercontent.com/Osiris-14/reporte-cxc-alegra/main/<archivo>.csv`)
    con `fetch(..., { next: { revalidate: 1800 } })` (revalida cada 30 min, alineado al cron).
    Esta es la MISMA fuente que ya usa el Power Query del Power BI, así que es consistente.
  - **Preferir Server Components** para el parseo (no exponer todo el CSV al cliente; mandar
    al cliente solo lo ya calculado/filtrado).

- **No tocar** los archivos `cxc.py`, `cxc_detalle.py`, `exportar_calendario.py` ni los
  workflows `.github/workflows/*.yml`. La web solo consume sus salidas.

---

## LAS 4 PESTAÑAS (idénticas al HTML de referencia)

1. **Resumen** — 4 metric cards (Cartera total, Cobrado, Días prom. atraso, Concentración top deudor),
   fila de 6 status pills clicables, gráfico de aging (4 buckets), donut "peso por estado", alerta de riesgo.
2. **Cobranza activa** — tablas completas de: Instalaciones de hoy, Instalaciones de la semana, Reagendadas.
3. **Mora** — tablas completas de: Vencidas, Atrasadas.
4. **Pagadas** — 3 metric cards + tabla de Instalaciones pagadas.

Las pestañas, badges de conteo, pills de fecha con color y totales por tabla van **exactamente**
como en el HTML.

---

## REGLAS DE NEGOCIO (de MODELO_CXC.md — implementar como FUNCIONES, no columnas fijas)

> ⚠️ CRÍTICO: los estados se recalculan contra **"hoy"** cada vez. Implementarlos como funciones
> puras `(fila, hoy) => estado`. Nunca guardarlos como valor fijo, o el dashboard se congela.

1. **`hoyRD()`** → fecha de hoy en zona `America/Santo_Domingo` (UTC-4). Todo se calcula contra esto.

2. **ITBIS 6%:** `pendienteLIT = BalancePendiente * 1.06`, `totalLIT = MontoTotal * 1.06`.

3. **`idCruce(comprobante)`** = `parseInt(comprobante.slice(-4))` → últimos 4 dígitos.
   Se cruza contra `calendario.p` (Codigo cruce) para traer `Etiqueta` (calendario.etiqueta)
   y `FechaReagendamiento` (calendario.inicio). Si hay múltiples matches → blank (como SELECTEDVALUE).

4. **`estadoCuenta(balance, fechaVenc, hoy)`**:
   - `balance <= 450` → `"Cerrado"`
   - `balance > 450 && fechaVenc < hoy` → `"Atraso"`
   - `balance > 450` → `"Open"`

5. **`estadoVencimiento(fechaVenc, hoy)`** (semana lun–dom):
   - `= hoy` → `"Hoy"`
   - `> hoy && <= finSemana` → `"Semana"`
   - `< hoy` → `"Vencido"`
   - else `"Otros"`

6. **`estadoAgenda(fila, hoy)`** — clasificador maestro:
   - Reagendado: `(venc<hoy && reag>=hoy) || (venc>=hoy && reag==hoy)`
   - Vencidas: `venc<hoy && reag existe && reag<hoy && estadoCuenta=="Atraso"`
   - Atrasado: `venc<hoy && reag NO existe && estadoCuenta=="Atraso"`
   - else null

7. **Filtrado base:** solo facturas del **año en curso** (`Fecha.year == añoActual`).

---

## MEDIDAS / KPIs (replicar de MODELO_CXC.md)

| KPI / bloque | Cómo se calcula |
|---|---|
| VO6 Vencidas | filas `estadoAgenda=="Vencidas"`, suma `pendienteLIT` |
| I01 Inst. hoy | `estadoVencimiento=="Hoy"`, suma `pendienteLIT` |
| IS2 Inst. semana | `estadoVencimiento=="Semana"`, suma `pendienteLIT` |
| R1 Reagendadas | `estadoAgenda=="Reagendado"`; fecha = `FechaReagendamiento` |
| A01 Atrasadas | `estadoAgenda=="Atrasado"`, suma `pendienteLIT` |
| INS Pagadas | `estadoVencimiento=="HOY"` + `estadoCuenta=="Cerrado"`, suma `totalLIT` |
| **Cartera total** (nuevo) | suma `pendienteLIT` de todo lo que tiene `balance>450` |
| **Días prom. atraso** (nuevo) | promedio de `(hoy - fechaVenc)` de las cuentas en atraso |
| **Concentración top deudor** (nuevo) | mayor deudor / cartera total, en % |
| **Aging** (nuevo) | buckets por días de atraso: 0-30, 31-60, 61-90, +90 |
| Donut peso por estado | conteo por `estadoAgenda` |

> Los KPIs marcados "(nuevo)" no existían en el Power BI; se diseñaron sobre tu data. Mantenerlos.

**Color de pill de reagendamiento** (de la medida `Color Fondo Reagendamiento`), por días hasta reagendar:
`<=0 #FF0000` · `<=3 #FF6666` · `<=7 #FFB366` · `<=15 #FFE699` · `else blanco`.
En el diseño de referencia se simplificó a pills rojo/ámbar — mantener esa simplificación visual.

---

## ESTRUCTURA SUGERIDA (dentro del repo existente)

```
reporte-cxc-alegra/           ← repo actual (NO crear repo nuevo)
  cxc.py, cxc_detalle.py, ...  ← scripts del pipeline (NO tocar)
  *.csv                        ← data auto-actualizada (NO tocar, solo leer)
  .github/workflows/           ← NO tocar
  /web                         ← NUEVA app Next.js aquí
    /app/cxc/page.tsx          → layout con las 4 pestañas (cliente)
    /lib/cxc-logic.ts          → hoyRD, estadoCuenta, estadoVencimiento, estadoAgenda, pendienteLIT, idCruce
    /lib/data.ts               → carga/parseo de los 3 CSV (raw GitHub o fs) + cruce calendario
    /lib/kpis.ts               → cálculo de todos los KPIs/agregados
    /components/               → KpiCard, StatusPill, AgingChart, Donut, DataTable, Tabs
```

---

## CRITERIOS DE ACEPTACIÓN

1. Se ve **idéntico** al `rubio_cxc_webapp_paginado.html` (las 4 pestañas, colores exactos, tablas con totales).
2. Los números salen de la **data real** del repo, calculados con las funciones de `MODELO_CXC.md`.
3. Los estados se **recalculan contra hoy** (probar cambiando la fecha del sistema → los buckets cambian).
4. El monto de cada KPI usa `pendienteLIT` / `totalLIT` (con el 6%).
5. Las pestañas navegan client-side, sin recargar.
6. **Los datos se leen de los CSV del repo en runtime** (no hardcodeados); al actualizarse el
   CSV por el pipeline, la web refleja los nuevos datos sin tocar código (con revalidación ≤30 min).
7. Código tipado, funciones de lógica puras y testeables (idealmente un par de tests de `estadoAgenda`).

---

## NOTAS

- Mantener el pipeline actual (Alegra → CSV → GitHub) como fuente; la web app solo **lee y calcula**.
- Si más adelante se conecta a Supabase, la lógica de `cxc-logic.ts` no cambia (sigue siendo función de `(fila, hoy)`).
- La página **Factory** (segunda pestaña del Power BI) se diseñará en una fase posterior — dejar el
  layout preparado para añadir una sección/ruta `/factory` después.