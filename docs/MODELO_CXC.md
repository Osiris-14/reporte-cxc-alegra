# MODELO DE DATOS — Reporte CXC Alegra (Rubio Defensas)

> Documento técnico extraído del `.pbix`. Reconstruye la lógica completa del Power BI
> (medidas DAX, columnas calculadas, relaciones, Power Query) para portarla a la web app.
> Fuente de datos: API de Alegra + Google Calendar, vía CSVs en GitHub.

---

## 1. Arquitectura general

```
API Alegra ─┬─> cxc.py ──────────> cxc_Cuentasporcobrar.csv ─┐
            └─> cxc_detalle.py ──> cxc_Pagos.csv ────────────┤
Google Calendar ─> exportar_calendario.py ─> calendario_instalacion.csv ─┤
                                                                          │
                                              GitHub (raw) ──> Power BI ──┘
```

Los 3 scripts corren por GitHub Actions en cadena:
1. `main.yml` (cron 6:30 / 11:00 / 16:45 RD) → `cxc.py` → genera `cxc_Cuentasporcobrar.csv`
2. `cxc_detalles.yml` (al terminar el anterior) → `cxc_detalle.py` → genera `cxc_Pagos.csv`
3. `calendario.yml` (al terminar el anterior) → `exportar_calendario.py` → genera `calendario_instalacion.csv`

Power BI lee los 3 CSVs por URL `raw.githubusercontent.com`.

---

## 2. Tablas del modelo

| Tabla (Power BI) | Origen | Filas aprox | Rol |
|---|---|---|---|
| `cxc_Cuentasporcobrar` | `cxc_Cuentasporcobrar.csv` | ~3.380 | **Tabla hechos principal** (facturas abiertas del año) |
| `Detalle` | `cxc_Pagos.csv` | ~5.564 | Pagos a nivel transacción (1 fila por pago) |
| `Calendario` | `calendario_instalacion.csv` | ~682 (2026) | Eventos de instalación de Google Calendar |
| `Medidas` | tabla vacía | 0 | Solo contenedor de medidas DAX |

### 2.1 Columnas base por tabla (las que vienen del CSV)

**cxc_Cuentasporcobrar** (de `cxc.py`):
`NumeroComprobante` (text), `Fecha` (date), `FechaVencimiento` (date), `Cliente` (text),
`MontoTotal` (number), `BalancePendiente` (number), `Estado` (text)

**Detalle** (de `cxc_detalle.py`):
`NumeroComprobante`, `Cliente`, `FechaFactura`, `FechaVencimiento`, `MontoTotal`,
`TotalPagado`, `BalancePendiente`, `EstadoFactura`, `FechaPago`, `MontoPago`, `MetodoPago`, `IdPago`

**Calendario** (de `exportar_calendario.py`):
`id`, `Codigo cruce` (renombrado de `p`), `titulo`, `inicio`, `fin`, `todo_el_dia`,
`color_id`, `color_nombre`, `etiqueta`, `color_hex`, `color`, `telefono`, `nombre`,
`pendiente`, `cotizacion`, `requerimiento`, `notas`, `descripcion`, `ubicacion`

---

## 3. Relaciones entre tablas

| Desde | Hacia | Cardinalidad | Activa | Dirección |
|---|---|---|---|---|
| `Calendario[Codigo cruce]` | `cxc_Cuentasporcobrar[ID cruce]` | M:M | Sí | Single |
| `Detalle[NumeroComprobante]` | `cxc_Cuentasporcobrar[NumeroComprobante]` | M:1 | Sí | Single |
| `Detalle[ID cruce]` | `Calendario[Codigo cruce]` | M:M | **No** (inactiva) | Both |

**El cruce clave:** `cxc_Cuentasporcobrar` se une al `Calendario` por los **últimos 4 dígitos del número de comprobante** (`ID cruce`), que coinciden con el campo `p` (renombrado `Codigo cruce`) que se escribe a mano en cada evento del calendario. Así se trae a cada factura su fecha de reagendamiento y su etiqueta de instalación.

---

## 4. Columnas calculadas (DAX)

> ⚠️ Toda la fecha "hoy" se calcula en hora de RD (UTC-4) con `NOW() - TIME(4,0,0)`.
> Replicar esto en la web app usando timezone `America/Santo_Domingo`.

### 4.1 En `cxc_Cuentasporcobrar`

**`ID cruce`** — llave de cruce con el calendario:
```
VALUE(RIGHT('cxc_Cuentasporcobrar'[NumeroComprobante], 4))
```

