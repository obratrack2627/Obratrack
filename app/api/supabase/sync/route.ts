import { NextRequest, NextResponse } from "next/server";
import { authorizeAI, errorJSON } from "@/lib/ai/server";
import { AIError } from "@/lib/ai/errors";
import { loadAIContext, checkedRows } from "@/lib/ai/context";
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
async function checked(query: any) {
  const result = await query;
  if (result.error)
    throw new AIError(
      "SYNC_SAVE",
      "No se pudo confirmar la sincronización. Los cambios siguen pendientes en este dispositivo.",
      503,
    );
  return result.data;
}
async function validateSync(client: any, user: any, body: any) {
  const { tables } = await loadAIContext(client, user);
  for (const [key, rows] of Object.entries(body)) {
    if (!mapping[key] || !Array.isArray(rows) || rows.length > 1000)
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
        (!["bitacora", "asistencias", "reportes_whatsapp"].includes(key) ||
          (row.usuario_id && row.usuario_id !== user.id) ||
          (row.registrado_por && row.registrado_por !== user.id))
      )
        throw new AIError(
          "SYNC_FORBIDDEN",
          "Tu perfil solo puede registrar sus reportes y asistencia.",
          403,
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
      if (key === "usuarios") {
        const existing = tables.usuarios.find((u) => u.id === row.id);
        if (
          (!existing &&
            (!["supervisor", "terreno"].includes(row.rol) ||
              row.auth_user_id)) ||
          (existing &&
            (row.rol !== existing.rol ||
              (row.auth_user_id || null) !== (existing.auth_user_id || null)))
        )
          throw new AIError(
            "SYNC_FORBIDDEN",
            "Los permisos de acceso no se cambian mediante sincronización.",
            403,
          );
      }
    }
}
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const { client, user } = await authorizeAI(request);
    const { tables, service } = await loadAIContext(client, user);
    const ids = tables.proyectos.map((p) => p.id);
    const reports = ids.length
      ? checkedRows(
          await client
            .from("reportes_whatsapp")
            .select("*")
            .in("proyecto_id", ids),
        )
      : [];
    return NextResponse.json(
      {
        success: true,
        empresaId: user.empresa_id,
        plan_id: service.getActivePlan(),
        agenda: service.getEventosAgenda(),
        proyectos: service.getProyectos(),
        clientes: tables.clientes,
        usuarios: tables.usuarios,
        actividades: tables.actividades,
        pagos: service.getPagos(),
        materiales: tables.materiales_proyecto,
        bitacora: tables.bitacora_entradas,
        imprevistos: service.getImprevistos(),
        reclamos_cambios: tables.reclamos_cambios_obra,
        documentos: tables.documentos_obra,
        asistencias: tables.asistencia_obreros,
        reportes_whatsapp: reports,
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
    await validateSync(sb, user, body);

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
            },
            { onConflict: "id" },
          ),
        );
      }
    }

    // 3. Sincronizar Usuarios / Obreros
    if (Array.isArray(body.usuarios) && body.usuarios.length > 0) {
      for (const u of body.usuarios) {
        await checked(
          sb.from("usuarios").upsert(
            {
              id: u.id,
              empresa_id: empresaId,
              nombre: u.nombre,
              email: u.email || null,
              rol: ["admin", "supervisor", "terreno"].includes(u.rol)
                ? u.rol
                : "terreno",
              telefono_whatsapp: u.telefono_whatsapp || "",
              is_dev: Boolean(u.is_dev),
            },
            { onConflict: "id" },
          ),
        );
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
                p.fecha_inicio || new Date().toISOString().split("T")[0],
              fecha_termino_estimada:
                p.fecha_termino_estimada ||
                new Date(Date.now() + 86400000 * 30)
                  .toISOString()
                  .split("T")[0],
              estado: ["activo", "terminado", "pausado"].includes(p.estado)
                ? p.estado
                : "activo",
              monto_cotizado: Number(p.monto_cotizado) || 0,
            },
            { onConflict: "id" },
          ),
        );

        if (Array.isArray(p.trabajadores_ids)) {
          await checked(
            sb.from("proyecto_trabajadores").delete().eq("proyecto_id", p.id),
          );
          for (const uid of p.trabajadores_ids) {
            await checked(
              sb
                .from("proyecto_trabajadores")
                .upsert({ proyecto_id: p.id, usuario_id: uid }),
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
              estado: ["pendiente", "en_curso", "terminada"].includes(a.estado)
                ? a.estado
                : "pendiente",
              orden: Number(a.orden) || 1,
            },
            { onConflict: "id" },
          ),
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
              comprado: Boolean(m.comprado),
            },
            { onConflict: "id" },
          ),
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
              fecha: pay.fecha || new Date().toISOString().split("T")[0],
              notas: pay.notas || pay.nota || null,
              comprobante_url: pay.comprobante_url || null,
            },
            { onConflict: "id" },
          ),
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
              foto_url: b.foto_url || null,
              tipo: [
                "avance",
                "incidente",
                "clima",
                "entrega_material",
              ].includes(b.tipo)
                ? b.tipo
                : "avance",
              fecha: b.fecha || new Date().toISOString().split("T")[0],
            },
            { onConflict: "id" },
          ),
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
              estado: imp.estado || "pendiente",
              origen: imp.origen === "whatsapp_ia" ? "whatsapp_ia" : "manual",
              foto_url: imp.foto_url || null,
              fecha_reporte:
                imp.fecha || new Date().toISOString().split("T")[0],
            },
            { onConflict: "id" },
          ),
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
              foto_url: rc.foto_url || null,
              origen: rc.origen || "web",
              resolucion_notas: rc.resolucion_notas || null,
              fecha: rc.fecha || new Date().toISOString().split("T")[0],
            },
            { onConflict: "id" },
          ),
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
              archivo_url: doc.archivo_url || null,
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
                doc.fecha_documento || new Date().toISOString().split("T")[0],
            },
            { onConflict: "id" },
          ),
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
              registrado_por: asis.registrado_por || null,
            },
            { onConflict: "id" },
          ),
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
      );
    return NextResponse.json({
      success: true,
      updated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    return errorJSON(err);
  }
}
