import { whatsappText } from "./format";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export function projectListAnswer(
  message: string,
  projects: any[],
  user: { id: string; rol: string },
) {
  const text = normalize(message);
  if (!/\b(?:obras|proyectos)\b|\bmas de un[ao] (?:obra|proyecto)\b/.test(text))
    return null;
  // Una consulta de listado no debe absorber solicitudes de registro o de otros módulos.
  if (
    /\b(?:crea|crear|registra|registrar|actualiza|actualizar|edita|editar|cambia|cambiar|elimina|eliminar|borra|borrar|asigna|asignar|retira|retirar|paga|pagar|cotiza|cotizar|envia|enviar|agrega|agregar|anade|anadir|modifica|modificar|marca|marcar|reporta|reportar|guarda|guardar|inicia|iniciar|termina|terminar|pausa|pausar|cancela|cancelar|reabre|reabrir|material|materiales|pago|pagos|costo|costos|cliente|clientes|trabajador|trabajadores|presupuesto|presupuestos|saldo|saldos|gasto|gastos|ingreso|ingresos|rol|roles|permisos|equipo|asistencia|fotos|documentos|incidentes|vencidas|vencidos|atrasadas|atrasados|retrasadas|retrasados)\b/.test(
      text,
    )
  )
    return null;
  if (
    !/\b(?:cuales|cuantas|lista|listar|listame|listado|muestra|muestrame|dime|tengo|tenemos|asignad[oa]s?|pertenezco|trabajo|mis|todas)\b/.test(
      text,
    )
  )
    return null;
  const assignedOnly =
    user.rol !== "admin" ||
    /\b(?:asignad[oa]s?|pertenezco|trabajo)\b/.test(text);
  let selected = projects.filter(
    (project) => !assignedOnly || project.trabajadores_ids?.includes(user.id),
  );
  const states = /\btodas\b/.test(text)
    ? []
    : [
        ...(/\b(?:activas|activ[oas]*|en curso)\b/.test(text)
          ? ["activo"]
          : []),
        ...(/\b(?:terminadas|terminados|finalizadas|finalizados)\b/.test(text)
          ? ["terminado"]
          : []),
        ...(/\b(?:pausadas|pausados)\b/.test(text) ? ["pausado"] : []),
        ...(/\bpendientes\b/.test(text) ? ["pendiente"] : []),
        ...(/\bcanceladas\b/.test(text) ? ["cancelada"] : []),
      ];
  if (states.length)
    selected = selected.filter((project) => states.includes(project.estado));
  const labels: Record<string, string> = {
    activo: "En curso",
    terminado: "Terminada",
    pausado: "Pausada",
    pendiente: "Pendiente",
    cancelada: "Cancelada",
  };
  const safe = (value: string) =>
    String(value)
      .replace(/[\r\n*]+/g, " ")
      .trim();
  const title = assignedOnly ? "Tus obras asignadas" : "Obras de tu empresa";
  const respuesta = selected.length
    ? `*${title} (${selected.length})*\n\n` +
      selected
        .map((project, index) => {
          const progress =
            project.porcentaje_avance_ponderado ?? project.porcentaje_avance;
          return [
            `*${index + 1}. ${safe(project.nombre)}*`,
            `• Estado: ${labels[project.estado] || "Sin estado informado"}`,
            typeof progress === "number" && Number.isFinite(progress)
              ? `• Avance: ${progress.toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`
              : "",
            project.comuna ? `• Comuna: ${safe(project.comuna)}` : "",
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n\n")
    : assignedOnly
      ? "No hay obras asignadas que coincidan con tu consulta. Puedes pedir al administrador que revise tus asignaciones."
      : "No hay obras de tu empresa que coincidan con tu consulta.";
  return {
    respuesta: whatsappText(respuesta),
    accion: null,
    cotizacion: null,
    obra_propuesta: null,
    sugerencias: [],
  };
}
