"""
Exporta a CSV todos los eventos del CALENDARIO DE INSTALACION
de Google Calendar, incluyendo el color con el que se registro cada evento.

Requisitos (ya los instala Claude Code):
    python3 -m pip install --upgrade google-api-python-client google-auth-httplib2 google-auth-oauthlib

El JSON de credenciales (client_secret_xxx.json) debe estar en esta misma carpeta.
La primera vez se abrira el navegador para autorizar; despues queda token.json.
"""

import csv
import glob
import html
import os.path
import re

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# ---------------------------------------------------------------------------
# CONFIGURACION
# ---------------------------------------------------------------------------
SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]

# Fragmento del nombre del calendario que queremos (no hace falta el nombre exacto).
# "INSTALA" basta para encontrar "CALENDARIO DE INSTALACION".
NOMBRE_CALENDARIO = "INSTALA"

# Solo exporta eventos cuyo año de inicio coincida. "" = todos los años.
# 2026 en adelante usan el formato fijo COLOR/Telefono/NOMBRE/PENDIENTE/COTIZACION/REQUERIMIENTO.
ANIO_FILTRO = "2026"

ARCHIVO_SALIDA = "calendario_instalacion.csv"

# Titulos a excluir (no se exportan). La comparacion normaliza espacios y
# mayusculas, asi que atrapa variantes como doble espacio "Chequeo  de Fugas".
TITULOS_EXCLUIDOS = [
    "chequeo de fugas de aire y gas",
]


def _normalizar(texto):
    """Minusculas y espacios colapsados, para comparar titulos."""
    return re.sub(r"\s+", " ", texto).strip().lower()


def titulo_excluido(titulo):
    t = _normalizar(titulo)
    return any(frag in t for frag in TITULOS_EXCLUIDOS)


def limpiar_descripcion(texto):
    """Convierte la descripcion HTML de Google Calendar a texto plano,
    tal como se ve en el calendario."""
    if not texto:
        return ""
    # Convertir saltos y etiquetas de bloque en saltos de linea
    texto = re.sub(r"(?i)<\s*br\s*/?\s*>", "\n", texto)
    texto = re.sub(r"(?i)</\s*(p|div|tr|li|table|h[1-6])\s*>", "\n", texto)
    # Quitar el resto de etiquetas HTML
    texto = re.sub(r"<[^>]+>", "", texto)
    # Quitar una etiqueta incompleta al final (por HTML muy largo/cortado)
    texto = re.sub(r"<[^>]*$", "", texto)
    # Quitar angulos sueltos que hayan quedado
    texto = texto.replace("<", " ").replace(">", " ")
    # Decodificar entidades (&amp; &nbsp; etc.)
    texto = html.unescape(texto)
    # Limpiar cada linea: colapsar espacios/nbsp y descartar vacias
    lineas = []
    for linea in texto.split("\n"):
        linea = re.sub(r"[ \t\xa0]+", " ", linea).strip()
        if linea:
            lineas.append(linea)
    return "\n".join(lineas)


# Columnas que se extraen de la descripcion
CAMPOS_DESC = ["color", "telefono", "nombre", "pendiente", "cotizacion", "p", "requerimiento", "notas"]


def parsear_descripcion(desc):
    """Separa la descripcion (ya limpia) en campos: color, telefono, nombre,
    pendiente, cotizacion, p, requerimiento. Lo que no encaja va a 'notas'."""
    c = {k: "" for k in CAMPOS_DESC}
    notas = []
    for line in desc.split("\n"):
        line = line.strip()
        if not line:
            continue
        low = line.lower()

        if low.startswith("color"):
            val = re.sub(r"(?i)^color\s*:?\s*", "", line).strip(" :/-")
            c["color"] = (c["color"] + " / " + val).strip(" /") if c["color"] else val
            continue
        if low.startswith("tel"):
            c["telefono"] = re.sub(r"(?i)^tel(efono)?\s*:?\s*", "", line).strip()
            continue
        if low.startswith("nombre"):
            c["nombre"] = re.sub(r"(?i)^nombre\s*:?\s*", "", line).strip()
            continue
        if low.startswith("pendiente"):
            c["pendiente"] = re.sub(r"(?i)^pendiente\s*[-:]?\s*", "", line).strip()
            continue
        if low.startswith("cotizacion"):
            mc = re.search(r"(?i)cotizacion\s*:?\s*([0-9]+)", line)
            if mc:
                c["cotizacion"] = mc.group(1)
            mp = re.search(r"(?i)\bp\.?\s*([0-9]+)", line)
            if mp:
                c["p"] = mp.group(1)
            continue
        if low.startswith("requerimiento"):
            c["requerimiento"] = re.sub(r"(?i)^requerimiento\s*:?\s*", "", line).strip()
            continue
        if re.match(r"(?i)^p\.?\s*[0-9]", line):
            mp = re.search(r"([0-9]+)", line)
            if mp and not c["p"]:
                c["p"] = mp.group(1)
            continue
        # Formato viejo: "telefono: nombre" en una sola linea
        m = re.match(r"^([0-9][0-9_\-\s]{6,}[0-9])\s*:\s*(.+)$", line)
        if m:
            if not c["telefono"]:
                c["telefono"] = m.group(1).replace("_", "-").strip()
            if not c["nombre"]:
                c["nombre"] = m.group(2).strip()
            continue
        # Cualquier otra linea -> notas (no se pierde nada)
        notas.append(line)

    c["notas"] = " / ".join(notas)
    return c


