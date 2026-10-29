import type { DataService } from "@/lib/data-service";

export type Row = Record<string, any> & { id: string };
export type Snapshot = Record<string, Row[]>;
const pick = (row: any, fields: string) =>
  Object.fromEntries(
    fields
      .split(",")
      .filter((k) => row[k] !== undefined)
      .map((k) => [k, row[k]]),
  ) as Row;
export function snapshot(service: DataService, empresa_id: string): Snapshot {
  return {
    clientes: service.getClientes().map((x) => ({
      ...pick(x, "id,nombre,telefono,email,direccion"),
      empresa_id,
      rut: x.rut || null,
    })),
    usuarios: service.getUsuarios().map((x) => ({
      ...pick(x, "id,nombre,rol,auth_user_id"),
      empresa_id,
      rut: x.rut || null,
      email: x.email || null,
      telefono_whatsapp: x.telefono_whatsapp || null,
    })),
    proyectos: service.getProyectos().map((x) => ({
      ...pick(
        x,
        "id,cliente_id,nombre,descripcion,direccion,comuna,region,latitud,longitud,lugar_referencia,fecha_inicio,fecha_termino_estimada,estado,monto_cotizado",
      ),
      empresa_id,
      trabajadores_ids: x.trabajadores_ids || [],
    })),
    actividades: service
      .getActividades()
      .map((x) =>
        pick(
          x,
          "id,proyecto_id,nombre,responsable_id,fecha_inicio,fecha_termino,porcentaje_avance,estado,orden",
        ),
      ),
    materiales_proyecto: service
      .getMaterialesProyecto()
      .map((x) =>
        pick(
          x,
          "id,proyecto_id,nombre,categoria,cantidad,unidad,precio_unitario,subtotal,proveedor,comprado",
        ),
      ),
    pagos: service.getPagos().map((x) => ({
      ...pick(
        x,
        "id,proyecto_id,cliente_id,monto,metodo,estado,fecha,comprobante_url",
      ),
      notas: x.nota || x.notas || null,
    })),
    bitacora_entradas: service
      .getBitacora()
      .map((x) =>
        pick(
          x,
          "id,proyecto_id,usuario_id,autor_nombre,titulo,nota,foto_url,fecha,tipo",
        ),
      ),
    imprevistos: service.getImprevistos().map((x) => ({
      ...pick(x, "id,proyecto_id,actividad_id,descripcion,estado,origen"),
      titulo: x.titulo || x.descripcion.slice(0, 80),
      monto_adicional: x.monto,
      fecha_reporte: x.fecha,
    })),
    agenda_eventos: service.getEventosAgenda().map((x) => ({
      ...pick(x, "id,proyecto_id,usuario_id,titulo,tipo"),
      empresa_id,
      fecha_inicio: `${x.fecha}T${x.hora || "09:00"}:00`,
      fecha_fin: `${x.fecha}T${x.hora || "09:00"}:00`,
    })),
    reclamos_cambios_obra: service.getReclamosCambios().map((x) => ({
      ...pick(
        x,
        "id,proyecto_id,cliente_id,tipo,prioridad,estado,titulo,descripcion,solicitado_por,impacto_monto,impacto_dias,materiales_requeridos,materiales_inyectados,foto_url,origen,resolucion_notas,fecha",
      ),
      empresa_id,
    })),
    documentos_obra: service.getDocumentosObra().map((x) => ({
      ...pick(
        x,
        "id,proyecto_id,subido_por_nombre,categoria,nombre,descripcion,archivo_url,archivo_nombre,archivo_tamano,mime_type,numero_documento,proveedor_entidad,monto_documento,correo_remitente,correo_destinatario,correo_asunto,correo_cuerpo,fecha_documento",
      ),
      empresa_id,
    })),
    asistencia_obreros: service.getAsistencias().map((x) => ({
      ...pick(
        x,
        "id,proyecto_id,usuario_id,trabajador_nombre,trabajador_rol,fecha,estado,hora_entrada,hora_salida,horas_trabajadas,observacion,origen,registrado_por",
      ),
      empresa_id,
    })),
    reportes_whatsapp: service.getReportes().map((x) => ({
      id: x.id,
      proyecto_id: x.proyecto_id,
      empresa_id,
      telefono: "",
      mensaje_recibido: x.mensaje_original || "",
      respuesta_enviada: x.transcripcion || "",
      fecha_envio: x.fecha,
      estado: x.estado,
      respuesta_ia: x.transcripcion || "",
      modulo_afectado: "reportes",
    })),
  };
}
export function changesBetween(before: Snapshot, after: Snapshot) {
  const changed: Snapshot = {},
    deleted: Snapshot = {};
  for (const table of Object.keys(after)) {
    const previous = new Map(
      before[table].map((x) => [x.id, JSON.stringify(x)]),
    );
    changed[table] = after[table].filter(
      (x) => previous.get(x.id) !== JSON.stringify(x),
    );
    const ids = new Set(after[table].map((x) => x.id));
    deleted[table] = before[table].filter((x) => !ids.has(x.id));
  }
  return { changed, deleted };
}
