/** Alerta individual mostrada en la sección colapsable "Alertas activas". */
export interface Alerta {
  nivel: "red" | "orange";
  texto: string;
}
