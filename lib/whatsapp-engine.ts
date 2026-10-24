import {
  getSupabaseAdmin,
  normalizePhoneKey,
  readCloudV2Ledger,
  writeCloudV2Ledger,
  uploadBufferToSupabaseStorage,
} from '@/lib/supabase/admin';
import {
  procesarMensajeObreroWhatsAppGemini,
  chatAsistenteClienteWhatsAppGemini,
} from '@/lib/gemini';
import {
  ReclamoCambioObra,
  AsistenciaObrero,
  ReporteWhatsApp,
} from '@/types/database';

const DEFAULT_EMPRESA_ID = 'e1111111-1111-4111-a111-111111111111';

export interface EntradaMensajeWhatsApp {
  telefonoRemitente: string;
  nombrePerfilWhatsApp?: string;
  texto: string;
  modoForzado?: 'obrero' | 'cliente';
  proyectoForzadoId?: string;
  clienteForzadoId?: string;
  obreroForzadoNombre?: string;
  empresaId?: string;
  imagenBuffer?: Buffer;
  imagenMimeType?: string;
  imagenNombre?: string;
  historialPrevio?: { rol: 'user' | 'model'; texto: string }[];
}

export interface SalidaMensajeWhatsApp {
  rolDetectado: 'obrero' | 'cliente';
  respuestaTexto: string;
  fotosRespuesta?: string[];
  fotoSubidaUrl?: string;
  proyectoAfectado?: { id: string; nombre: string } | null;
  clienteIdentificado?: { id: string; nombre: string; rut?: string } | null;
  moduloAfectado?: string;
  reporteGuardado?: ReporteWhatsApp;
}