# Mapeo de color por hex -> (nombre de color, etiqueta de negocio).
# El color_hex que devuelve la API es el dato fiable para diferenciar.
COLOR_POR_HEX = {
    "#7ae7bf": ("Verde", "Instalacion completada"),
    "#d06b64": ("Rojo", "Dia fecha 0"),
    "#fbd75b": ("Amarillo", "Cliente reagendado"),
    "#46d6db": ("Turquesa/Celeste", "NONE"),
}


# ---------------------------------------------------------------------------
# AUTENTICACION
# ---------------------------------------------------------------------------
def obtener_credenciales():
    creds = None

    # En GitHub Actions el token llega como variable de entorno GOOGLE_TOKEN_JSON.
    # Lo materializamos como token.json (sobrescribiendo, por si acaso).
    token_env = os.environ.get("GOOGLE_TOKEN_JSON")
    if token_env:
        with open("token.json", "w") as f:
            f.write(token_env.strip())

    if os.path.exists("token.json"):
        creds = Credentials.from_authorized_user_file("token.json", SCOPES)

    # Caso 1: credenciales ya validas -> usarlas tal cual
    if creds and creds.valid:
        return creds

    # Caso 2: hay refresh_token -> refrescar sin navegador (esto es lo que pasa en CI)
    if creds and creds.refresh_token:
        creds.refresh(Request())
        with open("token.json", "w") as token:
            token.write(creds.to_json())
        return creds

    # Caso 3: en CI no podemos abrir navegador
    if os.environ.get("CI"):
        raise RuntimeError(
            "No hay credenciales validas en CI. Revisa que el secreto "
            "GOOGLE_TOKEN_JSON tenga el token.json completo y con refresh_token."
        )

    # Caso 4: flujo interactivo local (primera vez): abre el navegador
    candidatos = glob.glob("client_secret*.json") or glob.glob("credentials.json")
    if not candidatos:
        raise FileNotFoundError(
            "No encontre el JSON de credenciales (client_secret_*.json) en esta carpeta."
        )
    archivo_credenciales = candidatos[0]
    print(f"Usando credenciales: {archivo_credenciales}")
    flow = InstalledAppFlow.from_client_secrets_file(archivo_credenciales, SCOPES)
    creds = flow.run_local_server(port=0)
    with open("token.json", "w") as token:
        token.write(creds.to_json())
    return creds


# ---------------------------------------------------------------------------
# BUSCAR EL CALENDARIO POR NOMBRE
# ---------------------------------------------------------------------------
def buscar_calendario(service):
    page_token = None
    todos = []
    while True:
        lista = service.calendarList().list(pageToken=page_token).execute()
        for cal in lista.get("items", []):
            todos.append(cal)
            if NOMBRE_CALENDARIO.lower() in cal["summary"].lower():
                return cal
        page_token = lista.get("nextPageToken")
        if not page_token:
            break

    # No se encontro: mostramos los disponibles para ayudar a ajustar el nombre.
    print(f"\nNo encontre ningun calendario que contenga '{NOMBRE_CALENDARIO}'.")
    print("Calendarios disponibles:")
    for cal in todos:
        print(f"  - {cal['summary']}")
    return None


