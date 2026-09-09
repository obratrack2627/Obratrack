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
} from '@/types/database';

export class SupabaseService {
  private get client() {
    return supabase;
  }

  // --- PROYECTOS ---
  async getProyectos(): Promise<Proyecto[]> {
    try {
      const { data, error } = await this.client
        .from('proyectos')
        .select('*')
        .order('created_at', { ascending: false });

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
      empresa_id: proyecto.empresa_id || 'e1111111-1111-4111-a111-111111111111',
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

  // --- CLIENTES ---
  async getClientes(): Promise<Cliente[]> {
    try {
      const { data, error } = await this.client.from('clientes').select('*').order('nombre');
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
      empresa_id: cliente.empresa_id || 'e1111111-1111-4111-a111-111111111111',
      rut: cliente.rut || null,
      nombre: cliente.nombre,
      telefono: cliente.telefono || null,
      email: cliente.email || null,
      direccion: cliente.direccion || null,
    };
    const { error } = await this.client.from('clientes').upsert(payload, { onConflict: 'id' });
    if (error) console.error('Error guardando cliente en Supabase:', error);
  }

  async deleteCliente(id: string): Promise<void> {
    await this.client.from('clientes').delete().eq('id', id);
  }

  // --- USUARIOS ---
  async getUsuarios(): Promise<Usuario[]> {
    try {
      const { data, error } = await this.client.from('usuarios').select('*').order('nombre');
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
        created_at: r.created_at,
      }));
    } catch (err) {
      console.warn('Error al cargar usuarios desde Supabase:', err);
      return [];
    }
  }

  async saveUsuario(usuario: Usuario): Promise<void> {
    const payload = {
      id: usuario.id,
      auth_user_id: usuario.auth_user_id || null,
      empresa_id: usuario.empresa_id || 'e1111111-1111-4111-a111-111111111111',
      rut: usuario.rut || null,
      nombre: usuario.nombre,
      email: usuario.email || null,
      rol: usuario.rol || 'terreno',
      telefono_whatsapp: usuario.telefono_whatsapp || null,
    };
    const { error } = await this.client.from('usuarios').upsert(payload, { onConflict: 'id' });
    if (error) console.error('Error guardando usuario en Supabase:', error);
  }

  async deleteUsuario(id: string): Promise<void> {
    await this.client.from('usuarios').delete().eq('id', id);
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

  // --- SINCRONIZACIÓN MASIVA HACIA SUPABASE ---
  async bulkSyncToSupabase(data: {
    proyectos: Proyecto[];
    actividades: Actividad[];
    pagos: Pago[];
    imprevistos: Imprevisto[];
    materiales: MaterialProyecto[];
    bitacora: BitacoraEntrada[];
    clientes: Cliente[];
    usuarios: Usuario[];
  }): Promise<{ success: boolean; count: number; error?: string }> {
    let count = 0;
    try {
      // 1. Asegurar empresa base
      await this.client.from('empresas').upsert({
        id: 'e1111111-1111-4111-a111-111111111111',
        rut: '76.123.456-7',
        nombre: 'Constructora ObraTrack SpA',
      }, { onConflict: 'id' });

      // 2. Clientes
      for (const c of data.clientes) {
        await this.saveCliente(c);
        count++;
      }

      // 3. Usuarios
      for (const u of data.usuarios) {
        await this.saveUsuario(u);
        count++;
      }

      // 4. Proyectos
      for (const p of data.proyectos) {
        await this.saveProyecto(p);
        count++;
      }

      // 5. Actividades
      for (const a of data.actividades) {
        await this.saveActividad(a);
        count++;
      }

      // 6. Pagos
      for (const pg of data.pagos) {
        await this.savePago(pg);
        count++;
      }

      // 7. Materiales
      for (const m of data.materiales) {
        await this.saveMaterial(m);
        count++;
      }

      // 8. Bitácora
      for (const b of data.bitacora) {
        await this.saveBitacora(b);
        count++;
      }

      // 9. Imprevistos
      for (const i of data.imprevistos) {
        await this.saveImprevisto(i);
        count++;
      }

      return { success: true, count };
    } catch (err: any) {
      console.error('Error en bulkSyncToSupabase:', err);
      return { success: false, count, error: err.message };
    }
  }
}

export const supabaseService = new SupabaseService();