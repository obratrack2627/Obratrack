import { supabase } from './client';
import {
  Proyecto,
  Actividad,
  Pago,
  Imprevisto,
  MaterialProyecto,
  BitacoraEntrada,
  Cliente,
  Usuario,
  EventoAgenda,
  ReporteWhatsApp,
  Empresa,
  SubscriptionPlanId,
  MensajeChatProyecto,
} from '@/types/database';

export class SupabaseService {
  private get client() {
    return supabase;
  }

  // --- EMPRESAS & MULTI-TENANT ---
  async getEmpresaById(id: string): Promise<Empresa | null> {
    try {
      const { data, error } = await this.client
        .from('empresas')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        nombre: data.nombre,
        rut: data.rut,
        plan_id: (data.plan_id as SubscriptionPlanId) || 'gratis',
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
    } catch (err) {
      console.warn('Error al obtener empresa desde Supabase:', err);
      return null;
    }
  }

  async saveEmpresa(empresa: {
    id: string;
    nombre: string;
    rut?: string;
    plan_id?: SubscriptionPlanId;
  }): Promise<void> {
    const payload = {
      id: empresa.id,
      nombre: empresa.nombre,
      rut: empresa.rut || '76.000.000-0',
      plan_id: empresa.plan_id || 'gratis',
      updated_at: new Date().toISOString(),
    };
    const { error } = await this.client.from('empresas').upsert(payload, { onConflict: 'id' });
    if (error) {
      console.error('Error guardando empresa en Supabase:', error);
      throw error;
    }
  }