**`pendiente LIT`** — balance pendiente + 6% ITBIS:
```
cxc_Cuentasporcobrar[BalancePendiente] * 1.06
```

**`total LIT`** — monto total + 6% ITBIS:
```
cxc_Cuentasporcobrar[MontoTotal] * 1.06
```

**`Estado Cuenta`** — clasificación de cobro (umbral de $450 se considera "pagado"):
```
VAR Balance = cxc_Cuentasporcobrar[BalancePendiente]
VAR FechaVenc = cxc_Cuentasporcobrar[FechaVencimiento]
VAR Hoy = [Hoy_RD]
RETURN
SWITCH(
    TRUE(),
    Balance <= 450, "Cerrado",
    Balance > 450 && FechaVenc < Hoy, "Atraso",
    Balance > 450, "Open"
)
```

**`Estado Vencimiento`** — ubica la factura en el tiempo (semana laboral lun–dom):
```
VAR Hoy = [Hoy_RD]
VAR InicioSemana = Hoy - WEEKDAY(Hoy, 2) + 1
VAR FinSemana = InicioSemana + 6
RETURN
SWITCH(
    TRUE(),
    [FechaVencimiento] = Hoy, "Hoy",
    [FechaVencimiento] > Hoy && [FechaVencimiento] <= FinSemana, "Semana",
    [FechaVencimiento] < Hoy, "Vencido",
    "Otros"
)
```

**`Apertura`** — marca facturas creadas hoy:
```
IF(DATEVALUE([Fecha]) = [Hoy_RD], "Apertura Hoy", "Otros")
```

**`Etiqueta`** — trae la etiqueta del calendario (cruce por ID cruce):
```
CALCULATE(
    SELECTEDVALUE(Calendario[etiqueta]),
    FILTER(Calendario, Calendario[Codigo cruce] = cxc_Cuentasporcobrar[ID cruce])
)
```
Valores posibles: `"Instalacion completada"`, `"Dia fecha 0"`, `"Cliente reagendado"`, `BLANK`.

**`Fecha Reagendamiento`** — trae la fecha de inicio del evento del calendario:
```
CALCULATE(
    SELECTEDVALUE(Calendario[inicio]),
    FILTER(Calendario, Calendario[Codigo cruce] = cxc_Cuentasporcobrar[ID cruce])
)
```

**`Estado Agenda`** — el clasificador maestro del dashboard (Reagendado / Vencidas / Atrasado):
```
SWITCH(
    TRUE(),
    -- REAGENDADO: vencida con reagendamiento futuro, o vence hoy y reagendada hoy
    (
        [FechaVencimiento] < TODAY()
        && NOT(ISBLANK([Fecha Reagendamiento]))
        && [Fecha Reagendamiento] >= TODAY()
    )
    || (
        [FechaVencimiento] >= TODAY()
        && [Fecha Reagendamiento] = TODAY()
    ),
    "Reagendado",

    -- VENCIDAS: vencida, reagendamiento ya pasó, sigue en atraso
    [FechaVencimiento] < TODAY()
        && NOT(ISBLANK([Fecha Reagendamiento]))
        && [Fecha Reagendamiento] < TODAY()
        && [Estado Cuenta] = "Atraso",
    "Vencidas",

    -- ATRASADO: vencida, sin reagendamiento, sigue en atraso
    [FechaVencimiento] < TODAY()
        && ISBLANK([Fecha Reagendamiento])
        && [Estado Cuenta] = "Atraso",
    "Atrasado",

    BLANK()
)
```

> Columnas `Test Vencimiento`, `Test Reag`, `Test Reag Hoy`, `Test Completo` son auxiliares
> de depuración (booleanas). No se usan en visuales; se pueden ignorar al portar.

### 4.2 En `Detalle`

**`ID cruce`**:
```
VALUE(RIGHT('Detalle'[NumeroComprobante], 4))
```

---

## 5. Medidas DAX

**`Hoy_RD`** — fecha de hoy en zona RD (base de casi todo):
```
DATE(YEAR(NOW() - TIME(4,0,0)), MONTH(NOW() - TIME(4,0,0)), DAY(NOW() - TIME(4,0,0)))
```

**`Facturas en Atraso`** — conteo de cuentas en atraso:
```
CALCULATE(COUNTROWS('cxc_Cuentasporcobrar'), 'cxc_Cuentasporcobrar'[Estado Cuenta] = "Atraso")
```

