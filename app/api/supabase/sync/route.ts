import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdmin,
  readCloudV2Ledger,
  writeCloudV2Ledger,
} from '@/lib/supabase/admin';

const DEFAULT_EMPRESA_ID = 'e1111111-1111-4111-a111-111111111111';

export async function GET(request: NextRequest) {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) {
      return NextResponse.json({ error: 'Supabase no configurado' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const empresaId = searchParams.get('empresaId') || DEFAULT_EMPRESA_ID;

    // 1. Consultar tablas principales en paralelo
    const [proyectosRes, clientesRes, usuariosRes, ptRes, ledgerV2] = await Promise.all([
      sb.from('proyectos').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }),
      sb.from('clientes').select('*').eq('empresa_id', empresaId),
      sb.from('usuarios').select('*').eq('empresa_id', empresaId),
      sb.from('proyecto_trabajadores').select('*'),
      readCloudV2Ledger(empresaId),
    ]);

    const proyectosRaw = proyectosRes.data || [];
    const projIds = proyectosRaw.map((p: any) => p.id);

    let actividades: any[] = [];
    let pagos: any[] = [];
    let materiales: any[] = [];
    let bitacora: any[] = [];
    let imprevistos: any[] = [];
    let reportesSql: any[] = [];

    if (projIds.length > 0) {
      const [actRes, pagRes, matRes, bitRes, impRes, repRes] = await Promise.all([
        sb.from('actividades').select('*').in('proyecto_id', projIds).order('orden', { ascending: true }),
        sb.from('pagos').select('*').in('proyecto_id', projIds),
        sb.from('materiales_proyecto').select('*').in('proyecto_id', projIds),
        sb.from('bitacora_entradas').select('*').in('proyecto_id', projIds).order('created_at', { ascending: false }),
        sb.from('imprevistos').select('*').in('proyecto_id', projIds),
        sb.from('reportes_whatsapp').select('*').in('proyecto_id', projIds).order('created_at', { ascending: false }),
      ]);
      actividades = (actRes.data || []).map((a: any) => ({
        ...a,
        porcentaje_avance: Number(a.porcentaje_avance) || 0,
      }));
      pagos = (pagRes.data || []).map((p: any) => ({
        ...p,
        monto: Number(p.monto) || 0,
      }));
      materiales = (matRes.data || []).map((m: any) => ({
        ...m,
        cantidad: Number(m.cantidad) || 0,
        precio_unitario: Number(m.precio_unitario) || 0,
        subtotal: Number(m.subtotal ?? Number(m.cantidad) * Number(m.precio_unitario)) || 0,
      }));
      bitacora = (bitRes.data || []).map((b: any) => ({
        ...b,
        fecha: b.fecha || (b.created_at ? b.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
      }));
      imprevistos = (impRes.data || []).map((i: any) => ({
        ...i,
        monto: Number(i.monto ?? i.monto_adicional) || 0,
        fecha: i.fecha || i.fecha_reporte || new Date().toISOString().split('T')[0],
      }));
      reportesSql = repRes.data || [];
    }

    const ptRows = ptRes.data || [];
    const proyectos = proyectosRaw.map((p: any) => {
      const trabajadoresIds = ptRows
        .filter((r: any) => r.proyecto_id === p.id)
        .map((r: any) => r.usuario_id);
      return {
        ...p,
        monto_cotizado: Number(p.monto_cotizado) || 0,
        trabajadores_ids: trabajadoresIds,
      };
    });

    // Unificar reportes de WhatsApp de SQL + Ledger V2
    const reportesMap = new Map<string, any>();
    reportesSql.forEach((r: any) => {
      reportesMap.set(r.id, {
        ...r,
        extraccion_ia: r.extraccion_ia || {},
        fecha: r.fecha || (r.created_at ? r.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
      });
    });
    (ledgerV2.reportes_whatsapp || []).forEach((r: any) => {
      reportesMap.set(r.id, r);
    });

    return NextResponse.json({
      success: true,
      empresaId,
      proyectos,
      clientes: clientesRes.data || [],
      usuarios: usuariosRes.data || [],
      actividades,
      pagos,
      materiales,
      bitacora,
      imprevistos,
      reclamos_cambios: ledgerV2.reclamos_cambios || [],
      documentos: ledgerV2.documentos || [],
      asistencias: ledgerV2.asistencias || [],
      reportes_whatsapp: Array.from(reportesMap.values()).sort((a, b) =>
        (b.created_at || b.fecha || '').localeCompare(a.created_at || a.fecha || '')
      ),
      updated_at: ledgerV2.updated_at,
    });
  } catch (err: any) {
    console.error('Error GET /api/supabase/sync:', err);
    return NextResponse.json({ error: err.message || 'Error leyendo Supabase' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) {
      return NextResponse.json({ error: 'Supabase no configurado' }, { status: 500 });
    }

    const body = await request.json();
    const empresaId = body.empresaId || DEFAULT_EMPRESA_ID;

    // 1. Asegurar que la empresa exista en la tabla empresas
    const isMaster = empresaId === 'empresa-dev-master';
    await sb.from('empresas').upsert(
      {
        id: empresaId,
        rut: isMaster ? '76.000.000-0' : `76.${empresaId.slice(-3)}.111-K`,
        nombre: isMaster ? 'ObraTrack Dev Studio' : 'Constructora ObraTrack SpA',
        plan_id: 'pro_ia',
      },
      { onConflict: 'id' }
    );

    // 2. Sincronizar Clientes
    if (Array.isArray(body.clientes) && body.clientes.length > 0) {
      for (const c of body.clientes) {
        await sb.from('clientes').upsert(
          {
            id: c.id,
            empresa_id: empresaId,
            rut: c.rut || null,
            nombre: c.nombre,
            telefono: c.telefono || null,
            email: c.email || null,
            direccion: c.direccion || null,
          },
          { onConflict: 'id' }
        );
      }
    }

    // 3. Sincronizar Usuarios / Obreros
    if (Array.isArray(body.usuarios) && body.usuarios.length > 0) {
      for (const u of body.usuarios) {
        await sb
          .from('usuarios')
          .upsert(
            {
              id: u.id,
              empresa_id: empresaId,
              nombre: u.nombre,
              email: u.email || `${u.id}@obratrack.local`,
              rol: ['admin', 'supervisor', 'terreno'].includes(u.rol) ? u.rol : 'terreno',
              telefono_whatsapp: u.telefono_whatsapp || '',
              is_dev: Boolean(u.is_dev),
            },
            { onConflict: 'id' }
          )
          .then(() => {});
      }
    }

    // 4. Sincronizar Proyectos y asignaciones proyecto_trabajadores
    if (Array.isArray(body.proyectos) && body.proyectos.length > 0) {
      for (const p of body.proyectos) {
        await sb.from('proyectos').upsert(
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
            fecha_inicio: p.fecha_inicio || new Date().toISOString().split('T')[0],
            fecha_termino_estimada:
              p.fecha_termino_estimada || new Date(Date.now() + 86400000 * 30).toISOString().split('T')[0],
            estado: ['activo', 'terminado', 'pausado'].includes(p.estado) ? p.estado : 'activo',
            monto_cotizado: Number(p.monto_cotizado) || 0,
          },
          { onConflict: 'id' }
        );

        if (Array.isArray(p.trabajadores_ids)) {
          await sb.from('proyecto_trabajadores').delete().eq('proyecto_id', p.id);
          for (const uid of p.trabajadores_ids) {
            await sb
              .from('proyecto_trabajadores')
              .upsert({ proyecto_id: p.id, usuario_id: uid })
              .then(() => {});
          }
        }
      }
    }

    // 5. Sincronizar Actividades Gantt
    if (Array.isArray(body.actividades) && body.actividades.length > 0) {
      for (const a of body.actividades) {
        await sb.from('actividades').upsert(
          {
            id: a.id,
            proyecto_id: a.proyecto_id,
            responsable_id: a.responsable_id || null,
            nombre: a.nombre,
            fecha_inicio: a.fecha_inicio,
            fecha_termino: a.fecha_termino,
            porcentaje_avance: Number(a.porcentaje_avance) || 0,
            estado: ['pendiente', 'en_curso', 'terminada'].includes(a.estado) ? a.estado : 'pendiente',
            orden: Number(a.orden) || 1,
          },
          { onConflict: 'id' }
        );
      }
    }

    // 6. Sincronizar Materiales
    if (Array.isArray(body.materiales) && body.materiales.length > 0) {
      for (const m of body.materiales) {
        await sb.from('materiales_proyecto').upsert(
          {
            id: m.id,
            proyecto_id: m.proyecto_id,
            nombre: m.nombre,
            categoria: m.categoria || 'General',
            cantidad: Number(m.cantidad) || 1,
            unidad: m.unidad || 'unidad',
            precio_unitario: Number(m.precio_unitario) || 0,
            proveedor: m.proveedor || null,
            comprado: Boolean(m.comprado),
          },
          { onConflict: 'id' }
        );
      }
    }

    // 7. Sincronizar Pagos
    if (Array.isArray(body.pagos) && body.pagos.length > 0) {
      for (const pay of body.pagos) {
        await sb.from('pagos').upsert(
          {
            id: pay.id,
            proyecto_id: pay.proyecto_id,
            cliente_id: pay.cliente_id || null,
            monto: Number(pay.monto) || 0,
            metodo: ['transferencia', 'efectivo', 'debito', 'credito'].includes(pay.metodo)
              ? pay.metodo
              : 'transferencia',
            estado: pay.estado || 'completado',
            fecha: pay.fecha || new Date().toISOString().split('T')[0],
            notas: pay.notas || pay.nota || null,
            comprobante_url: pay.comprobante_url || null,
          },
          { onConflict: 'id' }
        );
      }
    }

    // 8. Sincronizar Bitácora
    if (Array.isArray(body.bitacora) && body.bitacora.length > 0) {
      for (const b of body.bitacora) {
        await sb.from('bitacora_entradas').upsert(
          {
            id: b.id,
            proyecto_id: b.proyecto_id,
            usuario_id: b.usuario_id || null,
            autor_nombre: b.autor_nombre || 'Terreno',
            titulo: b.titulo,
            nota: b.nota,
            foto_url: b.foto_url || null,
            tipo: ['avance', 'incidente', 'clima', 'entrega_material'].includes(b.tipo) ? b.tipo : 'avance',
            fecha: b.fecha || new Date().toISOString().split('T')[0],
          },
          { onConflict: 'id' }
        );
      }
    }

    // 9. Sincronizar Imprevistos
    if (Array.isArray(body.imprevistos) && body.imprevistos.length > 0) {
      for (const imp of body.imprevistos) {
        await sb.from('imprevistos').upsert(
          {
            id: imp.id,
            proyecto_id: imp.proyecto_id,
            titulo: imp.titulo || imp.descripcion?.slice(0, 80) || 'Imprevisto',
            descripcion: imp.descripcion || 'Imprevisto en obra',
            monto_adicional: Number(imp.monto ?? imp.monto_adicional) || 0,
            estado: imp.estado || 'pendiente',
            origen: imp.origen === 'whatsapp_ia' ? 'whatsapp_ia' : 'manual',
            foto_url: imp.foto_url || null,
            fecha_reporte: imp.fecha || new Date().toISOString().split('T')[0],
          },
          { onConflict: 'id' }
        );
      }
    }

    // 10. Sincronizar Módulos V2 (Reclamos/Cambios, Documentos, Asistencias, Reportes WhatsApp)
    // Escribe tanto en el Cloud V2 Ledger de Supabase Storage como en las tablas SQL nativas si existen
    const currentLedger = await readCloudV2Ledger(empresaId);

    const nextLedger = {
      reclamos_cambios: Array.isArray(body.reclamos_cambios)
        ? body.reclamos_cambios
        : currentLedger.reclamos_cambios,
      documentos: Array.isArray(body.documentos) ? body.documentos : currentLedger.documentos,
      asistencias: Array.isArray(body.asistencias) ? body.asistencias : currentLedger.asistencias,
      reportes_whatsapp: Array.isArray(body.reportes_whatsapp)
        ? body.reportes_whatsapp
        : currentLedger.reportes_whatsapp,
      updated_at: new Date().toISOString(),
    };

    await writeCloudV2Ledger(empresaId, nextLedger);

    // Intentar sincronizar también en las tablas SQL V2 si ya fueron creadas
    if (Array.isArray(body.reclamos_cambios)) {
      for (const rc of body.reclamos_cambios) {
        await sb
          .from('reclamos_cambios_obra')
          .upsert(
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
              origen: rc.origen || 'web',
              resolucion_notas: rc.resolucion_notas || null,
              fecha: rc.fecha || new Date().toISOString().split('T')[0],
            },
            { onConflict: 'id' }
          )
          .then(() => {});
      }
    }

    if (Array.isArray(body.documentos)) {
      for (const doc of body.documentos) {
        await sb
          .from('documentos_obra')
          .upsert(
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
              fecha_documento: doc.fecha_documento || new Date().toISOString().split('T')[0],
            },
            { onConflict: 'id' }
          )
          .then(() => {});
      }
    }

    if (Array.isArray(body.asistencias)) {
      for (const asis of body.asistencias) {
        await sb
          .from('asistencia_obreros')
          .upsert(
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
              origen: asis.origen || 'web',
              registrado_por: asis.registrado_por || null,
            },
            { onConflict: 'id' }
          )
          .then(() => {});
      }
    }

    return NextResponse.json({ success: true, updated_at: nextLedger.updated_at });
  } catch (err: any) {
    console.error('Error POST /api/supabase/sync:', err);
    return NextResponse.json({ error: err.message || 'Error guardando en Supabase' }, { status: 500 });
  }
}