  async updateEmpresaPlan(empresaId: string, planId: SubscriptionPlanId): Promise<boolean> {
    try {
      const { error } = await this.client
        .from('empresas')
        .update({
          plan_id: planId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', empresaId);

      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Error actualizando plan de empresa en Supabase:', err);
      return false;
    }
  }

  // --- USUARIOS ---
  async getUsuarios(empresaId?: string): Promise<Usuario[]> {
    try {
      let q = this.client.from('usuarios').select('*').order('nombre');
      if (empresaId) {
        q = q.eq('empresa_id', empresaId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((r) => ({
        id: r.id,
        auth_user_id: r.auth_user_id,
        empresa_id: r.empresa_id,
        rut: r.rut,
        nombre: r.nombre,
        email: r.email,
        rol: r.rol,
        telefono_whatsapp: r.telefono_whatsapp,
        is_dev: Boolean(r.is_dev),
        created_at: r.created_at,
      }));
    } catch (err) {
      console.warn('Error al cargar usuarios desde Supabase:', err);
      return [];
    }
  }

  async getUsuarioByEmail(email: string): Promise<Usuario | null> {
    try {
      const { data, error } = await this.client
        .from('usuarios')
        .select('*')
        .eq('email', email.trim().toLowerCase())
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        auth_user_id: data.auth_user_id,
        empresa_id: data.empresa_id,
        rut: data.rut,
        nombre: data.nombre,
        email: data.email,
        rol: data.rol,
        telefono_whatsapp: data.telefono_whatsapp,
        is_dev: Boolean(data.is_dev),
        created_at: data.created_at,
      };
    } catch (err) {
      console.warn('Error buscando usuario por correo en Supabase:', err);
      return null;
    }
  }

  async saveUsuario(usuario: Usuario): Promise<void> {
    const payload = {
      id: usuario.id,
      auth_user_id: usuario.auth_user_id || null,
      empresa_id: usuario.empresa_id,
      rut: usuario.rut || null,
      nombre: usuario.nombre,
      email: usuario.email ? usuario.email.trim().toLowerCase() : null,
      rol: usuario.rol || 'terreno',
      telefono_whatsapp: usuario.telefono_whatsapp || null,
      is_dev: Boolean(usuario.is_dev),
    };
    const { error } = await this.client.from('usuarios').upsert(payload, { onConflict: 'id' });
    if (error) {
      console.error('Error guardando usuario en Supabase:', error);
      throw error;
    }
  }

  async deleteUsuario(id: string): Promise<void> {
    await this.client.from('usuarios').delete().eq('id', id);
  }

  // --- CLIENTES ---
  async getClientes(empresaId?: string): Promise<Cliente[]> {
    try {
      let q = this.client.from('clientes').select('*').order('nombre');
      if (empresaId) {
        q = q.eq('empresa_id', empresaId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((r) => ({
        id: r.id,
        empresa_id: r.empresa_id,
        rut: r.rut,
        nombre: r.nombre,
        telefono: r.telefono,
        email: r.email,
        direccion: r.direccion,
        created_at: r.created_at,
      }));
    } catch (err) {
      console.warn('Error al cargar clientes desde Supabase:', err);
      return [];
    }
  }

  async saveCliente(cliente: Cliente): Promise<void> {
    const payload = {
      id: cliente.id,
      empresa_id: cliente.empresa_id,
      rut: cliente.rut || null,
      nombre: cliente.nombre,
      telefono: cliente.telefono || null,
      email: cliente.email || null,
      direccion: cliente.direccion || null,
    };
    const { error } = await this.client.from('clientes').upsert(payload, { onConflict: 'id' });
    if (error) {
      console.error('Error guardando cliente en Supabase:', error);
      throw error;
    }
  }

  async deleteCliente(id: string): Promise<void> {
    await this.client.from('clientes').delete().eq('id', id);
  }

  // --- PROYECTOS ---
  async getProyectos(empresaId?: string): Promise<Proyecto[]> {
    try {
      let query = this.client
        .from('proyectos')
        .select('*')
        .order('created_at', { ascending: false });

      if (empresaId) {
        query = query.eq('empresa_id', empresaId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((row) => ({
        id: row.id,
        empresa_id: row.empresa_id,
        cliente_id: row.cliente_id,
        nombre: row.nombre,
        descripcion: row.descripcion,
        direccion: row.direccion,
        comuna: row.comuna,
        region: row.region,
        latitud: row.latitud ? Number(row.latitud) : undefined,
        longitud: row.longitud ? Number(row.longitud) : undefined,
        lugar_referencia: row.lugar_referencia,
        fecha_inicio: row.fecha_inicio,
        fecha_termino_estimada: row.fecha_termino_estimada,
        estado: row.estado,
        monto_cotizado: Number(row.monto_cotizado || 0),
        created_at: row.created_at,
      }));
    } catch (err) {
      console.warn('Error al cargar proyectos desde Supabase:', err);
      return [];
    }
  }

  async saveProyecto(proyecto: Proyecto): Promise<void> {
    const payload = {
      id: proyecto.id,
      empresa_id: proyecto.empresa_id,
      cliente_id: proyecto.cliente_id || null,
      nombre: proyecto.nombre,
      descripcion: proyecto.descripcion || null,
      direccion: proyecto.direccion || null,
      comuna: proyecto.comuna || null,
      region: proyecto.region || null,
      latitud: proyecto.latitud || null,
      longitud: proyecto.longitud || null,
      lugar_referencia: proyecto.lugar_referencia || null,
      fecha_inicio: proyecto.fecha_inicio || new Date().toISOString().split('T')[0],
      fecha_termino_estimada: proyecto.fecha_termino_estimada || new Date().toISOString().split('T')[0],
      estado: proyecto.estado || 'activo',
      monto_cotizado: Number(proyecto.monto_cotizado || 0),
    };

    const { error } = await this.client
      .from('proyectos')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.error('Error guardando proyecto en Supabase:', error);
      throw error;
    }
  }

  async deleteProyecto(id: string): Promise<void> {
    const { error } = await this.client.from('proyectos').delete().eq('id', id);
    if (error) console.error('Error eliminando proyecto en Supabase:', error);
  }

  // --- ACTIVIDADES (GANTT) ---
  async getActividades(proyectoId?: string): Promise<Actividad[]> {
    try {
      let query = this.client.from('actividades').select('*').order('orden', { ascending: true });
      if (proyectoId) {
        query = query.eq('proyecto_id', proyectoId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((row) => ({
        id: row.id,
        proyecto_id: row.proyecto_id,
        responsable_id: row.responsable_id,
        nombre: row.nombre,
        fecha_inicio: row.fecha_inicio,
        fecha_termino: row.fecha_termino,
        porcentaje_avance: Number(row.porcentaje_avance || 0),
        estado: row.estado,
        orden: Number(row.orden || 1),
        created_at: row.created_at,
      }));
    } catch (err) {
      console.warn('Error al cargar actividades desde Supabase:', err);
      return [];
    }
  }

  async saveActividad(actividad: Actividad): Promise<void> {
    const payload = {
      id: actividad.id,
      proyecto_id: actividad.proyecto_id,
      responsable_id: actividad.responsable_id || null,
      nombre: actividad.nombre,
      fecha_inicio: actividad.fecha_inicio,
      fecha_termino: actividad.fecha_termino,
      porcentaje_avance: Number(actividad.porcentaje_avance || 0),
      estado: actividad.estado || 'pendiente',
      orden: Number(actividad.orden || 1),
    };
    const { error } = await this.client.from('actividades').upsert(payload, { onConflict: 'id' });
    if (error) console.error('Error guardando actividad en Supabase:', error);
  }

  async deleteActividad(id: string): Promise<void> {
    await this.client.from('actividades').delete().eq('id', id);
  }

  // --- PAGOS ---
  async getPagos(proyectoId?: string): Promise<Pago[]> {
    try {
      let query = this.client.from('pagos').select('*').order('fecha', { ascending: false });
      if (proyectoId) {
        query = query.eq('proyecto_id', proyectoId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((row) => ({
        id: row.id,
        proyecto_id: row.proyecto_id,
        cliente_id: row.cliente_id,
        monto: Number(row.monto || 0),
        metodo: row.metodo,
        estado: row.estado,
        fecha: row.fecha,
        notas: row.notas,
        comprobante_url: row.comprobante_url,
        created_at: row.created_at,
      }));
    } catch (err) {
      console.warn('Error al cargar pagos desde Supabase:', err);
      return [];
    }
  }

  async savePago(pago: Pago): Promise<void> {
    const payload = {
      id: pago.id,
      proyecto_id: pago.proyecto_id,
      cliente_id: pago.cliente_id || null,
      monto: Number(pago.monto || 0),
      metodo: pago.metodo || 'transferencia',
      estado: pago.estado || 'completado',
      fecha: pago.fecha || new Date().toISOString().split('T')[0],
      notas: pago.notas || null,
      comprobante_url: pago.comprobante_url || null,
    };
    const { error } = await this.client.from('pagos').upsert(payload, { onConflict: 'id' });
    if (error) console.error('Error guardando pago en Supabase:', error);
  }

  async deletePago(id: string): Promise<void> {
    await this.client.from('pagos').delete().eq('id', id);
  }

  // --- MATERIALES ---
  async getMateriales(proyectoId?: string): Promise<MaterialProyecto[]> {
    try {
      let q = this.client.from('materiales_proyecto').select('*');
      if (proyectoId) q = q.eq('proyecto_id', proyectoId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((r) => ({
        id: r.id,
        proyecto_id: r.proyecto_id,
        nombre: r.nombre,
        categoria: r.categoria,
        cantidad: Number(r.cantidad || 0),
        unidad: r.unidad,
        precio_unitario: Number(r.precio_unitario || 0),
        subtotal: Number(r.subtotal || 0),
        proveedor: r.proveedor,
        comprado: Boolean(r.comprado),
        created_at: r.created_at,
      }));
    } catch (err) {
      console.warn('Error al cargar materiales desde Supabase:', err);
      return [];
    }
  }

  async saveMaterial(mat: MaterialProyecto): Promise<void> {
    const payload = {
      id: mat.id,
      proyecto_id: mat.proyecto_id,
      nombre: mat.nombre,
      categoria: mat.categoria || null,
      cantidad: Number(mat.cantidad || 1),
      unidad: mat.unidad || 'unidad',
      precio_unitario: Number(mat.precio_unitario || 0),
      subtotal: Number(mat.subtotal || 0),
      proveedor: mat.proveedor || null,
      comprado: Boolean(mat.comprado),
    };
    const { error } = await this.client.from('materiales_proyecto').upsert(payload, { onConflict: 'id' });
    if (error) console.error('Error guardando material en Supabase:', error);
  }

  async deleteMaterial(id: string): Promise<void> {
    await this.client.from('materiales_proyecto').delete().eq('id', id);
  }

  // --- BITÁCORA ---
  async getBitacora(proyectoId?: string): Promise<BitacoraEntrada[]> {
    try {
      let q = this.client.from('bitacora_entradas').select('*').order('fecha', { ascending: false });
      if (proyectoId) q = q.eq('proyecto_id', proyectoId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((r) => ({
        id: r.id,
        proyecto_id: r.proyecto_id,
        usuario_id: r.usuario_id,
        autor_nombre: r.autor_nombre,
        titulo: r.titulo,
        nota: r.nota,
        foto_url: r.foto_url,
        fecha: r.fecha,
        tipo: r.tipo,
        created_at: r.created_at,
      }));
    } catch (err) {
      console.warn('Error al cargar bitácora desde Supabase:', err);
      return [];
    }
  }

  async saveBitacora(bit: BitacoraEntrada): Promise<void> {
    const payload = {
      id: bit.id,
      proyecto_id: bit.proyecto_id,
      usuario_id: bit.usuario_id || null,
      autor_nombre: bit.autor_nombre,
      titulo: bit.titulo,
      nota: bit.nota,
      foto_url: bit.foto_url || null,
      fecha: bit.fecha || new Date().toISOString(),
      tipo: bit.tipo || 'avance',
    };
    const { error } = await this.client.from('bitacora_entradas').upsert(payload, { onConflict: 'id' });
    if (error) console.error('Error guardando entrada de bitacora en Supabase:', error);
  }

  async deleteBitacora(id: string): Promise<void> {
    await this.client.from('bitacora_entradas').delete().eq('id', id);
  }

  // --- IMPREVISTOS ---
  async getImprevistos(proyectoId?: string): Promise<Imprevisto[]> {
    try {
      let q = this.client.from('imprevistos').select('*').order('fecha_reporte', { ascending: false });
      if (proyectoId) q = q.eq('proyecto_id', proyectoId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((r) => ({
        id: r.id,
        proyecto_id: r.proyecto_id,
        actividad_id: r.actividad_id,
        titulo: r.titulo,
        descripcion: r.descripcion || '',
        monto: Number(r.monto_adicional || 0),
        monto_adicional: Number(r.monto_adicional || 0),
        estado: r.estado,
        origen: r.origen,
        fecha: r.fecha_reporte || new Date().toISOString().split('T')[0],
        fecha_reporte: r.fecha_reporte,
        created_at: r.created_at,
      }));
    } catch (err) {
      console.warn('Error al cargar imprevistos desde Supabase:', err);
      return [];
    }
  }

  async saveImprevisto(imp: Imprevisto): Promise<void> {
    const payload = {
      id: imp.id,
      proyecto_id: imp.proyecto_id,
      actividad_id: imp.actividad_id || null,
      titulo: imp.titulo || (imp.descripcion ? imp.descripcion.slice(0, 50) : 'Imprevisto'),
      descripcion: imp.descripcion || null,
      monto_adicional: Number(imp.monto_adicional ?? imp.monto ?? 0),
      estado: imp.estado || 'pendiente',
      origen: imp.origen || 'manual',
      fecha_reporte: imp.fecha_reporte || imp.fecha || new Date().toISOString().split('T')[0],
    };
    const { error } = await this.client.from('imprevistos').upsert(payload, { onConflict: 'id' });
    if (error) console.error('Error guardando imprevisto en Supabase:', error);
  }

  async deleteImprevisto(id: string): Promise<void> {
    await this.client.from('imprevistos').delete().eq('id', id);
  }

  // --- AGENDA EVENTOS ---
  async getAgendaEventos(empresaId?: string): Promise<EventoAgenda[]> {
    try {
      let q = this.client.from('agenda_eventos').select('*').order('fecha_inicio', { ascending: true });
      if (empresaId) q = q.eq('empresa_id', empresaId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((r) => {
        const fechaVal = r.fecha_inicio ? new Date(r.fecha_inicio) : new Date();
        const fechaStr = fechaVal.toISOString().split('T')[0];
        const horaStr = fechaVal.toTimeString().substring(0, 5);
        return {
          id: r.id,
          empresa_id: r.empresa_id,
          proyecto_id: r.proyecto_id,
          usuario_id: r.usuario_id,
          titulo: r.titulo,
          tipo: (r.tipo || 'visita_terreno') as any,
          fecha: fechaStr,
          hora: horaStr,
          completado: false,
          origen: 'asistente_ia',
          created_at: r.created_at,
        };
      });
    } catch (err) {
      console.warn('Error al cargar eventos de agenda desde Supabase:', err);
      return [];
    }
  }

  async saveEventoAgenda(ev: EventoAgenda): Promise<void> {
    const fechaHora = ev.fecha && ev.hora ? `${ev.fecha}T${ev.hora}:00` : ev.fecha ? `${ev.fecha}T09:00:00` : new Date().toISOString();
    const payload = {
      id: ev.id,
      empresa_id: ev.empresa_id,
      proyecto_id: ev.proyecto_id || null,
      usuario_id: ev.usuario_id || null,
      titulo: ev.titulo,
      fecha_inicio: fechaHora,
      fecha_fin: fechaHora,
      tipo: ev.tipo || 'visita_terreno',
    };
    const { error } = await this.client.from('agenda_eventos').upsert(payload, { onConflict: 'id' });
    if (error) console.error('Error guardando evento de agenda en Supabase:', error);
  }

  async deleteEventoAgenda(id: string): Promise<void> {
    await this.client.from('agenda_eventos').delete().eq('id', id);
  }

  // --- CHAT DE AGENTE POR PROYECTO ---
  async getProyectoChatHistorial(proyectoId: string, empresaId?: string): Promise<MensajeChatProyecto[]> {
    try {
      let q = this.client
        .from('mensajes_chat_proyecto')
        .select('*')
        .eq('proyecto_id', proyectoId)
        .order('created_at', { ascending: true });
      if (empresaId) q = q.eq('empresa_id', empresaId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((r) => ({
        id: r.id,
        proyecto_id: r.proyecto_id,
        empresa_id: r.empresa_id,
        remitente: r.remitente,
        texto: r.texto,
        sugerencias: r.sugerencias || undefined,
        accion_ejecutada: r.accion_ejecutada || undefined,
        created_at: r.created_at,
      }));
    } catch (err) {
      console.warn('Error al cargar historial de chat de proyecto desde Supabase:', err);
      return [];
    }
  }

  async saveProyectoMensajeChat(msg: MensajeChatProyecto): Promise<void> {
    try {
      const payload = {
        id: msg.id,
        proyecto_id: msg.proyecto_id,
        empresa_id: msg.empresa_id,
        remitente: msg.remitente,
        texto: msg.texto,
        sugerencias: msg.sugerencias || null,
        accion_ejecutada: msg.accion_ejecutada || null,
        created_at: msg.created_at || new Date().toISOString(),
      };
      const { error } = await this.client.from('mensajes_chat_proyecto').upsert(payload, { onConflict: 'id' });
      if (error) console.error('Error al guardar mensaje de chat en Supabase:', error);
    } catch (err) {
      console.warn('Error en saveProyectoMensajeChat:', err);
    }
  }

  async clearProyectoChatHistorial(proyectoId: string): Promise<void> {
    try {
      await this.client.from('mensajes_chat_proyecto').delete().eq('proyecto_id', proyectoId);
    } catch (err) {
      console.warn('Error al borrar historial de chat de proyecto en Supabase:', err);
    }
  }

  // --- STORAGE: SUBIDA DE FOTOS A BUCKET DE SUPABASE ---
  async uploadFotoFaena(file: File | Blob, pathName: string): Promise<string | null> {
    try {
      const { data, error } = await this.client.storage
        .from('bitacora-fotos')
        .upload(pathName, file, { upsert: true });

      if (error) throw error;

      const { data: publicUrlData } = this.client.storage
        .from('bitacora-fotos')
        .getPublicUrl(data.path);

      return publicUrlData.publicUrl;
    } catch (err) {
      console.warn('Error al subir foto a Supabase Storage:', err);
      return null;
    }
  }

  // --- CARGA INTEGRAL DE TENANT DESDE SUPABASE ---
  async loadTenantData(empresaId: string): Promise<{
    empresa: Empresa | null;
    proyectos: Proyecto[];
    clientes: Cliente[];
    usuarios: Usuario[];
    actividades: Actividad[];
    pagos: Pago[];
    materiales: MaterialProyecto[];
    bitacora: BitacoraEntrada[];
    imprevistos: Imprevisto[];
    agenda: EventoAgenda[];
  }> {
    const [empresa, proyectos, clientes, usuarios, agenda] = await Promise.all([
      this.getEmpresaById(empresaId),
      this.getProyectos(empresaId),
      this.getClientes(empresaId),
      this.getUsuarios(empresaId),
      this.getAgendaEventos(empresaId),
    ]);

    const projectIds = proyectos.map((p) => p.id);
    let actividades: Actividad[] = [];
    let pagos: Pago[] = [];
    let materiales: MaterialProyecto[] = [];
    let bitacora: BitacoraEntrada[] = [];
    let imprevistos: Imprevisto[] = [];

    if (projectIds.length > 0) {
      const [acts, pgs, mats, bits, imps] = await Promise.all([
        this.client.from('actividades').select('*').in('proyecto_id', projectIds),
        this.client.from('pagos').select('*').in('proyecto_id', projectIds),
        this.client.from('materiales_proyecto').select('*').in('proyecto_id', projectIds),
        this.client.from('bitacora_entradas').select('*').in('proyecto_id', projectIds),
        this.client.from('imprevistos').select('*').in('proyecto_id', projectIds),
      ]);

      actividades = (acts.data || []).map((row) => ({
        id: row.id,
        proyecto_id: row.proyecto_id,
        responsable_id: row.responsable_id,
        nombre: row.nombre,
        fecha_inicio: row.fecha_inicio,
        fecha_termino: row.fecha_termino,
        porcentaje_avance: Number(row.porcentaje_avance || 0),
        estado: row.estado,
        orden: Number(row.orden || 1),
        created_at: row.created_at,
      }));

      pagos = (pgs.data || []).map((row) => ({
        id: row.id,
        proyecto_id: row.proyecto_id,
        cliente_id: row.cliente_id,
        monto: Number(row.monto || 0),
        metodo: row.metodo,
        estado: row.estado,
        fecha: row.fecha,
        notas: row.notas,
        comprobante_url: row.comprobante_url,
        created_at: row.created_at,
      }));

      materiales = (mats.data || []).map((r) => ({
        id: r.id,
        proyecto_id: r.proyecto_id,
        nombre: r.nombre,
        categoria: r.categoria,
        cantidad: Number(r.cantidad || 0),
        unidad: r.unidad,
        precio_unitario: Number(r.precio_unitario || 0),
        subtotal: Number(r.subtotal || 0),
        proveedor: r.proveedor,
        comprado: Boolean(r.comprado),
        created_at: r.created_at,
      }));

      bitacora = (bits.data || []).map((r) => ({
        id: r.id,
        proyecto_id: r.proyecto_id,
        usuario_id: r.usuario_id,
        autor_nombre: r.autor_nombre,
        titulo: r.titulo,
        nota: r.nota,
        foto_url: r.foto_url,
        fecha: r.fecha,
        tipo: r.tipo,
        created_at: r.created_at,
      }));

      imprevistos = (imps.data || []).map((r) => ({
        id: r.id,
        proyecto_id: r.proyecto_id,
        actividad_id: r.actividad_id,
        titulo: r.titulo,
        descripcion: r.descripcion || '',
        monto: Number(r.monto_adicional || 0),
        monto_adicional: Number(r.monto_adicional || 0),
        estado: r.estado,
        origen: r.origen,
        fecha: r.fecha_reporte || new Date().toISOString().split('T')[0],
        fecha_reporte: r.fecha_reporte,
        created_at: r.created_at,
      }));
    }

    return {
      empresa,
      proyectos,
      clientes,
      usuarios,
      actividades,
      pagos,
      materiales,
      bitacora,
      imprevistos,
      agenda,
    };
  }
}

export const supabaseService = new SupabaseService();