**`Monto en Atraso`** — suma del atraso (excluye mes 1 / enero, incluye etiquetas día 0 / reagendado / sin etiqueta):
```
CALCULATE(
    SUM('cxc_Cuentasporcobrar'[pendiente LIT]),
    FILTER(
        'cxc_Cuentasporcobrar',
        [Estado Cuenta] = "Atraso"
        && ([Etiqueta] = "Dia fecha 0" || ISBLANK([Etiqueta]) || [Etiqueta] = "Cliente reagendado")
        && MONTH([FechaVencimiento]) <> 1
    )
)
```

**`Facturas a cobrar hoy`** — conteo (se filtra por contexto de visual):
```
CALCULATE(COUNTROWS('cxc_Cuentasporcobrar'))
```

**`Monto a cobrar`** — suma de pendiente que vence hoy:
```
VAR Hoy = DATE(YEAR(NOW()-TIME(4,0,0)), MONTH(NOW()-TIME(4,0,0)), DAY(NOW()-TIME(4,0,0)))
RETURN
CALCULATE(SUM('cxc_Cuentasporcobrar'[pendiente LIT]), 'cxc_Cuentasporcobrar'[FechaVencimiento] = Hoy)
```

**`Monto a cobrar semana`**:
```
CALCULATE(SUM('cxc_Cuentasporcobrar'[pendiente LIT]), cxc_Cuentasporcobrar[Estado Vencimiento] = "Semana")
```

**`Facturas aperturadas hoy`**:
```
VAR Hoy = (... Hoy_RD ...)
RETURN CALCULATE(COUNT('cxc_Cuentasporcobrar'[NumeroComprobante]), [Fecha] = Hoy)
```

**`Monto aperturado hoy`**:
```
VAR Hoy = (... Hoy_RD ...)
RETURN CALCULATE(SUM('cxc_Cuentasporcobrar'[total LIT]), [Fecha] = Hoy)
```

**`Facturas Cobradas hoy`** — vencían hoy y se cerraron:
```
CALCULATE(
    COUNTROWS('cxc_Cuentasporcobrar'),
    [Estado Vencimiento] = "HOY",
    [Estado Cuenta] = "Cerrado"
)
```

**`Monto Cobrado hoy`**:
```
CALCULATE(
    SUM('cxc_Cuentasporcobrar'[total LIT]),
    [Estado Vencimiento] = "HOY",
    [Estado Cuenta] = "Cerrado"
)
```

**`Clientes vencimiento/reagendamiento hoy que pagaron hoy`** — usa la tabla `Detalle`:
```
CALCULATE(
    DISTINCTCOUNT(detalle[NumeroComprobante]),
    detalle[FechaPago] = TODAY(),
    detalle[BalancePendiente] < 450,
    FILTER(detalle,
        detalle[FechaVencimiento] = TODAY()
        || RELATED(cxc_Cuentasporcobrar[Fecha Reagendamiento]) = TODAY()
    )
)
```

**`Monto pagado hoy de vencimientos/reagendamientos hoy`**:
```
CALCULATE(
    SUM(detalle[MontoPago]),
    detalle[FechaPago] = TODAY(),
    detalle[BalancePendiente] < 450,
    FILTER(detalle,
        detalle[FechaVencimiento] = TODAY()
        || RELATED(cxc_Cuentasporcobrar[Fecha Reagendamiento]) = TODAY()
    )
)
```

**`Color Fondo Reagendamiento`** — color condicional por cercanía del reagendamiento:
```
VAR Dias = DATEDIFF(TODAY(), MAX(cxc_Cuentasporcobrar[Fecha Reagendamiento]), DAY)
RETURN
SWITCH(TRUE(),
    Dias <= 0,  "#FF0000",   -- hoy o vencida
    Dias <= 3,  "#FF6666",   -- próximos 3 días
    Dias <= 7,  "#FFB366",   -- próxima semana
    Dias <= 15, "#FFE699",   -- 15 días
    "#FFFFFF"                 -- más lejano
)
```

---

## 6. Filtros de la página CXC

- **Filtro de página (RelativeDate):** `cxc_Cuentasporcobrar[Fecha]` relativo a hoy
  (en Power Query además se filtra `Date.IsInCurrentYear([Fecha])`, así que el modelo solo trae el año en curso).

Los "estados" del dashboard (Vencidas, Hoy, Semana, Reagendadas, Atrasadas, Pagadas)
**no son slicers** — se derivan de filtrar cada visual por `Estado Agenda` / `Estado Vencimiento` / `Estado Cuenta`.

