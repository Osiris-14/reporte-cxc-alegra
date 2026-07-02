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
# OBSERVACIONES (notas internas / nota impresa de la factura)
# ===============================
# En Alegra la nota impresa ("FACT: 0904 / TRANF / BANCO / COLOR / COTIZACION")
# vive en "numberTemplate.text" para las facturas recientes. Las antiguas usaban
# "anotation"/"annotation" (y "observations" siempre llega vacío). Se toma el
# PRIMER campo con contenido, en orden de prioridad:
#   1) numberTemplate.text  2) anotation  3) annotation  4) observations
prioridad = ["numberTemplate.text", "anotation", "annotation", "observations"]

obs = pd.Series([""] * len(df), index=df.index, dtype=object)
for campo in prioridad:
    if campo in df.columns:
        col = df[campo].fillna("").astype(str).str.strip()
        # Solo rellena donde 'obs' aún está vacío (respeta la prioridad).
        vacio = obs == ""
        obs = obs.where(~vacio, col)
df["Observaciones"] = obs

# ===============================
# RENOMBRE
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
# SELECCIÓN FINAL
# ===============================
columnas_finales = [
    "NumeroComprobante",
    "Fecha",
    "FechaVencimiento",
    "Cliente",
    "MontoTotal",
    "BalancePendiente",
    "Estado",
    "Observaciones"
]

columnas_existentes = [c for c in columnas_finales if c in df.columns]
df = df[columnas_existentes]

# ===============================
# 🔥 LIMPIAR FECHAS (SIN CAMBIAR ZONA)
# ===============================
for col in ["Fecha", "FechaVencimiento"]:
    if col in df.columns:
        df[col] = pd.to_datetime(df[col], errors='coerce').dt.date

# Convertir montos a numérico para que el decimal="," funcione correctamente
for col in ["MontoTotal", "BalancePendiente"]:
    if col in df.columns:
        df[col] = pd.to_numeric(df[col], errors='coerce')

# ===============================
# EXPORT
# ===============================
current_dir = os.path.dirname(os.path.abspath(__file__))
output_path = os.path.join(current_dir, "cxc_Cuentasporcobrar.csv")

df.to_csv(output_path, index=False, encoding="utf-8-sig")

print(f"\nCSV limpio creado: {output_path}")
print("Filas:", len(df))