# ---------------------------------------------------------------------------
# TRAER TODOS LOS EVENTOS (con paginacion)
# ---------------------------------------------------------------------------
def obtener_eventos(service, calendar_id):
    eventos = []
    page_token = None
    while True:
        resultado = (
            service.events()
            .list(
                calendarId=calendar_id,
                singleEvents=True,     # expande eventos recurrentes
                orderBy="startTime",
                maxResults=2500,       # maximo por pagina
                pageToken=page_token,
            )
            .execute()
        )
        eventos.extend(resultado.get("items", []))
        page_token = resultado.get("nextPageToken")
        if not page_token:
            break
    return eventos


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
def main():
    try:
        creds = obtener_credenciales()
        service = build("calendar", "v3", credentials=creds)

        # 1. Encontrar el calendario de instalacion
        calendario = buscar_calendario(service)
        if not calendario:
            return
        calendar_id = calendario["id"]
        print(f"Calendario encontrado: {calendario['summary']} ({calendar_id})")

        # Color por defecto del calendario (lo que usan los eventos SIN colorId propio)
        color_defecto_id = calendario.get("colorId", "")
        color_defecto_fondo = calendario.get("backgroundColor", "")

        # 2. Paleta de colores de eventos -> {colorId: {background, foreground}}
        colores = service.colors().get().execute().get("event", {})

        # 3. Traer todos los eventos
        eventos = obtener_eventos(service, calendar_id)
        print(f"Eventos encontrados: {len(eventos)}")

        # 4. Escribir CSV
        with open(ARCHIVO_SALIDA, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            writer.writerow([
                "id",
                "titulo",
                "inicio",
                "fin",
                "todo_el_dia",
                "color_id",
                "color_nombre",
                "etiqueta",
                "color_hex",
                "usa_color_predeterminado",
                "color",
                "telefono",
                "nombre",
                "pendiente",
                "cotizacion",
                "p",
                "requerimiento",
                "notas",
                "descripcion",
                "ubicacion",
            ])

            escritos = 0
            excluidos = 0
            fuera_de_anio = 0
            for ev in eventos:
                titulo = ev.get("summary", "(sin titulo)")

                # Excluir titulos no deseados (ej. Chequeo de Fugas de aire y gas)
                if titulo_excluido(titulo):
                    excluidos += 1
                    continue

                inicio = ev["start"].get("dateTime", ev["start"].get("date", ""))
                fin = ev["end"].get("dateTime", ev["end"].get("date", ""))
                todo_el_dia = "date" in ev["start"]

                # Filtrar por año de inicio
                if ANIO_FILTRO and not str(inicio).startswith(ANIO_FILTRO):
                    fuera_de_anio += 1
                    continue

                color_id = ev.get("colorId")
                if color_id:
                    # El evento tiene un color propio asignado
                    usa_defecto = "No"
                    color_hex = colores.get(color_id, {}).get("background", "")
                else:
                    # Sin colorId -> usa el color del calendario
                    usa_defecto = "Si"
                    color_id = color_defecto_id
                    color_hex = color_defecto_fondo

                color_nombre, etiqueta = COLOR_POR_HEX.get(
                    (color_hex or "").lower(), ("Otro", "NONE")
                )

                desc_limpia = limpiar_descripcion(ev.get("description", ""))
                d = parsear_descripcion(desc_limpia)

                writer.writerow([
                    ev.get("id", ""),
                    titulo,
                    inicio,
                    fin,
                    "Si" if todo_el_dia else "No",
                    color_id,
                    color_nombre,
                    etiqueta,
                    color_hex,
                    usa_defecto,
                    d["color"],
                    d["telefono"],
                    d["nombre"],
                    d["pendiente"],
                    d["cotizacion"],
                    d["p"],
                    d["requerimiento"],
                    d["notas"],
                    desc_limpia,
                    ev.get("location", ""),
                ])
                escritos += 1

        print(f"\nListo. CSV generado: {ARCHIVO_SALIDA}")
        print(f"Eventos escritos: {escritos} | Excluidos por titulo: {excluidos} | Fuera de {ANIO_FILTRO or 'cualquier año'}: {fuera_de_anio}")


        # 5. Leyenda de color -> etiqueta usada
        print("\nLeyenda (color_hex -> nombre / etiqueta):")
        for hexv, (nombre, etiqueta) in COLOR_POR_HEX.items():
            print(f"  {hexv} = {nombre:<18} | {etiqueta}")

    except HttpError as error:
        print(f"Ocurrio un error con la API: {error}")


if __name__ == "__main__":
    main()