---

## 7. Mapa visual → lógica (página CXC)

| Bloque del dashboard | Cómo se calcula |
|---|---|
| **VO6 · Vencidas** | filas con `Estado Agenda = "Vencidas"`; monto = `pendiente LIT` |
| **I01 · Instalaciones de hoy** | `Estado Vencimiento = "Hoy"`; monto = medida `Monto a cobrar` |
| **IS2 · Instalaciones de la semana** | `Estado Vencimiento = "Semana"`; monto = `Monto a cobrar semana` |
| **R1 · Reagendadas** | `Estado Agenda = "Reagendado"`; fecha = `Fecha Reagendamiento`; color = `Color Fondo Reagendamiento` |
| **A01 · Atrasadas** | `Estado Agenda = "Atrasado"`; monto = `pendiente LIT` |
| **INS · Instalaciones pagas** | `Estado Vencimiento = "HOY"` + `Estado Cuenta = "Cerrado"`; monto = `Monto Cobrado hoy` |
| **Donut "Peso por estado"** | conteo de `NumeroComprobante` por `Estado Agenda` |

---

## 8. Reglas de negocio clave (resumen para la web app)

1. **ITBIS 6%:** todos los montos visibles usan `* 1.06` (columnas `pendiente LIT` / `total LIT`).
2. **Umbral de pago:** una cuenta con balance `<= 450` se considera **Cerrado/pagado** (no $0, hay tolerancia de RD$450).
3. **Hoy = RD (UTC-4):** nunca usar UTC puro; siempre `America/Santo_Domingo`.
4. **Semana laboral:** lunes (WEEKDAY tipo 2) a domingo.
5. **Excluir enero** (`MONTH <> 1`) del monto en atraso — arrastre de datos viejos.
6. **Cruce calendario:** últimos 4 dígitos del comprobante = campo `p` del evento.
7. **Estados derivados, no almacenados:** `Estado Cuenta`, `Estado Vencimiento`, `Estado Agenda`
   se recalculan cada día respecto a "hoy". En la web app deben ser **funciones**, no columnas fijas.
8. **Fondo Carryon — Capital Bruto:** el `Valor` de cada Entrada **ya viene bruto** (incluye el 6%);
   el aporte real se **extrae** del bruto, no se multiplica directo (ver sección 8.1).

---

## 8.1 Fondo Carryon (Factoring Banco)

Origen: `cxc_FactoringBanco.csv` (movimientos `Entrada` / `Salida`). Lógica en `web/lib/factory.ts`
(`computeFondo`).

| Concepto | Fórmula |
| --- | --- |
| **Capital Neto** | constante fija = `RD$ 1,000,000` (`CAPITAL_NETO`). |
| **Aporte por Entrada** | `aporte = Valor − (Valor / 1.06)` — solo Entradas desde **2026-02-01** (inclusive). |
| **Capital Bruto** | `CAPITAL_NETO + SUM(aporte de cada Entrada)`. |
| **Deuda** | `abs(saldo)`. |
| **Disponible** | `CAPITAL_NETO − Deuda`. |

> ⚠️ **Corrección importante:** el `Valor` de cada Entrada es el **monto bruto** que ya incluye
> el 6% de interés. Por eso el aporte se **saca del bruto**:
> `aporte = Valor − (Valor / 1.06)`, **no** `Valor * 0.06` (fórmula vieja, incorrecta).
>
> Ejemplo: `Valor = 1,000` → aporte = `1,000 − (1,000 / 1.06) = 56.60` (no 60).

---

## 9. Para portar a la web app (Next.js + Supabase)

Estas columnas calculadas y medidas deben volverse **lógica de servidor/SQL**, no DAX:

- `Estado Cuenta`, `Estado Vencimiento`, `Estado Agenda`, `Apertura` → funciones SQL/TS que reciben la fila y "hoy_RD".
- `pendiente LIT` / `total LIT` → columna generada o cálculo en query (`balance * 1.06`).
- Medidas (`Monto a cobrar`, `Monto en Atraso`, etc.) → queries agregadas con los mismos filtros.
- El cruce `ID cruce` (últimos 4 dígitos) → join en SQL: `RIGHT(numero_comprobante, 4) = codigo_cruce`.

**Fuente de datos:** se puede mantener el pipeline actual (Alegra → CSV → GitHub) y que la
web app lea de Supabase, o conectar la web app directo a la API de Alegra. A decidir en Fase 2.