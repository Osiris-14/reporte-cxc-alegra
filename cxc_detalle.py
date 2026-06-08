"""
Descarga facturas de venta de Alegra y genera DOS CSVs:

  1. cxc_Cuentasporcobrar.csv  -> una fila por factura (nivel factura),
     ahora con TotalPagado, BalancePendiente, FechaUltimoPago y CantidadPagos.

  2. cxc_Pagos.csv             -> una fila por ABONO (movimiento), con la
     fecha de cada pago. Las facturas sin pagos tambien aparecen (FechaPago vacia),
     para no perder las cuentas por cobrar pendientes.

El array "payments" ya viene dentro de cada factura en el endpoint /invoices;
el script anterior lo descartaba al seleccionar solo algunas columnas.
"""

import requests
import pandas as pd
import os

# Cargar variables de entorno desde un archivo .env local si existe (para ejecución local)
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
if os.path.exists(env_path):
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#"):
                parts = line.split("=", 1)
                if len(parts) == 2:
                    key, val = parts
                    os.environ[key.strip()] = val.strip().strip("'\"")

EMAIL = os.getenv("ALEGRA_EMAIL")
TOKEN = os.getenv("ALEGRA_TOKEN")
URL = "https://api.alegra.com/api/v1/invoices"

# ===============================
# EXTRACT
# ===============================
all_data = []
start = 0
limit = 30  # maximo permitido por la API

print("Descargando facturas de ventas...")
while True:
    params = {"start": start, "limit": limit, "order_field": "id", "order_direction": "ASC"}
    response = requests.get(
        URL,
        auth=(EMAIL, TOKEN),
        params=params,
        headers={"Accept": "application/json"},
    )
    if response.status_code == 200:
        data = response.json()
        records = data["data"] if isinstance(data, dict) and "data" in data else data
        if not records:
            break
        all_data.extend(records)
        start += limit
        print(f"Facturas obtenidas: {len(all_data)}", end="\r")
    else:
        print("\nERROR:", response.status_code)
        print(response.text)
        break

print(f"\nDescarga completa. Total facturas: {len(all_data)}")


# ===============================
# HELPERS
# ===============================
def numero_comprobante(inv):
    nt = inv.get("numberTemplate") or {}
    if isinstance(nt, list):
        nt = nt[0] if nt else {}
    return nt.get("fullNumber") or f"{nt.get('prefix', '')}{nt.get('number', '')}"


def cliente_nombre(inv):
    return (inv.get("client") or {}).get("name", "")


# ===============================
# TRANSFORM 1: NIVEL FACTURA
# ===============================
filas_facturas = []
for inv in all_data:
    pagos = inv.get("payments") or []
    fechas_pago = [p.get("date") for p in pagos if p.get("date")]
    filas_facturas.append({
        "NumeroComprobante": numero_comprobante(inv),
        "Fecha": inv.get("date"),
        "FechaVencimiento": inv.get("dueDate"),
        "Cliente": cliente_nombre(inv),
        "MontoTotal": inv.get("total"),
        "TotalPagado": inv.get("totalPaid"),
        "BalancePendiente": inv.get("balance"),
        "Estado": inv.get("status"),
        "CantidadPagos": len(pagos),
        "FechaUltimoPago": max(fechas_pago) if fechas_pago else None,
    })

df_facturas = pd.DataFrame(filas_facturas)

for col in ["Fecha", "FechaVencimiento", "FechaUltimoPago"]:
    if col in df_facturas.columns:
        df_facturas[col] = pd.to_datetime(df_facturas[col], errors="coerce").dt.date


# ===============================
# TRANSFORM 2: NIVEL PAGO (movimientos)
# ===============================
filas_pagos = []
for inv in all_data:
    base = {
        "NumeroComprobante": numero_comprobante(inv),
        "Cliente": cliente_nombre(inv),
        "FechaFactura": inv.get("date"),
        "FechaVencimiento": inv.get("dueDate"),
        "MontoTotal": inv.get("total"),
        "TotalPagado": inv.get("totalPaid"),
        "BalancePendiente": inv.get("balance"),
        "EstadoFactura": inv.get("status"),
    }
    pagos = inv.get("payments") or []
    if pagos:
        for p in pagos:
            fila = dict(base)
            fila["FechaPago"] = p.get("date")
            fila["MontoPago"] = float(p.get("amount") or 0)
            fila["MetodoPago"] = p.get("paymentMethod")
            fila["IdPago"] = p.get("id")
            filas_pagos.append(fila)
    else:
        fila = dict(base)
        fila["FechaPago"] = None
        fila["MontoPago"] = 0.0
        fila["MetodoPago"] = None
        fila["IdPago"] = None
        filas_pagos.append(fila)

df_pagos = pd.DataFrame(filas_pagos)

for col in ["FechaFactura", "FechaVencimiento", "FechaPago"]:
    if col in df_pagos.columns:
        df_pagos[col] = pd.to_datetime(df_pagos[col], errors="coerce").dt.date


# ===============================
# EXPORT
# ===============================
current_dir = os.path.dirname(os.path.abspath(__file__))

out_facturas = os.path.join(current_dir, "cxc_Cuentasporcobrar.csv")
df_facturas.to_csv(out_facturas, index=False, encoding="utf-8-sig", decimal=",", sep=";")
print(f"CSV facturas: {out_facturas}  ({len(df_facturas)} filas)")

out_pagos = os.path.join(current_dir, "cxc_Pagos.csv")
df_pagos.to_csv(out_pagos, index=False, encoding="utf-8-sig", decimal=",", sep=";")
print(f"CSV pagos:    {out_pagos}  ({len(df_pagos)} filas)")