export async function procesarEventoWhatsAppUnificado(
  input: EntradaMensajeWhatsApp
): Promise<SalidaMensajeWhatsApp> {
  const sb = getSupabaseAdmin();
  if (!sb) {
    return {
      rolDetectado: input.modoForzado || 'cliente',
      respuestaTexto: '⚠️ El servidor aún no tiene configuradas las credenciales de Supabase.',
    };
  }

  // 1. Cargar todas las obras, clientes y usuarios disponibles en Supabase
  const [projsRes, clisRes, usersRes, ptRes] = await Promise.all([
    sb.from('proyectos').select('*').order('created_at', { ascending: false }),
    sb.from('clientes').select('*'),
    sb.from('usuarios').select('*'),
    sb.from('proyecto_trabajadores').select('*'),
  ]);

  const todosProyectos = projsRes.data || [];
  const todosClientes = clisRes.data || [];
  const todosUsuarios = usersRes.data || [];
  const relacionesPT = ptRes.data || [];

  const phoneKey = normalizePhoneKey(input.telefonoRemitente);
  const textoTrim = (input.texto || '').trim();
  const textoLower = textoTrim.toLowerCase();

  // Buscar coincidencia telefónica en usuarios (obreros/supervisores) y clientes
  const usuarioMatch = phoneKey
    ? todosUsuarios.find((u: any) => normalizePhoneKey(u.telefono_whatsapp) === phoneKey)
    : null;

  let clienteMatch = input.clienteForzadoId
    ? todosClientes.find((c: any) => c.id === input.clienteForzadoId)
    : phoneKey
    ? todosClientes.find((c: any) => normalizePhoneKey(c.telefono) === phoneKey)
    : null;

  // 2. Determinar si el mensaje corresponde a un OBRERO o a un CLIENTE
  let rol: 'obrero' | 'cliente' = 'cliente';

  if (input.modoForzado) {
    rol = input.modoForzado;
  } else if (textoLower.startsWith('#obrero') || textoLower.startsWith('#terreno')) {
    rol = 'obrero';
  } else if (textoLower.startsWith('#cliente')) {
    rol = 'cliente';
  } else if (usuarioMatch && !clienteMatch) {
    rol = 'obrero';
  } else if (clienteMatch && !usuarioMatch) {
    rol = 'cliente';
  } else if (
    input.imagenBuffer ||
    textoLower.includes('terminamos') ||
    textoLower.includes('avanzamos') ||
    textoLower.includes('accidente') ||
    textoLower.includes('presente') ||
    textoLower.includes('llegamos') ||
    textoLower.includes('faltan materiales') ||
    textoLower.includes('en obra')
  ) {
    rol = 'obrero';
  } else {
    rol = 'cliente';
  }

  // Determinar empresa activa del contexto
  const empresaId =
    input.empresaId ||
    usuarioMatch?.empresa_id ||
    clienteMatch?.empresa_id ||
    todosProyectos[0]?.empresa_id ||
    DEFAULT_EMPRESA_ID;

  const ledger = await readCloudV2Ledger(empresaId);
  const hoyISO = new Date().toISOString().split('T')[0];

  // =========================================================================
  // FLUJO A: OBRERO EN TERRENO -> GEMINI MULTIMODAL -> WEB & SUPABASE
  // =========================================================================
  if (rol === 'obrero') {
    let fotoPublicUrl: string | undefined;
    let imagenBase64: string | undefined;

    if (input.imagenBuffer && input.imagenBuffer.length > 0) {
      imagenBase64 = input.imagenBuffer.toString('base64');
      const ext = (input.imagenMimeType || 'image/jpeg').includes('png') ? 'png' : 'jpg';
      const filePath = `whatsapp/${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;
      const up = await uploadBufferToSupabaseStorage({
        bucket: 'bitacora-fotos',
        filePath,
        buffer: input.imagenBuffer,
        contentType: input.imagenMimeType || 'image/jpeg',
      });
      if (up.publicUrl) {
        fotoPublicUrl = up.publicUrl;
      }
    }

    const proyectosEmpresa = todosProyectos.filter(
      (p: any) => !p.empresa_id || p.empresa_id === empresaId || todosProyectos.length <= 10
    );
    const projIds = proyectosEmpresa.map((p: any) => p.id);
    const { data: actsData } =
      projIds.length > 0
        ? await sb.from('actividades').select('*').in('proyecto_id', projIds).order('orden', { ascending: true })
        : { data: [] };
    const todasActs = actsData || [];

    const obrasDisponibles = proyectosEmpresa.map((p: any) => {
      const asignado = usuarioMatch
        ? relacionesPT.some((r: any) => r.proyecto_id === p.id && r.usuario_id === usuarioMatch.id)
        : false;
      const acts = todasActs
        .filter((a: any) => a.proyecto_id === p.id)
        .map((a: any) => ({
          id: a.id,
          nombre: a.nombre,
          porcentaje_avance: Number(a.porcentaje_avance) || 0,
        }));
      return {
        id: p.id,
        nombre: p.nombre,
        comuna: p.comuna || undefined,
        asignadoAObrero: asignado,
        actividades: acts,
      };
    });

    const nombreObrero =
      input.obreroForzadoNombre ||
      usuarioMatch?.nombre ||
      input.nombrePerfilWhatsApp ||
      `Maestro (${input.telefonoRemitente || 'Terreno'})`;

    const analisis = await procesarMensajeObreroWhatsAppGemini({
      mensajeTexto: textoTrim.replace(/^#(obrero|terreno)\s*/i, ''),
      obreroNombre: nombreObrero,
      proyectoForzadoId: input.proyectoForzadoId,
      obrasDisponibles,
      imagenBase64,
      imagenMimeType: input.imagenMimeType,
    });

    const targetProyectoId = analisis.proyecto_id || proyectosEmpresa[0]?.id || null;
    const targetProyecto = proyectosEmpresa.find((p: any) => p.id === targetProyectoId) || null;
    const modulosActualizados: string[] = [];

    if (targetProyectoId) {
      // 1. Guardar siempre trazabilidad en Bitácora de Terreno (incluyendo foto si existe)
      const tipoBitacora =
        analisis.tipo_evento === 'accidente' ||
        analisis.tipo_evento === 'incidente' ||
        analisis.tipo_evento === 'solicitud_cambio'
          ? 'incidente'
          : 'avance';

      const bitId = 'bit-wa-' + Date.now();
      await sb.from('bitacora_entradas').upsert({
        id: bitId,
        proyecto_id: targetProyectoId,
        usuario_id: usuarioMatch?.id || null,
        autor_nombre: `${nombreObrero} (WhatsApp)`,
        titulo: analisis.titulo,
        nota: analisis.descripcion,
        foto_url: fotoPublicUrl || null,
        tipo: tipoBitacora,
        fecha: hoyISO,
      });
      modulosActualizados.push('Bitácora');

      // 2. Si reportó avance en una partida de Carta Gantt, actualizarla en Supabase
      if (analisis.nuevo_porcentaje_avance != null) {
        const actsObra = todasActs.filter((a: any) => a.proyecto_id === targetProyectoId);
        const actTarget =
          actsObra.find((a: any) => a.id === analisis.actividad_id) ||
          (analisis.actividad_nombre
            ? actsObra.find((a: any) =>
                a.nombre.toLowerCase().includes((analisis.actividad_nombre || '').toLowerCase())
              )
            : actsObra[0]);

        if (actTarget) {
          const pct = Math.min(100, Math.max(0, Number(analisis.nuevo_porcentaje_avance)));
          const estadoAct = pct === 100 ? 'terminada' : pct > 0 ? 'en_curso' : 'pendiente';
          await sb
            .from('actividades')
            .update({ porcentaje_avance: pct, estado: estadoAct })
            .eq('id', actTarget.id);
          modulosActualizados.push(`Carta Gantt (${pct}%)`);
        }
      }

      // 3. Si es Accidente, Incidente o Solicitud de Cambio / Materiales Nuevos -> Reclamos & Cambios
      if (
        analisis.tipo_evento === 'accidente' ||
        analisis.tipo_evento === 'incidente' ||
        analisis.tipo_evento === 'solicitud_cambio'
      ) {
        const nuevoCambio: ReclamoCambioObra = {
          id: 'rc-wa-' + Date.now(),
          proyecto_id: targetProyectoId,
          empresa_id: empresaId,
          reportado_por_usuario_id: usuarioMatch?.id,
          tipo: analisis.tipo_evento,
          prioridad: analisis.prioridad || 'alta',
          estado: 'pendiente',
          titulo: analisis.titulo,
          descripcion: analisis.descripcion,
          solicitado_por: `${nombreObrero} (vía WhatsApp)`,
          impacto_monto: Number(analisis.impacto_monto) || 0,
          impacto_dias: Number(analisis.impacto_dias) || 0,
          materiales_requeridos: (analisis.materiales_requeridos || []).map((m) => ({
            nombre: m.nombre,
            cantidad: Number(m.cantidad) || 1,
            unidad: m.unidad || 'unidad',
            precio_unitario: Number(m.precio_unitario) || 0,
            subtotal: (Number(m.cantidad) || 1) * (Number(m.precio_unitario) || 0),
          })),
          materiales_inyectados: false,
          foto_url: fotoPublicUrl,
          origen: 'whatsapp_ia',
          fecha: hoyISO,
          created_at: new Date().toISOString(),
        };

        ledger.reclamos_cambios = [nuevoCambio, ...ledger.reclamos_cambios];
        await sb
          .from('reclamos_cambios_obra')
          .upsert({
            id: nuevoCambio.id,
            proyecto_id: nuevoCambio.proyecto_id,
            empresa_id: empresaId,
            tipo: nuevoCambio.tipo,
            prioridad: nuevoCambio.prioridad,
            estado: nuevoCambio.estado,
            titulo: nuevoCambio.titulo,
            descripcion: nuevoCambio.descripcion,
            solicitado_por: nuevoCambio.solicitado_por,
            impacto_monto: nuevoCambio.impacto_monto,
            impacto_dias: nuevoCambio.impacto_dias,
            materiales_requeridos: nuevoCambio.materiales_requeridos,
            materiales_inyectados: false,
            foto_url: fotoPublicUrl || null,
            origen: 'whatsapp_ia',
            fecha: hoyISO,
          })
          .then(() => {});

        await sb
          .from('imprevistos')
          .upsert({
            id: 'imp-wa-' + Date.now(),
            proyecto_id: targetProyectoId,
            titulo: nuevoCambio.titulo,
            descripcion: nuevoCambio.descripcion,
            monto_adicional: nuevoCambio.impacto_monto,
            estado: 'pendiente',
            origen: 'whatsapp_ia',
            foto_url: fotoPublicUrl || null,
            fecha_reporte: hoyISO,
          })
          .then(() => {});

        modulosActualizados.push('Reclamos & Cambios');
      }

      // 4. Si reportó Asistencia -> Control de Asistencia de Obreros
      if (analisis.tipo_evento === 'asistencia') {
        const estadoAsis = analisis.asistencia?.estado || 'presente';
        const horaIn = analisis.asistencia?.hora_entrada || '08:00';
        const horaOut = analisis.asistencia?.hora_salida || '18:00';
        const nuevaAsis: AsistenciaObrero = {
          id: 'asis-wa-' + Date.now(),
          proyecto_id: targetProyectoId,
          empresa_id: empresaId,
          usuario_id: usuarioMatch?.id,
          trabajador_nombre: nombreObrero,
          trabajador_rol: usuarioMatch?.rol || 'terreno',
          fecha: hoyISO,
          estado: estadoAsis,
          hora_entrada: horaIn,
          hora_salida: horaOut,
          horas_trabajadas: estadoAsis === 'presente' || estadoAsis === 'atraso' ? 9 : 0,
          observacion: textoTrim,
          origen: 'whatsapp_ia',
          registrado_por: 'WhatsApp IA',
          created_at: new Date().toISOString(),
        };

        ledger.asistencias = [nuevaAsis, ...ledger.asistencias];
        await sb
          .from('asistencia_obreros')
          .upsert({
            id: nuevaAsis.id,
            proyecto_id: targetProyectoId,
            empresa_id: empresaId,
            usuario_id: usuarioMatch?.id || null,
            trabajador_nombre: nombreObrero,
            trabajador_rol: nuevaAsis.trabajador_rol,
            fecha: hoyISO,
            estado: estadoAsis,
            hora_entrada: horaIn,
            hora_salida: horaOut,
            horas_trabajadas: nuevaAsis.horas_trabajadas,
            observacion: textoTrim,
            origen: 'whatsapp_ia',
            registrado_por: 'WhatsApp IA',
          })
          .then(() => {});

        modulosActualizados.push('Asistencia');
      }
    }

    const moduloStr = modulosActualizados.join(' + ') || 'Bandeja WhatsApp';

    const nuevoReporte: ReporteWhatsApp = {
      id: 'rep-wa-' + Date.now(),
      proyecto_id: targetProyectoId || undefined,
      empresa_id: empresaId,
      usuario_id: usuarioMatch?.id,
      remitente_tipo: 'obrero',
      telefono_remitente: input.telefonoRemitente,
      nombre_remitente: nombreObrero,
      mensaje_original: textoTrim || '(Fotografía enviada desde terreno)',
      transcripcion: analisis.titulo,
      foto_url: fotoPublicUrl,
      respuesta_ia: analisis.respuesta_whatsapp,
      modulo_afectado: moduloStr,
      extraccion_ia: {
        actividad_detectada: analisis.actividad_nombre || analisis.titulo,
        avance_porcentaje: analisis.nuevo_porcentaje_avance ?? null,
        tiene_imprevisto:
          analisis.tipo_evento === 'accidente' ||
          analisis.tipo_evento === 'incidente' ||
          analisis.tipo_evento === 'solicitud_cambio',
        imprevisto_descripcion: analisis.descripcion,
        imprevisto_monto_estimado: analisis.impacto_monto || 0,
        tipo_evento: analisis.tipo_evento,
        prioridad: analisis.prioridad,
        materiales_sugeridos: analisis.materiales_requeridos,
        resumen_ia: analisis.descripcion,
      },
      estado: 'aprobado',
      fecha: hoyISO,
      created_at: new Date().toISOString(),
    };

    ledger.reportes_whatsapp = [nuevoReporte, ...ledger.reportes_whatsapp].slice(0, 150);
    await writeCloudV2Ledger(empresaId, ledger);

    if (targetProyectoId) {
      await sb
        .from('reportes_whatsapp')
        .upsert({
          id: nuevoReporte.id,
          proyecto_id: targetProyectoId,
          usuario_id: usuarioMatch?.id || null,
          mensaje_original: nuevoReporte.mensaje_original,
          transcripcion: nuevoReporte.transcripcion,
          extraccion_ia: nuevoReporte.extraccion_ia,
          estado: 'aprobado',
          fecha: hoyISO,
        })
        .then(() => {});
    }

    return {
      rolDetectado: 'obrero',
      respuestaTexto: analisis.respuesta_whatsapp,
      fotoSubidaUrl: fotoPublicUrl,
      proyectoAfectado: targetProyecto
        ? { id: targetProyecto.id, nombre: targetProyecto.nombre }
        : null,
      moduloAfectado: moduloStr,
      reporteGuardado: nuevoReporte,
    };
  }

  // =========================================================================
  // FLUJO B: CLIENTE / MANDANTE -> CONSULTA EN VIVO SUPABASE -> GEMINI -> WA
  // =========================================================================
  const textoLimpioCliente = textoTrim.replace(/^#cliente\s*/i, '');

  // Si aún no teníamos al cliente por teléfono, buscar si indicó su RUT o Nombre en el texto
  if (!clienteMatch && todosClientes.length > 0) {
    const cleanInput = textoLimpioCliente.replace(/[\.\-\s]/g, '').toLowerCase();
    clienteMatch = todosClientes.find((c: any) => {
      const cleanRut = (c.rut || '').replace(/[\.\-\s]/g, '').toLowerCase();
      return (
        (cleanRut.length >= 7 && cleanInput.includes(cleanRut)) ||
        (c.nombre && textoLimpioCliente.toLowerCase().includes(c.nombre.toLowerCase()))
      );
    });
  }

  let fichaClienteCompleta: any = null;

  if (clienteMatch) {
    const obrasCliente = todosProyectos.filter((p: any) => p.cliente_id === clienteMatch.id);
    const obrasParaFicha = obrasCliente.length > 0 ? obrasCliente : todosProyectos.slice(0, 1);
    const idsObras = obrasParaFicha.map((p: any) => p.id);

    const [actsRes, pagosRes, bitRes] =
      idsObras.length > 0
        ? await Promise.all([
            sb.from('actividades').select('*').in('proyecto_id', idsObras).order('orden', { ascending: true }),
            sb.from('pagos').select('*').in('proyecto_id', idsObras),
            sb
              .from('bitacora_entradas')
              .select('*')
              .in('proyecto_id', idsObras)
              .order('created_at', { ascending: false }),
          ])
        : [{ data: [] }, { data: [] }, { data: [] }];

    const actsAll = actsRes.data || [];
    const pagosAll = pagosRes.data || [];
    const bitAll = bitRes.data || [];

    fichaClienteCompleta = {
      cliente: {
        id: clienteMatch.id,
        nombre: clienteMatch.nombre,
        rut: clienteMatch.rut,
        telefono: clienteMatch.telefono,
        direccion: clienteMatch.direccion,
      },
      proyectos: obrasParaFicha.map((p: any) => {
        const acts = actsAll.filter((a: any) => a.proyecto_id === p.id);
        const pags = pagosAll.filter(
          (pay: any) => pay.proyecto_id === p.id && pay.estado !== 'anulado'
        );
        const bits = bitAll.filter((b: any) => b.proyecto_id === p.id);
        const cambios = ledger.reclamos_cambios.filter((rc) => rc.proyecto_id === p.id);

        const avancePromedio =
          acts.length > 0
            ? Math.round(
                acts.reduce((acc: number, a: any) => acc + (Number(a.porcentaje_avance) || 0), 0) /
                  acts.length
              )
            : 0;

        const totalContratado = Number(p.monto_cotizado) || 0;
        const totalPagado = pags.reduce((acc: number, pay: any) => acc + (Number(pay.monto) || 0), 0);
        const saldoPendiente = Math.max(0, totalContratado - totalPagado);
        const fotosAvance = bits
          .map((b: any) => b.foto_url)
          .filter((url: any): url is string => Boolean(url));

        return {
          proyecto: {
            id: p.id,
            nombre: p.nombre,
            comuna: p.comuna,
            direccion: p.direccion,
            fecha_inicio: p.fecha_inicio,
            fecha_termino_estimada: p.fecha_termino_estimada,
            estado: p.estado,
          },
          actividades: acts.map((a: any) => ({
            nombre: a.nombre,
            porcentaje_avance: Number(a.porcentaje_avance) || 0,
            estado: a.estado,
          })),
          bitacora_reciente: bits.slice(0, 5).map((b: any) => ({
            titulo: b.titulo,
            nota: b.nota,
            fecha: b.fecha || hoyISO,
            tipo: b.tipo,
          })),
          solicitudes_cambio: cambios.map((c) => ({
            titulo: c.titulo,
            estado: c.estado,
            impacto_monto: c.impacto_monto,
          })),
          porcentaje_avance: avancePromedio,
          total_contratado: totalContratado,
          total_pagado: totalPagado,
          saldo_pendiente: saldoPendiente,
          fotos_avance: fotosAvance,
        };
      }),
    };
  }

  const respuestaIA = await chatAsistenteClienteWhatsAppGemini({
    historial: input.historialPrevio || [],
    mensajeCliente: textoLimpioCliente,
    clienteAutenticado: fichaClienteCompleta,
    clientesRegistrados: todosClientes.map((c: any) => ({
      id: c.id,
      nombre: c.nombre,
      rut: c.rut,
    })),
  });

  const primerProyectoCliente = fichaClienteCompleta?.proyectos?.[0]?.proyecto || null;

  const logCliente: ReporteWhatsApp = {
    id: 'rep-cli-' + Date.now(),
    proyecto_id: primerProyectoCliente?.id,
    empresa_id: empresaId,
    remitente_tipo: 'cliente',
    telefono_remitente: input.telefonoRemitente,
    nombre_remitente:
      clienteMatch?.nombre || input.nombrePerfilWhatsApp || 'Consulta Cliente WhatsApp',
    mensaje_original: textoLimpioCliente,
    transcripcion: 'Consulta de estado de obra por Mandante',
    respuesta_ia: respuestaIA.respuesta,
    modulo_afectado: 'Atención Cliente IA',
    extraccion_ia: {
      tipo_evento: 'consulta_cliente',
      resumen_ia: respuestaIA.respuesta.slice(0, 180),
    },
    estado: 'aprobado',
    fecha: hoyISO,
    created_at: new Date().toISOString(),
  };

  ledger.reportes_whatsapp = [logCliente, ...ledger.reportes_whatsapp].slice(0, 150);
  await writeCloudV2Ledger(empresaId, ledger);

  return {
    rolDetectado: 'cliente',
    respuestaTexto: respuestaIA.respuesta,
    fotosRespuesta: respuestaIA.fotos,
    proyectoAfectado: primerProyectoCliente
      ? { id: primerProyectoCliente.id, nombre: primerProyectoCliente.nombre }
      : null,
    clienteIdentificado: clienteMatch
      ? { id: clienteMatch.id, nombre: clienteMatch.nombre, rut: clienteMatch.rut }
      : null,
    moduloAfectado: 'Atención Cliente IA',
    reporteGuardado: logCliente,
  };
}
