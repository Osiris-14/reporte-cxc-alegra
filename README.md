# 📊 Reporte de Cuentas por Cobrar (CxC)

Proyecto de automatización de datos y visualización enfocado en análisis financiero, utilizando Python, GitHub Actions y Power BI.

---

## 🚀 Descripción

Este proyecto extrae datos de cuentas por cobrar desde la API de Alegra, los transforma en un archivo CSV actualizado automáticamente y los conecta a un dashboard en Power BI Service para su análisis en tiempo real.

El objetivo es simular un flujo de datos empresarial donde la información se actualiza sin intervención manual.

---

## ⚙️ Arquitectura del Proyecto

API Alegra → Python Script → CSV → GitHub → Power BI Service → Dashboard

---

## 🔄 Automatización

### GitHub Actions (ETL automatizado)
El script de Python se ejecuta automáticamente en los siguientes horarios:

- 7:00 AM  
- 11:30 AM  
- 5:00 PM  

Esto genera un CSV actualizado dentro del repositorio.

---

### Power BI Service (Actualización del Dashboard)

El dashboard se actualiza automáticamente en:

- 8:00 AM  
- 12:00 PM  
- 6:00 PM  

Siempre consumiendo la última versión del CSV desde GitHub.

---

## 🛠️ Tecnologías utilizadas

- Python (requests, pandas)
- GitHub Actions (automatización)
- Power BI (visualización)
- API REST (Alegra)
- Git / GitHub

---

## 📂 Estructura del proyecto
