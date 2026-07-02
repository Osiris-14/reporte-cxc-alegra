import requests
import pandas as pd
import os

# Cargar variables de entorno desde un archivo .env local si existe
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
limit = 30

print("Descargando facturas de ventas...")

while True:
    params = {
        "start": start,
        "limit": limit,
        "order_field": "id",
        "order_direction": "ASC"
    }

    response = requests.get(
        URL,
        auth=(EMAIL, TOKEN),
        params=params,
        headers={"Accept": "application/json"}
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


def es_2026(inv):
    return str(inv.get("date") or "").startswith("2026")

# ===============================
# TRANSFORM: NIVEL ITEM (una fila por línea de producto)
# ===============================
# Dentro de cada factura, Alegra devuelve las líneas de producto/servicio en
# el arreglo "items". Cada item trae: id, name, description, quantity, price,
# total (ver https://developer.alegra.com/reference/get_invoices).
# El vehículo viene dentro de "name" (o "description") del producto facturado;
# aquí solo se exporta crudo, la extracción se define después sobre el CSV.
filas_items = []

for inv in all_data:

    if not es_2026(inv):
        continue

    num = numero_comprobante(inv)
    fecha = inv.get("date")

    items = inv.get("items") or []

    for it in items:
        filas_items.append({
            "NumeroComprobante": num,
            "FechaFactura": fecha,
            "IdItem": it.get("id"),
            "NombreProducto": it.get("name"),
            "Descripcion": it.get("description"),
            "Cantidad": it.get("quantity"),
            "Precio": it.get("price"),
            "Total": it.get("total"),
        })

df_items = pd.DataFrame(filas_items, columns=[
    "NumeroComprobante",
    "FechaFactura",
    "IdItem",
    "NombreProducto",
    "Descripcion",
    "Cantidad",
    "Precio",
    "Total",
])

# Limpiar fecha (sin cambiar zona)
if "FechaFactura" in df_items.columns:
    df_items["FechaFactura"] = pd.to_datetime(
        df_items["FechaFactura"],
        errors="coerce"
    ).dt.date

# ===============================
# EXPORT
# ===============================
current_dir = os.path.dirname(os.path.abspath(__file__))

out_items = os.path.join(
    current_dir,
    "cxc_Items.csv"
)

df_items.to_csv(
    out_items,
    index=False,
    encoding="utf-8-sig"
)

print(f"CSV items: {out_items} ({len(df_items)} filas)")
