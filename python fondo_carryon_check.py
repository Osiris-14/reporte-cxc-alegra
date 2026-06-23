"""
fondo_carryon_check.py — Verificación manual del cálculo "Fondo Carryon".

Lee los CSV ya generados por banco_factoring.py y calcula:
  1. Capital Neto    = constante fija
  2. Capital Bruto   = Capital Neto + SUM(aporte individual del 6% de
                        cada transacción "Entrada" desde 2026-02-01)
  3. Deuda           = ABS(Saldo) de cxc_FactoringBancoSaldo.csv
  4. Disponible      = Capital Neto - Deuda

Uso:
    python fondo_carryon_check.py

Colócalo en la raíz del repo (junto a cxc_FactoringBanco.csv y
cxc_FactoringBancoSaldo.csv) y córrelo. Sirve para comparar manualmente
contra lo que muestre la web app.
"""

import csv
from datetime import date

# ── Constante editable ──────────────────────────────────────────────
CAPITAL_NETO = 1_000_000.0
FECHA_DESDE = date(2026, 2, 1)  # solo transacciones desde febrero 2026

ARCHIVO_MOVIMIENTOS = "cxc_FactoringBanco.csv"
ARCHIVO_SALDO = "cxc_FactoringBancoSaldo.csv"


def parsear_fecha(s: str) -> date:
    # Formato esperado: YYYY-MM-DD
    y, m, d = map(int, s.strip().split("-"))
    return date(y, m, d)


def calcular_capital_bruto(path: str) -> tuple[float, int, float]:
    """Recorre el CSV de movimientos y suma el aporte (6%) de cada
    transacción tipo 'Entrada' con fecha >= FECHA_DESDE.
    Devuelve (capitalBruto, cantidadTransacciones, sumaAportes)."""
    suma_aportes = 0.0
    cantidad = 0

    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            tipo = row["Tipo"].strip()
            if tipo != "Entrada":
                continue
            fecha = parsear_fecha(row["Fecha"])
            if fecha < FECHA_DESDE:
                continue

            valor = float(row["Valor"])
            # El monto recibido YA incluye el 6% de interés (viene "bruto").
            # Se extrae el 6% real: aporte = valor - (valor / 1.06)
            aporte = valor - (valor / 1.06)
            suma_aportes += aporte
            cantidad += 1

    capital_bruto = CAPITAL_NETO + suma_aportes
    return capital_bruto, cantidad, suma_aportes


def leer_saldo(path: str) -> float:
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        row = next(reader)
        return abs(float(row["Saldo"]))


def fmt(n: float) -> str:
    return f"${n:,.2f}"


def main():
    print("=" * 60)
    print("FONDO CARRYON — verificación manual")
    print("=" * 60)

    capital_bruto, cantidad, suma_aportes = calcular_capital_bruto(
        ARCHIVO_MOVIMIENTOS
    )
    deuda = leer_saldo(ARCHIVO_SALDO)
    disponible = CAPITAL_NETO - deuda

    print(f"Transacciones 'Entrada' desde {FECHA_DESDE.isoformat()}: {cantidad}")
    print(f"Suma de aportes (6% por transacción):   {fmt(suma_aportes)}")
    print("-" * 60)
    print(f"1. Capital Neto:   {fmt(CAPITAL_NETO)}")
    print(f"2. Capital Bruto:  {fmt(capital_bruto)}")
    print(f"3. Deuda:          {fmt(deuda)}")
    print(f"4. Disponible:     {fmt(disponible)}")
    print("=" * 60)


if __name__ == "__main__":
    main()