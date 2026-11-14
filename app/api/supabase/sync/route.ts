import { chileToday } from '@/lib/ai/project-deadlines';
import { assertAttendanceManager } from '@/lib/attendance-access';

import { normalizeSpecialties } from "@/lib/team-specialties";
import { syncWriteFailure } from "@/lib/sync/failure";
import { projectStatuses } from "@/lib/project-status";
import { NextRequest, NextResponse } from "next/server";
import { authorizeAI, errorJSON } from "@/lib/ai/server";
import { AIError } from "@/lib/ai/errors";
import { loadAIContext, checkedRows } from "@/lib/ai/context";
import { persistentFile, signRows } from "@/lib/supabase/private-files";
const mapping: Record<string, string> = {
  proyectos: "proyectos",
  clientes: "clientes",
  usuarios: "usuarios",
  actividades: "actividades",
  pagos: "pagos",
  materiales: "materiales_proyecto",
  bitacora: "bitacora_entradas",
  imprevistos: "imprevistos",
  reclamos_cambios: "reclamos_cambios_obra",
  documentos: "documentos_obra",
  asistencias: "asistencia_obreros",
  reportes_whatsapp: "reportes_whatsapp",
};
async function checked(query: any, record = "el registro") {
  const result = await query;
  if (result.error) throw syncWriteFailure(result.error, record);
  return result.data;
}
async function validateSync(client: any, user: any, body: any) {
  const { tables } = await loadAIContext(client, user);
  for (const [key, rows] of Object.entries(body)) {
    if (!Object.hasOwn(mapping,key) || !Array.isArray(rows) || rows.length > 1000)
      throw new AIError(
        "SYNC_INVALID",
        "El formato de sincronización no es válido.",
        400,
      );
  }
  const all = (key: string, table: string) => [
    ...(tables[table] || []),
    ...(body[key] || []),
  ];
  const projects = new Set(all("proyectos", "proyectos").map((p) => p.id));
  const users = new Set(all("usuarios", "usuarios").map((u) => u.id));
  const clients = new Set(all("clientes", "clientes").map((c) => c.id));
  if (body.asistencias?.length) assertAttendanceManager(user);
  for (const [key, rows] of Object.entries(body) as [string, any[]][])
    for (const row of rows) {
      if (
        typeof row.id !== "string" ||
        !row.id ||
        (row.empresa_id && row.empresa_id !== user.empresa_id)
      )
        throw new AIError("SYNC_FORBIDDEN", "Registro de otra cuenta.", 403);
      if (
        user.rol === "terreno" &&
        (!["bitacora", "reportes_whatsapp"].includes(key) ||
          (row.usuario_id && row.usuario_id !== user.id) ||
          (row.registrado_por && row.registrado_por !== user.id))
      )
        throw new AIError(
          "SYNC_FORBIDDEN",
          "Tu perfil solo puede registrar sus reportes y asistencia.",
          403,
        );
      if (
        key === "proyectos" &&
        !projectStatuses.some((status) => status.value === row.estado)
      )
        throw new AIError(
          "SYNC_INVALID",
          "El estado de la obra no es válido. Actualiza la página e intenta nuevamente.",
          400,
        );
      if (row.proyecto_id && !projects.has(row.proyecto_id))
        throw new AIError(
          "PROJECT_FORBIDDEN",
          "La obra no está disponible para tu cuenta.",
          403,
        );
      if (row.cliente_id && !clients.has(row.cliente_id))
        throw new AIError(
          "SYNC_FORBIDDEN",
          "El cliente no está disponible para tu cuenta.",
          403,
        );
      for (const id of [
        row.usuario_id,
        row.responsable_id,
        ...(row.trabajadores_ids || []),
      ].filter(Boolean))
        if (!users.has(id))
          throw new AIError(
            "SYNC_FORBIDDEN",
            "El trabajador no pertenece a tu empresa.",
            403,
          );
      if(key==='materiales' && (!Number.isFinite(Number(row.cantidad)) || Number(row.cantidad)<=0)) throw new AIError('SYNC_INVALID','La cantidad de material debe ser mayor que cero.',422);
      if(key==='bitacora' && row.material_id && (!Number.isFinite(Number(row.cantidad_recibida)) || Number(row.cantidad_recibida)<=0)) throw new AIError('SYNC_INVALID','Revisa la cantidad recibida.',422);
      if(key==='imprevistos' && row.categoria_gasto && !['imprevisto','mano_obra','gasto_general'].includes(row.categoria_gasto)) throw new AIError('SYNC_INVALID','Revisa la categoría del gasto.',422);
      if(key==='proyectos' && row.dias_laborales && (!Array.isArray(row.dias_laborales)||!row.dias_laborales.length||row.dias_laborales.some((day:any)=>!Number.isInteger(day)||day<0||day>6))) throw new AIError('SYNC_INVALID','Selecciona días válidos para trabajar.',422);
      if (key === "usuarios") {
        const existing = tables.usuarios.find((u) => u.id === row.id);
        const editableTeamRole =
          existing &&
          user.rol === "admin" &&
          !existing.auth_user_id &&
          !existing.is_dev &&
          ["supervisor", "terreno"].includes(existing.rol) &&
          ["supervisor", "terreno"].includes(row.rol);
        if (
          (!existing &&
            (!["supervisor", "terreno"].includes(row.rol) ||
              row.auth_user_id)) ||
          (existing &&
            ((Object.hasOwn(row, "rol") &&
              row.rol !== existing.rol &&
              !editableTeamRole) ||
              (Object.hasOwn(row, "auth_user_id") &&
                (row.auth_user_id || null) !==
                  (existing.auth_user_id || null))))
        )
          throw new AIError(
            "SYNC_FORBIDDEN",
            "Los permisos de acceso no se cambian mediante sincronización.",
            403,
          );
      }
    }
  return tables;
}
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const { client, user } = await authorizeAI(request);
    const { company, tables, service } = await loadAIContext(client, user);
    const ids = tables.proyectos.map((p) => p.id);
    const reports = ids.length
      ? checkedRows(
          await client
            .from("reportes_whatsapp")
            .select("*")
            .in("proyecto_id", ids),
        )
      : [];
    const mediaClient = client;
    const allowed = new Set<string>(ids);
    const [documents, log, incidents, changes, reportFiles, payments] =
      await Promise.all([
        signRows(
          tables.documentos_obra,
          ["archivo_url"],
          user.empresa_id,
          allowed,
          mediaClient,
        ),
        signRows(
          tables.bitacora_entradas,
          ["foto_url"],
          user.empresa_id,
          allowed,
          mediaClient,
        ),
        signRows(
          service.getImprevistos(),
          ["foto_url"],
          user.empresa_id,
          allowed,
          mediaClient,
        ),
        signRows(
          tables.reclamos_cambios_obra,
          ["foto_url"],
          user.empresa_id,
          allowed,
          mediaClient,
        ),
        signRows(reports, ["foto_url"], user.empresa_id, allowed, mediaClient),
        signRows(
          service.getPagos(),
          ["comprobante_url"],
          user.empresa_id,
          allowed,
          mediaClient,
        ),
      ]);
    return NextResponse.json(
      {
        success: true,
        empresaId: user.empresa_id,
        empresa: company
          ? {
              id: company.id,
              nombre: company.nombre || "",
              rut: company.rut || null,
              plan_id: service.getActivePlan(),
              logo_url: company.logo_url || null,
              configuracion: company.configuracion || {},
            }
          : null,
        plan_id: service.getActivePlan(),
        agenda: service.getEventosAgenda(),
        proyectos: service.getProyectos(),
        clientes: tables.clientes,
        usuarios: tables.usuarios,
        actividades: tables.actividades,
        pagos: payments,
        materiales: tables.materiales_proyecto,
        bitacora: log,
        imprevistos: incidents,
        reclamos_cambios: changes,
        documentos: documents,
        asistencias: tables.asistencia_obreros,
        reportes_whatsapp: reportFiles,
        updated_at: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorJSON(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    const { client: sb, user } = await authorizeAI(request);
    const input = await request.json();
    if (!input.cambios || typeof input.cambios !== "object")
      throw new AIError(
        "SYNC_VERSION",
        "Actualiza la página antes de sincronizar.",
        409,
      );
    const empresaId = user.empresa_id;
    const body = input.cambios;
    const tables = await validateSync(sb, user, body);
    if(body.documentos?.some((row:any)=>['cierre_diario','acta_recepcion'].includes(row.categoria)))throw new AIError('DOCUMENT_RPC','Confirma el cierre o la recepción desde el formulario correspondiente.',422);
    if(body.materiales?.some((row:any)=>row.actividad_id&&!tables.actividades.some((activity:any)=>activity.id===row.actividad_id&&activity.proyecto_id===row.proyecto_id)))throw new AIError('MATERIAL_ACTIVITY','La partida no pertenece a esta obra.',422);

    const removed = input.eliminados || {};
    if(typeof removed!=='object' || Array.isArray(removed)) throw new AIError('SYNC_INVALID','El formato de las eliminaciones no es válido.',400);
    for(const [key,ids] of Object.entries(removed)) {
      if(!Object.hasOwn(mapping,key) || !Array.isArray(ids) || ids.length>1000 || ids.some(id=>typeof id!=='string'||!id||id.length>150)) throw new AIError('SYNC_INVALID','La eliminación no es válida.',400);
      if(key==='asistencias')assertAttendanceManager(user);
      if(key==='usuarios' && ids.some(id=>tables.usuarios.some((u:any)=>u.id===id && (u.auth_user_id || u.is_dev || u.id===user.id)))) throw new AIError('SYNC_FORBIDDEN','No puedes eliminar una cuenta con acceso mediante esta acción.',403);
    }


    // 2. Sincronizar Clientes
    if (Array.isArray(body.clientes) && body.clientes.length > 0) {
      for (const c of body.clientes) {
        await checked(
          sb.from("clientes").upsert(
            {
              id: c.id,
              empresa_id: empresaId,
              rut: c.rut || null,
              nombre: c.nombre,
              telefono: c.telefono || null,
              email: c.email || null,
              direccion: c.direccion || null,
              comuna: c.comuna || null,
            },
            { onConflict: "id" },
          ),
          `el cliente «${c.nombre}»`,
        );
      }
    }

    // Actualizar fichas existentes sin volver a insertar cuentas ni tocar sus privilegios.
    if (Array.isArray(body.usuarios)) {
      for (const u of body.usuarios) {
        const existing = tables.usuarios.find((row: any) => row.id === u.id);
        const fields = Object.fromEntries(
          ["nombre", "email", "telefono_whatsapp", "rut"]
            .filter((key) => Object.hasOwn(u, key))
            .map((key) => [key, key === "nombre" ? u[key] : u[key] || null]),
        );
        if (Object.hasOwn(u, "especialidades")) fields.especialidades = normalizeSpecialties(u.especialidades);
        if (existing) {
          if (Object.hasOwn(u, "rol") && u.rol !== existing.rol)
            fields.rol = u.rol;
          if (!Object.keys(fields).length) continue;
          const saved = await checked(
            sb
              .from("usuarios")
              .update(fields)
              .eq("id", u.id)
              .eq("empresa_id", empresaId)
              .select("id"),
            `la ficha de «${u.nombre || existing.nombre}»`,
          );
          if (!saved?.length)
            throw new AIError(
              "SYNC_SAVE",
              "La ficha del equipo ya no está disponible. Los cambios siguen pendientes en este dispositivo.",
              409,
            );
        } else {
          await checked(
            sb
              .from("usuarios")
              .upsert(
                { id: u.id, empresa_id: empresaId, ...fields, rol: u.rol },
                { onConflict: "id" },
              ),
            `la ficha de «${u.nombre || u.id}»`,
          );
        }
      }
    }

    // 4. Sincronizar Proyectos y asignaciones proyecto_trabajadores
    if (Array.isArray(body.proyectos) && body.proyectos.length > 0) {
      for (const p of body.proyectos) {
        await checked(
          sb.from("proyectos").upsert(
            {
              id: p.id,
              empresa_id: empresaId,
              cliente_id: p.cliente_id || null,
              nombre: p.nombre,
              descripcion: p.descripcion || null,
              direccion: p.direccion || null,
              comuna: p.comuna || null,
              region: p.region || null,
              latitud: p.latitud ?? null,
              longitud: p.longitud ?? null,
              lugar_referencia: p.lugar_referencia || null,
              fecha_inicio:
                p.fecha_inicio || chileToday(),
              fecha_termino_estimada:
                p.fecha_termino_estimada ||
                new Date(Date.now() + 86400000 * 30)
                  .toISOString()
                  .split("T")[0],
              estado: p.estado,
              monto_cotizado: Number(p.monto_cotizado) || 0,
              dias_laborales: p.dias_laborales ?? tables.proyectos.find((row:any)=>row.id===p.id)?.dias_laborales ?? [1,2,3,4,5],
              fechas_no_laborales: p.fechas_no_laborales ?? tables.proyectos.find((row:any)=>row.id===p.id)?.fechas_no_laborales ?? [],
            },
            { onConflict: "id" },
          ),
          `la obra «${p.nombre}»`,
        );

        if (Array.isArray(p.trabajadores_ids)) {
          await checked(
            sb.from("proyecto_trabajadores").delete().eq("proyecto_id", p.id),
            `la asignación de la obra «${p.nombre}»`,
          );
          for (const uid of p.trabajadores_ids) {
            await checked(
              sb
                .from("proyecto_trabajadores")
                .upsert({ proyecto_id: p.id, usuario_id: uid }),
              `la asignación de la obra «${p.nombre}»`,
            );
          }
        }
      }
    }

    // 5. Sincronizar Actividades Gantt
    if (Array.isArray(body.actividades) && body.actividades.length > 0) {
      for (const a of body.actividades) {
        await checked(
          sb.from("actividades").upsert(
            {
              id: a.id,
              proyecto_id: a.proyecto_id,
              responsable_id: a.responsable_id || null,
              nombre: a.nombre,
              fecha_inicio: a.fecha_inicio,
              fecha_termino: a.fecha_termino,
              porcentaje_avance: Number(a.porcentaje_avance) || 0,
              monto_contratado: a.monto_contratado ?? tables.actividades.find((row:any)=>row.id===a.id)?.monto_contratado ?? null,
              estado: ["pendiente", "en_curso", "terminada"].includes(a.estado)
                ? a.estado
                : "pendiente",
              orden: Number(a.orden) || 1,
            },
            { onConflict: "id" },
          ),
          `la partida «${a.nombre}»`,
        );
      }
    }

    // 6. Sincronizar Materiales
    if (Array.isArray(body.materiales) && body.materiales.length > 0) {
      for (const m of body.materiales) {
        await checked(
          sb.from("materiales_proyecto").upsert(
            {
              id: m.id,
              proyecto_id: m.proyecto_id,
              nombre: m.nombre,
              categoria: m.categoria || "General",
              cantidad: Number(m.cantidad) || 1,
              unidad: m.unidad || "unidad",
              precio_unitario: Number(m.precio_unitario) || 0,
              subtotal:
                Number(
                  m.subtotal ?? Number(m.cantidad) * Number(m.precio_unitario),
                ) || 0,
              proveedor: m.proveedor || null,
              actividad_id:m.actividad_id??tables.materiales_proyecto.find((row:any)=>row.id===m.id)?.actividad_id??null,
              comprado: Boolean(m.comprado),
              pagado: m.pagado ?? null,
            },
            { onConflict: "id" },
          ),
          `el material «${m.nombre}»`,
        );
      }
    }

    // 7. Sincronizar Pagos
    if (Array.isArray(body.pagos) && body.pagos.length > 0) {
      for (const pay of body.pagos) {
        await checked(
          sb.from("pagos").upsert(
            {
              id: pay.id,
              proyecto_id: pay.proyecto_id,
              cliente_id: pay.cliente_id || null,
              monto: Number(pay.monto) || 0,
              metodo: [
                "transferencia",
                "efectivo",
                "debito",
                "credito",
              ].includes(pay.metodo)
                ? pay.metodo
                : "transferencia",
              estado: pay.estado || "completado",
              fecha: pay.fecha || chileToday(),
              notas: pay.notas || pay.nota || null,
              comprobante_url: persistentFile(pay.comprobante_url) || null,
            },
            { onConflict: "id" },
          ),
          `el pago «${pay.id}»`,
        );
      }
    }

    // 8. Sincronizar Bitácora
    if (Array.isArray(body.bitacora) && body.bitacora.length > 0) {
      for (const b of body.bitacora) {
        await checked(
          sb.from("bitacora_entradas").upsert(
            {
              id: b.id,
              proyecto_id: b.proyecto_id,
              usuario_id: b.usuario_id || null,
              autor_nombre: b.autor_nombre || "Terreno",
              titulo: b.titulo,
              nota: b.nota,
              foto_url: persistentFile(b.foto_url) || null,
              material_id: b.material_id || null,
              cantidad_recibida: b.cantidad_recibida ?? null,
              tipo: [
                "avance",
                "incidente",
                "clima",
                "entrega_material",
              ].includes(b.tipo)
                ? b.tipo
                : "avance",
              fecha: b.fecha || chileToday(),
            },
            { onConflict: "id" },
          ),
          `el registro de bitácora «${b.titulo}»`,
        );
      }
    }

    // 9. Sincronizar Imprevistos
    if (Array.isArray(body.imprevistos) && body.imprevistos.length > 0) {
      for (const imp of body.imprevistos) {
        await checked(
          sb.from("imprevistos").upsert(
            {
              id: imp.id,
              proyecto_id: imp.proyecto_id,
              titulo:
                imp.titulo || imp.descripcion?.slice(0, 80) || "Imprevisto",
              descripcion: imp.descripcion || "Imprevisto en obra",
              monto_adicional: Number(imp.monto ?? imp.monto_adicional) || 0,
              categoria_gasto: imp.categoria_gasto || 'imprevisto',
              usuario_id: imp.usuario_id || null,
              pagado: imp.pagado ?? null,
              estado: imp.estado || "pendiente",
              origen: imp.origen === "whatsapp_ia" ? "whatsapp_ia" : "manual",
              foto_url: persistentFile(imp.foto_url) || null,
              fecha_reporte:
                imp.fecha || chileToday(),
            },
            { onConflict: "id" },
          ),
          `el imprevisto «${imp.titulo || imp.id}»`,
        );
      }
    }

    // 10. Sincronizar Módulos V2 (Reclamos/Cambios, Documentos, Asistencias, Reportes WhatsApp)
    // Escribe tanto en el Cloud V2 Ledger de Supabase Storage como en las tablas SQL nativas si existen
    // Intentar sincronizar también en las tablas SQL V2 si ya fueron creadas
    if (Array.isArray(body.reclamos_cambios)) {
      for (const rc of body.reclamos_cambios) {
        await checked(
          sb.from("reclamos_cambios_obra").upsert(
            {
              id: rc.id,
              proyecto_id: rc.proyecto_id,
              empresa_id: empresaId,
              tipo: rc.tipo,
              prioridad: rc.prioridad,
              estado: rc.estado,
              titulo: rc.titulo,
              descripcion: rc.descripcion,
              solicitado_por: rc.solicitado_por || null,
              impacto_monto: Number(rc.impacto_monto) || 0,
              impacto_dias: Number(rc.impacto_dias) || 0,
              materiales_requeridos: rc.materiales_requeridos || [],
              materiales_inyectados: Boolean(rc.materiales_inyectados),
              foto_url: persistentFile(rc.foto_url) || null,
              origen: rc.origen || "web",
              resolucion_notas: rc.resolucion_notas || null,
              fecha: rc.fecha || chileToday(),
            },
            { onConflict: "id" },
          ),
          `el reclamo o cambio «${rc.titulo}»`,
        );
      }
    }

    if (Array.isArray(body.documentos)) {
      for (const doc of body.documentos) {
        await checked(
          sb.from("documentos_obra").upsert(
            {
              id: doc.id,
              proyecto_id: doc.proyecto_id,
              empresa_id: empresaId,
              subido_por_nombre: doc.subido_por_nombre || null,
              categoria: doc.categoria,
              nombre: doc.nombre,
              descripcion: doc.descripcion || null,
              archivo_url: persistentFile(doc.archivo_url) || null,
              archivo_nombre: doc.archivo_nombre || null,
              archivo_tamano: doc.archivo_tamano ?? null,
              mime_type: doc.mime_type || null,
              numero_documento: doc.numero_documento || null,
              proveedor_entidad: doc.proveedor_entidad || null,
              monto_documento: doc.monto_documento ?? null,
              correo_remitente: doc.correo_remitente || null,
              correo_destinatario: doc.correo_destinatario || null,
              correo_asunto: doc.correo_asunto || null,
              correo_cuerpo: doc.correo_cuerpo || null,
              fecha_documento:
                doc.fecha_documento || chileToday(),
            },
            { onConflict: "id" },
          ),
          `el documento «${doc.nombre}»`,
        );
      }
    }

    if (Array.isArray(body.asistencias)) {
      for (const asis of body.asistencias) {
        await checked(
          sb.from("asistencia_obreros").upsert(
            {
              id: asis.id,
              proyecto_id: asis.proyecto_id,
              empresa_id: empresaId,
              usuario_id: asis.usuario_id || null,
              trabajador_nombre: asis.trabajador_nombre,
              trabajador_rol: asis.trabajador_rol || null,
              fecha: asis.fecha,
              estado: asis.estado,
              hora_entrada: asis.hora_entrada || null,
              hora_salida: asis.hora_salida || null,
              horas_trabajadas: Number(asis.horas_trabajadas) || 0,
              observacion: asis.observacion || null,
              origen: asis.origen || "web",
              registrado_por: user.nombre,
            },
            { onConflict: "id" },
          ),
          `la asistencia de «${asis.trabajador_nombre}»`,
        );
      }
    }

    for (const r of body.reportes_whatsapp || [])
      await checked(
        sb.from("reportes_whatsapp").upsert(
          {
            id: r.id,
            empresa_id: empresaId,
            proyecto_id: r.proyecto_id || null,
            telefono: r.telefono || "",
            mensaje_recibido: r.mensaje_original || r.mensaje_recibido || "",
            respuesta_enviada: r.transcripcion || "",
            fecha_envio: r.fecha || new Date().toISOString(),
            estado: r.estado || "procesado",
            respuesta_ia: r.transcripcion || "",
            modulo_afectado: "reportes",
          },
          { onConflict: "id" },
        ),
        `el reporte de WhatsApp «${r.id}»`,
      );
    for(const key of ['asistencias','documentos','reclamos_cambios','reportes_whatsapp','bitacora','pagos','materiales','imprevistos','actividades','proyectos','clientes','usuarios']) {
      const ids = removed[key];
      if(!ids?.length) continue;
      let query = sb.from(mapping[key]).delete().in('id',ids);
      query = ['proyectos','clientes','usuarios','documentos','reclamos_cambios','asistencias','reportes_whatsapp'].includes(key)
        ? query.eq('empresa_id',empresaId)
        : query.in('proyecto_id',tables.proyectos.map((p:any)=>p.id));
      await checked(query,'la eliminación solicitada');
    }
    return NextResponse.json({
      success: true,
      updated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    return errorJSON(err);
  }
}
