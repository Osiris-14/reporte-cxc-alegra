import requests
import pandas as pd
import os

EMAIL = os.getenv("ALEGRA_EMAIL")
TOKEN = os.getenv("ALEGRA_TOKEN")

URL = "https://api.alegra.com/api/v1/invoices"

all_data = []
start = 0
limit = 30

print("Descargando facturas de ventas...")

while True:
    params = {"start": start, "limit": limit}

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

print("\nDescarga completa.")

# ===============================
# TRANSFORM
# ===============================
df = pd.json_normalize(all_data)

print("\nColumnas disponibles:")
print(df.columns.tolist())

# ===============================
# 🔥 USAR FULL NUMBER (CORRECTO)
# ===============================
rename_map = {
    "numberTemplate.fullNumber": "NumeroComprobante",
    "date": "Fecha",
    "dueDate": "FechaVencimiento",
    "client.name": "Cliente",
    "total": "MontoTotal",
    "balance": "BalancePendiente",
    "status": "Estado"
}

rename_map = {k: v for k, v in rename_map.items() if k in df.columns}
df.rename(columns=rename_map, inplace=True)

# ===============================
# 🎯 SELECCIÓN FINAL
# ===============================
columnas_finales = [
    "NumeroComprobante",
    "Fecha",
    "FechaVencimiento",
    "Cliente",
    "MontoTotal",
    "BalancePendiente",
    "Estado"
]

columnas_existentes = [c for c in columnas_finales if c in df.columns]
df = df[columnas_existentes]

# ===============================
# EXPORT
# ===============================
current_dir = os.path.dirname(os.path.abspath(__file__))
output_path = os.path.join(current_dir, "cxc_Cuentasporcobrar.csv")

df.to_csv(output_path, index=False, encoding="utf-8-sig")

print(f"\nCSV limpio creado: {output_path}")
print("Filas:", len(df))