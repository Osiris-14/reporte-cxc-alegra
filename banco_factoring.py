"""
banco_factoring.py — Pipeline de la cuenta "Factoring Banco" (ID=27) de Alegra.

Genera 2 CSV (mismo patrón que cxc.py / cxc_detalle.py):
  - cxc_FactoringBanco.csv      -> movimientos del año (desde /payments).
  - cxc_FactoringBancoSaldo.csv -> saldo actual de la cuenta (desde /bank-accounts).

Notas API (developer.alegra.com):
  - /payments NO filtra por cuenta bancaria server-side -> se filtra local por
    bankAccount.id == "27".
  - 'type' = "in" (recibidos) | "out" (emitidos). Se consultan ambos.
  - fields=conciliation -> añade la info de conciliación al pago.
  - El detalle /bank-accounts/{id} NO trae saldo actual; el saldo sale del
    LISTADO /bank-accounts con includeBalance=true.
"""
import os
import time
import datetime
import requests
import pandas as pd

# --- Cargar .env local (mismo patrón que cxc.py) ---
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
if not EMAIL or not TOKEN:
    raise SystemExit("Faltan ALEGRA_EMAIL / ALEGRA_TOKEN. Crea un .env desde .env.example.")

AUTH = (EMAIL, TOKEN)
HEADERS = {"Accept": "application/json"}
BASE = "https://api.alegra.com/api/v1"
CUENTA_ID = "27"            # Factoring Banco
ANIO = datetime.date.today().year
LIMIT = 30                  # máximo permitido por Alegra

current_dir = os.path.dirname(os.path.abspath(__file__))

# Session con keep-alive: /payments no filtra por cuenta ni fecha, así que hay
# que escanear miles de pagos del año de 30 en 30. Reutilizar la conexión TCP/TLS
# acelera mucho cientos de requests.
SESSION = requests.Session()
SESSION.auth = AUTH
SESSION.headers.update(HEADERS)


def api_get(path, params):
    """GET con reintento simple ante rate-limit (429) o 5xx."""
    for intento in range(5):
        r = SESSION.get(f"{BASE}/{path}", params=params)
        if r.status_code == 200:
            return r.json()
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(2 * (intento + 1))
            continue
        raise SystemExit(f"ERROR {path}: {r.status_code} {r.text[:300]}")
    raise SystemExit(f"ERROR {path}: agotados los reintentos (rate-limit/5xx)")


def bank_id(p):
    ba = p.get("bankAccount") or {}
    if isinstance(ba, list):
        ba = ba[0] if ba else {}
    return str(ba.get("id")) if ba.get("id") is not None else None


def first_category_name(p):
    cats = p.get("categories") or []
    if isinstance(cats, list) and cats:
        return (cats[0] or {}).get("name")
    return None


def tercero(p):
    # Salidas (out) suelen traer 'provider'; entradas (in) traen 'client'.
    prov = (p.get("provider") or {}).get("name")
    if prov:
        return prov
    cli = (p.get("client") or {}).get("name")
    if cli:
        return cli
    cat = first_category_name(p)
    if cat:
        return cat
    return "Sin tercero"


def cuenta_contable(p):
    cat = first_category_name(p)
    if cat:
        return cat
    # sin categoría: si el pago aplica a documentos (facturas/bills) -> "Pago a factura"
    return "Pago a factura"


def conciliado(p):
    return "Sí" if p.get("conciliation") else "No"


# ===============================
# PASO 1 — Saldo actual de la cuenta (desde /bank-accounts)
# ===============================
print("PASO 1 — Confirmando saldo de la cuenta ID=27 ...")
cuenta = None
start = 0
while True:
    data = api_get("bank-accounts", {
        "start": start,
        "limit": LIMIT,
        "includeBalance": "true",
        "includeInactive": "true",
        "fields": "lastMovementDate",
    })
    records = data["data"] if isinstance(data, dict) and "data" in data else data
    if not records:
        break
    for c in records:
        if str(c.get("id")) == CUENTA_ID:
            cuenta = c
    if cuenta is not None or len(records) < LIMIT:
        break
    start += LIMIT

if cuenta is None:
    print(f"No se encontró la cuenta ID={CUENTA_ID}.")
    raise SystemExit(1)

print(f"  {cuenta.get('name')} | saldo={cuenta.get('balance')} | "
      f"últ. mov={cuenta.get('lastMovementDate')}")

# ===============================
# PASO 2 — Movimientos del año (desde /payments, in + out)
# ===============================
filas = []
for tipo, signo in (("in", 1), ("out", -1)):
    etiqueta = "Entrada" if tipo == "in" else "Salida"
    print(f"PASO 2 — Descargando /payments type={tipo} ...", flush=True)
    start = 0
    while True:
        data = api_get("payments", {
            "type": tipo,
            "start": start,
            "limit": LIMIT,
            "order_field": "date",
            "order_direction": "DESC",
            "fields": "conciliation",
        })
        records = data["data"] if isinstance(data, dict) and "data" in data else data
        if not records:
            break

        # DESC por fecha: si toda la página ya es de años anteriores, paramos.
        fecha_min_pagina = min((p.get("date") or "" for p in records), default="")

        for p in records:
            fecha = p.get("date") or ""
            if not fecha.startswith(str(ANIO)):
                continue
            if bank_id(p) != CUENTA_ID:
                continue
            valor = float(p.get("amount") or 0) * signo
            filas.append({
                "Fecha": fecha,
                "Tercero": tercero(p),
                "CuentaContable": cuenta_contable(p),
                "Tipo": etiqueta,
                "Conciliado": conciliado(p),
                "Valor": valor,
            })

        start += LIMIT
        if start % 600 == 0:
            print(f"    ... escaneados {start} pagos {tipo}, "
                  f"{len(filas)} filas acumuladas", flush=True)

        if fecha_min_pagina and fecha_min_pagina < f"{ANIO}-01-01":
            break
        if len(records) < LIMIT:
            break
    print(f"  Acumulado: {len(filas)} filas", flush=True)

# ===============================
# TRANSFORM + EXPORT
# ===============================
df = pd.DataFrame(filas, columns=[
    "Fecha", "Tercero", "CuentaContable", "Tipo", "Conciliado", "Valor",
])
if not df.empty:
    df["Fecha"] = pd.to_datetime(df["Fecha"], errors="coerce").dt.date
    df = df.sort_values("Fecha", ascending=False).reset_index(drop=True)

out_mov = os.path.join(current_dir, "cxc_FactoringBanco.csv")
df.to_csv(out_mov, index=False, encoding="utf-8-sig")

df_saldo = pd.DataFrame([{
    "Cuenta": cuenta.get("name"),
    "Descripcion": cuenta.get("description"),
    "Saldo": cuenta.get("balance"),
    "UltimoMovimiento": cuenta.get("lastMovementDate"),
}])
out_saldo = os.path.join(current_dir, "cxc_FactoringBancoSaldo.csv")
df_saldo.to_csv(out_saldo, index=False, encoding="utf-8-sig")

# ===============================
# PREVIEW
# ===============================
print(f"\nCSV movimientos: {out_mov} ({len(df)} filas)")
print(f"CSV saldo:       {out_saldo}")
print("\n----- PREVIEW cxc_FactoringBanco.csv (primeras 10 filas) -----")
print(df.head(10).to_string(index=False))
print("\n----- PREVIEW cxc_FactoringBancoSaldo.csv -----")
print(df_saldo.to_string(index=False))
