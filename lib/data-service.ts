import {
  Proyecto,
  Actividad,
  Pago,
  Imprevisto,
  ReporteWhatsApp,
  Usuario,
  Cliente,
  UserRole,
  CotizacionEstimacion,
  SubscriptionPlanId,
  MaterialProyecto,
  BitacoraEntrada,
  EventoAgenda,
  MensajeChatCotizador,
  MensajeChatProyecto,
  AccionAsistenteIA,
  PaymentMethod,
  ReclamoCambioObra,
  DocumentoObra,
  CategoriaDocumentoObra,
  AsistenciaObrero,
  EstadoAsistencia,
} from '@/types/database';
import {
  INITIAL_PROYECTOS,
  INITIAL_ACTIVIDADES,
  INITIAL_PAGOS,
  INITIAL_IMPREVISTOS,
  INITIAL_REPORTES,
  INITIAL_USUARIOS,
  INITIAL_CLIENTES,
  INITIAL_COTIZACIONES,
  CATALOGO_MATERIALES_CHILE,
} from './mock-data';
import { supabaseService } from './supabase/supabase-service';
import {supabase} from './supabase/client';
import { isDeveloperEmail } from './auth-utils';
import { resolveEntity } from './ai/actions';
import { roundLine } from './ai/protocol';

// Claves base de almacenamiento local para persistencia
export const DATA_STORAGE_KEYS = {
  PROYECTOS: 'obratrack_proyectos_v7',
  ACTIVIDADES: 'obratrack_actividades_v7',
  PAGOS: 'obratrack_pagos_v7',
  IMPREVISTOS: 'obratrack_imprevistos_v7',
  REPORTES: 'obratrack_reportes_v7',
  USUARIOS: 'obratrack_usuarios_v7',
  CLIENTES: 'obratrack_clientes_v7',
  ACTIVE_USER: 'obratrack_active_user_v7',
  COTIZACIONES: 'obratrack_cotizaciones_v7',
  PLAN: 'obratrack_active_plan_v7',
  MATERIALES_PROYECTO: 'obratrack_materiales_proyecto_v7',
  BITACORA: 'obratrack_bitacora_v7',
  AGENDA: 'obratrack_agenda_eventos_v7',
  CHAT_SESSION: 'obratrack_chat_session_history_v7',
  CHAT_PROYECTOS: 'obratrack_chat_proyectos_v7',
  RECLAMOS_CAMBIOS: 'obratrack_reclamos_cambios_v7',
  DOCUMENTOS_OBRA: 'obratrack_documentos_obra_v7',
  ASISTENCIAS_OBRA: 'obratrack_asistencias_obra_v7',
};

const KEYS = DATA_STORAGE_KEYS;

const DEMO_EMPRESA_ID = 'e1111111-1111-4111-a111-111111111111';

export class DataService {
  constructor(private isolatedStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {}

  private aiLocalOnly = false;
  runLocalAI<T>(work: () => T): T {
    const previous = this.aiLocalOnly;
    this.aiLocalOnly = true;
    if (this.cloudSyncTimeout) clearTimeout(this.cloudSyncTimeout);
    try { return work(); } finally { this.aiLocalOnly = previous; }
  }

  private isBrowser(): boolean {
    return typeof window !== 'undefined';
  }

  // --- AISLAMIENTO MULTI-INQUILINO ---
  private getTenantKey(baseKey: string): string {
    const active = this.getActiveUser();
    const empresaId = active?.empresa_id || DEMO_EMPRESA_ID;
    return `${baseKey}_${empresaId}`;
  }

  private isDemoTenant(): boolean {
    const active = this.getActiveUser();
    if (!active) return true;
    return active.empresa_id === DEMO_EMPRESA_ID;
  }

  public getItem<T>(key: string, defaultValue: T): T {
    if (!this.isBrowser() && !this.isolatedStorage) return defaultValue;
    try {
      const item = (this.isolatedStorage || localStorage).getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  private isPullingCloud = false;

  private dirtyKey() { return `obratrack_dirty_v1_${this.getActiveUser()?.empresa_id || ''}`; }
  private syncNames: Record<string,string> = {
    [KEYS.PROYECTOS]:'proyectos',[KEYS.CLIENTES]:'clientes',[KEYS.USUARIOS]:'usuarios',
    [KEYS.ACTIVIDADES]:'actividades',[KEYS.PAGOS]:'pagos',[KEYS.MATERIALES_PROYECTO]:'materiales',
    [KEYS.BITACORA]:'bitacora',[KEYS.IMPREVISTOS]:'imprevistos',[KEYS.RECLAMOS_CAMBIOS]:'reclamos_cambios',
    [KEYS.DOCUMENTOS_OBRA]:'documentos',[KEYS.ASISTENCIAS_OBRA]:'asistencias',[KEYS.REPORTES]:'reportes_whatsapp',
  };

  private setItem<T>(key: string, value: T): void {
    if (!this.isBrowser() && !this.isolatedStorage) return;
    try {
      if(this.isBrowser() && !this.isolatedStorage && !this.isPullingCloud && !this.aiLocalOnly && Array.isArray(value)) {
        const empresa=this.getActiveUser()?.empresa_id;
        const base=Object.keys(this.syncNames).find(base=>key===`${base}_${empresa}`);
        if(base) {
          const previous=new Map(this.getItem<any[]>(key,[]).map(row=>[row.id,JSON.stringify(row)]));
          const pending=this.getItem<Record<string,Record<string,any>>>(this.dirtyKey(),{});
          const name=this.syncNames[base]; pending[name] ||= {};
          const retained=new Set(value.map(row=>row.id));
          for(const id of Object.keys(pending[name])) if(!retained.has(id)) delete pending[name][id];
          for(const row of value) if(row.id && previous.get(row.id)!==JSON.stringify(row)) pending[name][row.id]=row;
          localStorage.setItem(this.dirtyKey(),JSON.stringify(pending));
        }
      }
      (this.isolatedStorage || localStorage).setItem(key, JSON.stringify(value));
      if (
        !this.isPullingCloud &&
        key !== KEYS.ACTIVE_USER &&
        !key.startsWith(KEYS.CHAT_SESSION) &&
        !key.includes(KEYS.CHAT_PROYECTOS)
      ) {
        this.scheduleCloudSync();
      }
    } catch (e) {
      if (this.aiLocalOnly) throw new Error('No se pudieron guardar los cambios en este dispositivo. Revisa el espacio disponible.');
      console.error('Error saving to localStorage', e);
    }
  }

  // --- USUARIOS Y ROL ACTIVO ---
  getUsuarios(): Usuario[] {
    const active = this.getActiveUser();
    const defaultUsers = this.isDemoTenant() ? INITIAL_USUARIOS : (active ? [active] : []);
    let usuarios = this.getItem<Usuario[]>(this.getTenantKey(KEYS.USUARIOS), defaultUsers);

    // Filtrar cuentas legacy o placeholder que no deben aparecer
    usuarios = usuarios.filter((u) => u.email?.toLowerCase() !== 'benjamin@obratrack.cl');

    if (active) {
      if (isDeveloperEmail(active.email)) {
        active.is_dev = true;
      }
      const existsIndex = usuarios.findIndex(
        (u) => u.id === active.id || (u.email && active.email && u.email.toLowerCase() === active.email.toLowerCase())
      );
      if (existsIndex === -1) {
        usuarios = [active, ...usuarios];
        this.setItem(this.getTenantKey(KEYS.USUARIOS), usuarios);
      } else {
        usuarios[existsIndex] = {
          ...usuarios[existsIndex],
          ...active,
          rol: active.rol || 'admin',
          is_dev: isDeveloperEmail(active.email),
        };
      }
    }
    return usuarios;
  }

  createUsuario(usuario: Omit<Usuario, 'id'>): Usuario {
    const active = this.getActiveUser();
    const usuarios = this.getUsuarios();
    const newUsuario: Usuario = {
      ...usuario,
      id: 'u-' + crypto.randomUUID(),
      empresa_id: usuario.empresa_id || active?.empresa_id || DEMO_EMPRESA_ID,
      created_at: new Date().toISOString(),
    };
    usuarios.push(newUsuario);
    this.setItem(this.getTenantKey(KEYS.USUARIOS), usuarios);
    if (!this.aiLocalOnly) { supabaseService.saveUsuario(newUsuario).catch((err) => console.warn('Sync supabase usuario:', err)); }
    return newUsuario;
  }

  updateUsuario(id: string, data: Partial<Usuario>): Usuario | null {
    const usuarios = this.getUsuarios();
    const index = usuarios.findIndex((u) => u.id === id);
    if (index === -1) return null;
    usuarios[index] = { ...usuarios[index], ...data };
    if (isDeveloperEmail(usuarios[index].email)) {
      usuarios[index].is_dev = true;
    }
    this.setItem(this.getTenantKey(KEYS.USUARIOS), usuarios);
    if (!this.aiLocalOnly) { supabaseService.saveUsuario(usuarios[index]).catch((err) => console.warn('Sync supabase usuario:', err)); }

    const active = this.getActiveUser();
    if (active && (active.id === id || active.email === usuarios[index].email)) {
      this.setActiveUser(usuarios[index]);
    }

    return usuarios[index];
  }

  deleteUsuario(id: string): boolean {
    const usuarios = this.getUsuarios();
    const target = usuarios.find((u) => u.id === id);
    if (target?.rol === 'admin' && !isDeveloperEmail(target?.email)) {
      console.warn('El dueño / administrador de la constructora no se puede eliminar, solo editar.');
      return false;
    }
    const filtered = usuarios.filter((u) => u.id !== id);
    this.setItem(this.getTenantKey(KEYS.USUARIOS), filtered);
    if (!this.aiLocalOnly) { supabaseService.deleteUsuario(id).catch((err) => console.warn('Delete supabase usuario:', err)); }
    return true;
  }

  getActiveUser(): Usuario | null {
    const user = this.getItem<Usuario | null>(KEYS.ACTIVE_USER, null);
    if (user) {
      user.is_dev = isDeveloperEmail(user.email);
    }
    return user;
  }

  setActiveUser(user: Usuario | null): void {
    if (user) {
      if (isDeveloperEmail(user.email)) {
        user.is_dev = true;
      }
      this.setItem(KEYS.ACTIVE_USER, user);
      this.getUsuarios();
    } else {
      this.clearActiveUser();
    }
  }

  clearActiveUser(): void {
    if (!this.isBrowser()) return;
    try {
      localStorage.removeItem(KEYS.ACTIVE_USER);
      this.clearChatSessionHistory();
    } catch (e) {
      console.error(e);
    }
  }

  // --- PERSISTENCIA DE CHAT POR SESIÓN ---
  getChatSessionHistory(): MensajeChatCotizador[] | null {
    if (!this.isBrowser()) return null;
    try {
      const data = sessionStorage.getItem(KEYS.CHAT_SESSION) || localStorage.getItem(KEYS.CHAT_SESSION);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  saveChatSessionHistory(messages: any[]): void {
    if (!this.isBrowser()) return;
    try {
      const serialized = JSON.stringify(messages);
      sessionStorage.setItem(KEYS.CHAT_SESSION, serialized);
      localStorage.setItem(KEYS.CHAT_SESSION, serialized);
    } catch (e) {
      console.error(e);
    }
  }

  clearChatSessionHistory(): void {
    if (!this.isBrowser()) return;
    try {
      sessionStorage.removeItem(KEYS.CHAT_SESSION);
      localStorage.removeItem(KEYS.CHAT_SESSION);
    } catch (e) {
      console.error(e);
    }
  }

  // --- PLAN DE LA EMPRESA ---
  getActivePlan(): SubscriptionPlanId {
    const defaultPlan: SubscriptionPlanId = 'gratis';
    const plan = this.getItem<SubscriptionPlanId>(this.getTenantKey(KEYS.PLAN), defaultPlan);
    return plan === 'pro_ia' || plan === 'pro' ? plan : 'gratis';
  }

  // --- CLIENTES ---
  getClientes(): Cliente[] {
    const defaultClientes = this.isDemoTenant() ? INITIAL_CLIENTES : [];
    return this.getItem<Cliente[]>(this.getTenantKey(KEYS.CLIENTES), defaultClientes);
  }

  getClienteById(id: string): Cliente | null {
    const clientes = this.getClientes();
    return clientes.find((c) => c.id === id) || null;
  }

  createCliente(cliente: Omit<Cliente, 'id'>): Cliente {
    const active = this.getActiveUser();
    const clientes = this.getClientes();
    const newCliente: Cliente = {
      ...cliente,
      id: 'c-' + crypto.randomUUID(),
      empresa_id: cliente.empresa_id || active?.empresa_id || DEMO_EMPRESA_ID,
      created_at: new Date().toISOString(),
    };
    clientes.push(newCliente);
    this.setItem(this.getTenantKey(KEYS.CLIENTES), clientes);
    if (!this.aiLocalOnly) { supabaseService.saveCliente(newCliente).catch((err) => console.warn('Sync supabase cliente:', err)); }
    return newCliente;
  }

  updateCliente(id: string, data: Partial<Cliente>): Cliente | null {
    const clientes = this.getClientes();
    const index = clientes.findIndex((c) => c.id === id);
    if (index === -1) return null;
    clientes[index] = { ...clientes[index], ...data };
    this.setItem(this.getTenantKey(KEYS.CLIENTES), clientes);
    if (!this.aiLocalOnly) { supabaseService.saveCliente(clientes[index]).catch((err) => console.warn('Sync supabase cliente:', err)); }
    return clientes[index];
  }

  deleteCliente(id: string): boolean {
    const clientes = this.getClientes();
    const filtered = clientes.filter((c) => c.id !== id);
    this.setItem(this.getTenantKey(KEYS.CLIENTES), filtered);
    if (!this.aiLocalOnly) { supabaseService.deleteCliente(id).catch((err) => console.warn('Delete supabase cliente:', err)); }
    return true;
  }

  buscarClientePorRutONombre(busqueda: string): Cliente | null {
    if (!busqueda || busqueda.trim() === '') return null;
    const clientes = this.getClientes();

    const normalize = (str: string) =>
      str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

    const cleanQuery = normalize(busqueda);
    const cleanSearchDigits = cleanQuery.replace(/[^a-z0-9]/g, '');

    // 1. Buscar por RUT
    for (const c of clientes) {
      if (c.rut) {
        const cleanRut = normalize(c.rut).replace(/[^a-z0-9]/g, '');
        if (cleanRut.length >= 7 && cleanSearchDigits.includes(cleanRut)) {
          return c;
        }
      }
    }

    // 2. Buscar por Nombre Completo
    for (const c of clientes) {
      const cleanNombre = normalize(c.nombre);
      if (cleanQuery.includes(cleanNombre)) {
        return c;
      }
    }

    // 3. Buscar por Nombre de Pila o Apellido
    for (const c of clientes) {
      const tokens = normalize(c.nombre).split(/\s+/);
      for (const token of tokens) {
        if (token.length >= 4 && cleanQuery.includes(token)) {
          return c;
        }
      }
    }

    return null;
  }

  obtenerFichaCompletaCliente(clienteId: string) {
    const cliente = this.getClienteById(clienteId);
    if (!cliente) return null;

    const proyectosCliente = this.getProyectos().filter((p) => p.cliente_id === clienteId);
    const actividades = this.getActividades();
    const pagos = this.getPagos();
    const bitacora = this.getBitacora();

    const proyectosDetalle = proyectosCliente.map((p) => {
      const acts = actividades.filter((a) => a.proyecto_id === p.id);
      const pgs = pagos.filter((pay) => pay.proyecto_id === p.id);
      const bits = bitacora.filter((b) => b.proyecto_id === p.id);

      const totalContratado = Number(p.monto_cotizado || 0);
      const totalPagado = pgs.reduce((sum, pay) => sum + Number(pay.monto || 0), 0);
      const saldoPendiente = Math.max(0, totalContratado - totalPagado);

      let porcentajeAvance = 0;
      if (acts.length > 0) {
        const sum = acts.reduce((acc, curr) => acc + Number(curr.porcentaje_avance || 0), 0);
        porcentajeAvance = Math.round(sum / acts.length);
      }

      const fotos = bits
        .filter((b) => b.foto_url && b.foto_url.trim() !== '')
        .map((b) => b.foto_url as string);

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
        actividades: acts.map((a) => ({
          nombre: a.nombre,
          porcentaje_avance: Number(a.porcentaje_avance || 0),
          estado: a.estado,
        })),
        id: p.id,
        nombre: p.nombre,
        comuna: p.comuna,
        direccion: p.direccion,
        estado: p.estado,
        fecha_inicio: p.fecha_inicio,
        fecha_termino_estimada: p.fecha_termino_estimada,
        porcentaje_avance: porcentajeAvance,
        total_contratado: totalContratado,
        total_pagado: totalPagado,
        saldo_pendiente: saldoPendiente,
        fotos_avance: Array.from(new Set(fotos)),
      };
    });

    return {
      cliente,
      proyectos: proyectosDetalle,
    };
  }

  // --- PROYECTOS ---
  getProyectos(): Proyecto[] {
    const defaultProjs = this.isDemoTenant() ? INITIAL_PROYECTOS : [];
    const proyectos = this.getItem<Proyecto[]>(this.getTenantKey(KEYS.PROYECTOS), defaultProjs);
    const clientes = this.getClientes();
    const usuarios = this.getUsuarios();
    const actividades = this.getActividades();
    const pagos = this.getPagos();
    const imprevistos = this.getImprevistos();
    const materiales = this.getMaterialesProyecto();
    const bitacora = this.getBitacora();

    return proyectos.map((p) => {
      const projActs = actividades.filter((a) => a.proyecto_id === p.id);
      const projPagos = pagos.filter((pay) => pay.proyecto_id === p.id);
      const projImprevistos = imprevistos.filter((imp) => imp.proyecto_id === p.id);
      const projMateriales = materiales.filter((m) => m.proyecto_id === p.id);
      const projBitacora = bitacora.filter((b) => b.proyecto_id === p.id);
      const projTrabajadores = usuarios.filter((u) => (p.trabajadores_ids || []).includes(u.id));

      const total_pagado = projPagos.reduce((sum, item) => sum + Number(item.monto), 0);
      const total_imprevistos = projImprevistos.reduce((sum, item) => sum + Number(item.monto), 0);
      const total_materiales = projMateriales.reduce(
        (sum, item) => sum + Number(item.subtotal || item.cantidad * item.precio_unitario),
        0
      );
      const saldo_pendiente = Math.max(0, p.monto_cotizado - total_pagado);

      let porcentaje_avance_ponderado = 0;
      if (projActs.length > 0) {
        const sumAvance = projActs.reduce((acc, curr) => acc + Number(curr.porcentaje_avance), 0);
        porcentaje_avance_ponderado = Math.round(sumAvance / projActs.length);
      }

      return {
        ...p,
        cliente: clientes.find((c) => c.id === p.cliente_id),
        trabajadores: projTrabajadores,
        actividades: projActs,
        materiales: projMateriales,
        bitacora: projBitacora,
        pagos: projPagos,
        imprevistos: projImprevistos,
        total_pagado,
        total_imprevistos,
        total_materiales,
        saldo_pendiente,
        porcentaje_avance_ponderado,
      };
    });
  }

  getProyectoById(id: string): Proyecto | null {
    const proyectos = this.getProyectos();
    return proyectos.find((p) => p.id === id) || null;
  }

  createProyecto(
    data: Omit<Proyecto, 'id'>,
    actividadesIniciales?: Array<{ nombre: string; dias: number }>
  ): Proyecto {
    const activeUser = this.getActiveUser();
    const plan = this.getActivePlan();

    // Verificación de límite del Plan Gratis (máx 1 obra activa)
    if (plan === 'gratis') {
      const activeProjects = this.getProyectos().filter((p) => p.estado === 'activo');
      if (activeProjects.length >= 1) {
        throw new Error(
          'Límite del Plan Gratis alcanzado: solo puedes mantener 1 obra activa simultáneamente. Actualiza a Plan Pro para gestionar obras ilimitadas.'
        );
      }
    }

    const defaultProjs = this.isDemoTenant() ? INITIAL_PROYECTOS : [];
    const proyectos = this.getItem<Proyecto[]>(this.getTenantKey(KEYS.PROYECTOS), defaultProjs);
    const newProjId = 'p-' + crypto.randomUUID();
    const newProyecto: Proyecto = {
      ...data,
      id: newProjId,
      empresa_id: data.empresa_id || activeUser?.empresa_id || DEMO_EMPRESA_ID,
      created_at: new Date().toISOString(),
    };
    proyectos.unshift(newProyecto);
    this.setItem(this.getTenantKey(KEYS.PROYECTOS), proyectos);

    if (!this.aiLocalOnly) { supabaseService.saveProyecto(newProyecto).catch((err) => console.warn('Sync supabase proyecto:', err)); }

    if (actividadesIniciales && actividadesIniciales.length > 0) {
      let currentDate = new Date(newProyecto.fecha_inicio);
      actividadesIniciales.forEach((act, idx) => {
        const start = currentDate.toISOString().split('T')[0];
        currentDate.setDate(currentDate.getDate() + act.dias);
        const end = currentDate.toISOString().split('T')[0];
        this.createActividad({
          proyecto_id: newProjId,
          nombre: act.nombre,
          fecha_inicio: start,
          fecha_termino: end,
          porcentaje_avance: 0,
          estado: 'pendiente',
          orden: idx + 1,
        });
      });
    }

    return newProyecto;
  }

  deleteProyecto(id: string): boolean {
    const defaultProjs = this.isDemoTenant() ? INITIAL_PROYECTOS : [];
    const proyectos = this.getItem<Proyecto[]>(this.getTenantKey(KEYS.PROYECTOS), defaultProjs);
    const filtered = proyectos.filter((p) => p.id !== id);
    this.setItem(this.getTenantKey(KEYS.PROYECTOS), filtered);

    if (!this.aiLocalOnly) { supabaseService.deleteProyecto(id).catch((err) => console.warn('Delete supabase proyecto:', err)); }
    return true;
  }

  updateProyecto(id: string, data: Partial<Proyecto>): Proyecto | null {
    const defaultProjs = this.isDemoTenant() ? INITIAL_PROYECTOS : [];
    const proyectos = this.getItem<Proyecto[]>(this.getTenantKey(KEYS.PROYECTOS), defaultProjs);
    const index = proyectos.findIndex((p) => p.id === id);
    if (index === -1) return null;

    proyectos[index] = { ...proyectos[index], ...data };
    this.setItem(this.getTenantKey(KEYS.PROYECTOS), proyectos);
    if (!this.aiLocalOnly) { supabaseService.saveProyecto(proyectos[index]).catch((err) => console.warn('Update supabase proyecto:', err)); }
    return proyectos[index];
  }

  // --- MATERIALES PROYECTO ---
  getMaterialesProyecto(proyectoId?: string): MaterialProyecto[] {
    const all = this.getItem<MaterialProyecto[]>(this.getTenantKey(KEYS.MATERIALES_PROYECTO), []);
    if (proyectoId) {
      return all.filter((m) => m.proyecto_id === proyectoId);
    }
    return all;
  }

  createMaterialProyecto(mat: Omit<MaterialProyecto, 'id'>): MaterialProyecto {
    const all = this.getItem<MaterialProyecto[]>(this.getTenantKey(KEYS.MATERIALES_PROYECTO), []);
    const newMat: MaterialProyecto = {
      ...mat,
      id: 'mat-' + crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    all.push(newMat);
    this.setItem(this.getTenantKey(KEYS.MATERIALES_PROYECTO), all);
    if (!this.aiLocalOnly) { supabaseService.saveMaterial(newMat).catch((err) => console.warn('Sync supabase material:', err)); }
    return newMat;
  }

  deleteMaterialProyecto(id: string): boolean {
    const all = this.getItem<MaterialProyecto[]>(this.getTenantKey(KEYS.MATERIALES_PROYECTO), []);
    this.setItem(this.getTenantKey(KEYS.MATERIALES_PROYECTO), all.filter((m) => m.id !== id));
    if (!this.aiLocalOnly) { supabaseService.deleteMaterial(id).catch((err) => console.warn('Delete supabase material:', err)); }
    return true;
  }

  updateMaterialProyecto(id: string, data: Partial<MaterialProyecto>): MaterialProyecto | null {
    const all = this.getItem<MaterialProyecto[]>(this.getTenantKey(KEYS.MATERIALES_PROYECTO), []);
    const index = all.findIndex((m) => m.id === id);
    if (index === -1) return null;
    all[index] = { ...all[index], ...data };
    this.setItem(this.getTenantKey(KEYS.MATERIALES_PROYECTO), all);
    if (!this.aiLocalOnly) { supabaseService.saveMaterial(all[index]).catch((err) => console.warn('Sync supabase material:', err)); }
    return all[index];
  }

  // --- BITÁCORA ---
  getBitacora(proyectoId?: string): BitacoraEntrada[] {
    const all = this.getItem<BitacoraEntrada[]>(this.getTenantKey(KEYS.BITACORA), []);
    if (proyectoId) {
      return all.filter((b) => b.proyecto_id === proyectoId);
    }
    return all;
  }

  createBitacoraEntrada(entry: Omit<BitacoraEntrada, 'id'>): BitacoraEntrada {
    const all = this.getItem<BitacoraEntrada[]>(this.getTenantKey(KEYS.BITACORA), []);
    const newEntry: BitacoraEntrada = {
      ...entry,
      id: 'bit-' + crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    all.unshift(newEntry);
    this.setItem(this.getTenantKey(KEYS.BITACORA), all);
    if (!this.aiLocalOnly) { supabaseService.saveBitacora(newEntry).catch((err) => console.warn('Sync supabase bitacora:', err)); }
    return newEntry;
  }

  updateBitacoraEntrada(id: string, data: Partial<BitacoraEntrada>): BitacoraEntrada | null {
    const all = this.getItem<BitacoraEntrada[]>(this.getTenantKey(KEYS.BITACORA), []);
    const index = all.findIndex((b) => b.id === id);
    if (index === -1) return null;
    all[index] = { ...all[index], ...data };
    this.setItem(this.getTenantKey(KEYS.BITACORA), all);
    if (!this.aiLocalOnly) { supabaseService.saveBitacora(all[index]).catch((err) => console.warn('Sync supabase bitacora:', err)); }
    return all[index];
  }

  deleteBitacoraEntrada(id: string): boolean {
    const all = this.getItem<BitacoraEntrada[]>(this.getTenantKey(KEYS.BITACORA), []);
    this.setItem(this.getTenantKey(KEYS.BITACORA), all.filter((b) => b.id !== id));
    if (!this.aiLocalOnly) { supabaseService.deleteBitacora(id).catch((err) => console.warn('Delete supabase bitacora:', err)); }
    return true;
  }

  // --- ACTIVIDADES (CARTA GANTT) ---
  getActividades(proyectoId?: string): Actividad[] {
    const defaultActs = this.isDemoTenant() ? INITIAL_ACTIVIDADES : [];
    const all = this.getItem<Actividad[]>(this.getTenantKey(KEYS.ACTIVIDADES), defaultActs);
    const usuarios = this.getUsuarios();
    const list = proyectoId ? all.filter((a) => a.proyecto_id === proyectoId) : all;
    return list
      .map((a) => ({
        ...a,
        responsable: usuarios.find((u) => u.id === a.responsable_id),
      }))
      .sort((a, b) => a.orden - b.orden);
  }

  createActividad(actividad: Omit<Actividad, 'id'>): Actividad {
    const defaultActs = this.isDemoTenant() ? INITIAL_ACTIVIDADES : [];
    const actividades = this.getItem<Actividad[]>(this.getTenantKey(KEYS.ACTIVIDADES), defaultActs);
    const newActividad: Actividad = {
      ...actividad,
      id: 'act-' + crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    actividades.push(newActividad);
    this.setItem(this.getTenantKey(KEYS.ACTIVIDADES), actividades);
    if (!this.aiLocalOnly) { supabaseService.saveActividad(newActividad).catch((err) => console.warn('Sync supabase actividad:', err)); }
    return newActividad;
  }

  updateActividad(id: string, data: Partial<Actividad>): Actividad | null {
    const defaultActs = this.isDemoTenant() ? INITIAL_ACTIVIDADES : [];
    const actividades = this.getItem<Actividad[]>(this.getTenantKey(KEYS.ACTIVIDADES), defaultActs);
    const index = actividades.findIndex((a) => a.id === id);
    if (index === -1) return null;

    actividades[index] = { ...actividades[index], ...data };
    this.setItem(this.getTenantKey(KEYS.ACTIVIDADES), actividades);
    if (!this.aiLocalOnly) { supabaseService.saveActividad(actividades[index]).catch((err) => console.warn('Sync supabase actividad:', err)); }
    return actividades[index];
  }

  deleteActividad(id: string): boolean {
    const defaultActs = this.isDemoTenant() ? INITIAL_ACTIVIDADES : [];
    const actividades = this.getItem<Actividad[]>(this.getTenantKey(KEYS.ACTIVIDADES), defaultActs);
    const filtered = actividades.filter((a) => a.id !== id);
    this.setItem(this.getTenantKey(KEYS.ACTIVIDADES), filtered);
    if (!this.aiLocalOnly) { supabaseService.deleteActividad(id).catch((err) => console.warn('Delete supabase actividad:', err)); }
    return true;
  }

  // --- PAGOS ---
  getPagos(proyectoId?: string): Pago[] {
    const defaultPagos = this.isDemoTenant() ? INITIAL_PAGOS : [];
    const all = this.getItem<Pago[]>(this.getTenantKey(KEYS.PAGOS), defaultPagos);
    if (proyectoId) {
      return all.filter((p) => p.proyecto_id === proyectoId);
    }
    return all;
  }

  createPago(pago: Omit<Pago, 'id'>): Pago {
    const defaultPagos = this.isDemoTenant() ? INITIAL_PAGOS : [];
    const pagos = this.getItem<Pago[]>(this.getTenantKey(KEYS.PAGOS), defaultPagos);
    const newPago: Pago = {
      ...pago,
      id: 'pay-' + crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    pagos.push(newPago);
    this.setItem(this.getTenantKey(KEYS.PAGOS), pagos);
    if (!this.aiLocalOnly) { supabaseService.savePago(newPago).catch((err) => console.warn('Sync supabase pago:', err)); }
    return newPago;
  }

  updatePago(id: string, data: Partial<Pago>): Pago | null {
    const defaultPagos = this.isDemoTenant() ? INITIAL_PAGOS : [];
    const pagos = this.getItem<Pago[]>(this.getTenantKey(KEYS.PAGOS), defaultPagos);
    const index = pagos.findIndex((p) => p.id === id);
    if (index === -1) return null;

    pagos[index] = { ...pagos[index], ...data };
    this.setItem(this.getTenantKey(KEYS.PAGOS), pagos);
    if (!this.aiLocalOnly) { supabaseService.savePago(pagos[index]).catch((err) => console.warn('Sync supabase pago:', err)); }
    return pagos[index];
  }

  deletePago(id: string): boolean {
    const defaultPagos = this.isDemoTenant() ? INITIAL_PAGOS : [];
    const pagos = this.getItem<Pago[]>(this.getTenantKey(KEYS.PAGOS), defaultPagos);
    const filtered = pagos.filter((p) => p.id !== id);
    this.setItem(this.getTenantKey(KEYS.PAGOS), filtered);
    if (!this.aiLocalOnly) { supabaseService.deletePago(id).catch((err) => console.warn('Delete supabase pago:', err)); }
    return true;
  }

  // --- IMPREVISTOS ---
  getImprevistos(proyectoId?: string): Imprevisto[] {
    const defaultImps = this.isDemoTenant() ? INITIAL_IMPREVISTOS : [];
    const all = this.getItem<Imprevisto[]>(this.getTenantKey(KEYS.IMPREVISTOS), defaultImps);
    if (proyectoId) {
      return all.filter((i) => i.proyecto_id === proyectoId);
    }
    return all;
  }

  createImprevisto(imprevisto: Omit<Imprevisto, 'id'>): Imprevisto {
    const defaultImps = this.isDemoTenant() ? INITIAL_IMPREVISTOS : [];
    const imprevistos = this.getItem<Imprevisto[]>(this.getTenantKey(KEYS.IMPREVISTOS), defaultImps);
    const newImprevisto: Imprevisto = {
      ...imprevisto,
      id: 'imp-' + crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    imprevistos.push(newImprevisto);
    this.setItem(this.getTenantKey(KEYS.IMPREVISTOS), imprevistos);
    if (!this.aiLocalOnly) { supabaseService.saveImprevisto(newImprevisto).catch((err) => console.warn('Sync supabase imprevisto:', err)); }
    return newImprevisto;
  }

  updateImprevisto(id: string, data: Partial<Imprevisto>): Imprevisto | null {
    const defaultImps = this.isDemoTenant() ? INITIAL_IMPREVISTOS : [];
    const imprevistos = this.getItem<Imprevisto[]>(this.getTenantKey(KEYS.IMPREVISTOS), defaultImps);
    const index = imprevistos.findIndex((i) => i.id === id);
    if (index === -1) return null;

    imprevistos[index] = { ...imprevistos[index], ...data };
    this.setItem(this.getTenantKey(KEYS.IMPREVISTOS), imprevistos);
    if (!this.aiLocalOnly) { supabaseService.saveImprevisto(imprevistos[index]).catch((err) => console.warn('Sync supabase imprevisto:', err)); }
    return imprevistos[index];
  }

  deleteImprevisto(id: string): boolean {
    const defaultImps = this.isDemoTenant() ? INITIAL_IMPREVISTOS : [];
    const imprevistos = this.getItem<Imprevisto[]>(this.getTenantKey(KEYS.IMPREVISTOS), defaultImps);
    const filtered = imprevistos.filter((i) => i.id !== id);
    this.setItem(this.getTenantKey(KEYS.IMPREVISTOS), filtered);
    if (!this.aiLocalOnly) { supabaseService.deleteImprevisto(id).catch((err) => console.warn('Delete supabase imprevisto:', err)); }
    return true;
  }

  // --- REPORTES ---
  getReportes(): ReporteWhatsApp[] {
    const defaultReps = this.isDemoTenant() ? INITIAL_REPORTES : [];
    return this.getItem<ReporteWhatsApp[]>(this.getTenantKey(KEYS.REPORTES), defaultReps);
  }

  createReporte(reporte: Omit<ReporteWhatsApp, 'id'>): ReporteWhatsApp {
    const defaultReps = this.isDemoTenant() ? INITIAL_REPORTES : [];
    const reportes = this.getItem<ReporteWhatsApp[]>(this.getTenantKey(KEYS.REPORTES), defaultReps);
    const newReporte: ReporteWhatsApp = {
      ...reporte,
      id: 'rep-' + crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    reportes.unshift(newReporte);
    this.setItem(this.getTenantKey(KEYS.REPORTES), reportes);
    return newReporte;
  }

  aprobarReporte(id: string): boolean {
    const defaultReps = this.isDemoTenant() ? INITIAL_REPORTES : [];
    const reportes = this.getItem<ReporteWhatsApp[]>(this.getTenantKey(KEYS.REPORTES), defaultReps);
    const index = reportes.findIndex((r) => r.id === id);
    if (index === -1) return false;

    reportes[index].estado = 'aprobado';
    this.setItem(this.getTenantKey(KEYS.REPORTES), reportes);
    return true;
  }

  rechazarReporte(id: string): boolean {
    const defaultReps = this.isDemoTenant() ? INITIAL_REPORTES : [];
    const reportes = this.getItem<ReporteWhatsApp[]>(this.getTenantKey(KEYS.REPORTES), defaultReps);
    const index = reportes.findIndex((r) => r.id === id);
    if (index === -1) return false;

    reportes[index].estado = 'rechazado';
    this.setItem(this.getTenantKey(KEYS.REPORTES), reportes);
    this.scheduleCloudSync();
    return true;
  }

  // --- RECLAMOS, INCIDENCIAS Y SOLICITUDES DE CAMBIO POR OBRA ---
  getReclamosCambios(proyectoId?: string): ReclamoCambioObra[] {
    const all = this.getItem<ReclamoCambioObra[]>(this.getTenantKey(KEYS.RECLAMOS_CAMBIOS), []);
    if (proyectoId) {
      return all.filter((r) => r.proyecto_id === proyectoId);
    }
    return all;
  }

  createReclamoCambio(
    data: Omit<ReclamoCambioObra, 'id' | 'created_at' | 'materiales_inyectados'> & {
      materiales_inyectados?: boolean;
    }
  ): ReclamoCambioObra {
    const active = this.getActiveUser();
    const list = this.getReclamosCambios();
    const newItem: ReclamoCambioObra = {
      ...data,
      id: 'rc-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      empresa_id: data.empresa_id || active?.empresa_id || DEMO_EMPRESA_ID,
      impacto_monto: Number(data.impacto_monto) || 0,
      impacto_dias: Number(data.impacto_dias) || 0,
      materiales_requeridos: Array.isArray(data.materiales_requeridos) ? data.materiales_requeridos : [],
      materiales_inyectados: Boolean(data.materiales_inyectados),
      fecha: data.fecha || new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString(),
    };
    list.unshift(newItem);
    this.setItem(this.getTenantKey(KEYS.RECLAMOS_CAMBIOS), list);
    this.scheduleCloudSync();
    return newItem;
  }

  updateReclamoCambio(id: string, data: Partial<ReclamoCambioObra>): ReclamoCambioObra | null {
    const list = this.getReclamosCambios();
    const idx = list.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...data };
    this.setItem(this.getTenantKey(KEYS.RECLAMOS_CAMBIOS), list);
    this.scheduleCloudSync();
    return list[idx];
  }

  deleteReclamoCambio(id: string): boolean {
    const list = this.getReclamosCambios();
    const filtered = list.filter((r) => r.id !== id);
    this.setItem(this.getTenantKey(KEYS.RECLAMOS_CAMBIOS), filtered);
    this.scheduleCloudSync();
    return true;
  }

  /**
   * Aprueba una solicitud de cambio o incidencia e inyecta automáticamente:
   * 1) Los materiales nuevos requeridos en Finanzas y materiales (materiales_proyecto)
   * 2) El ajuste en el presupuesto cotizado (monto_cotizado) si aplica
   * 3) La extensión en días de la fecha de término estimada si aplica
   * 4) Un registro de trazabilidad en la Bitácora de la obra
   */
  aprobarEInyectarCambioObra(
    id: string,
    opciones?: { ajustarPresupuesto?: boolean; ajustarPlazo?: boolean; resolucionNotas?: string }
  ): { exito: boolean; materialesAgregados: number; nuevoMontoCotizado?: number } {
    const item = this.getReclamosCambios().find((r) => r.id === id);
    if (!item) return { exito: false, materialesAgregados: 0 };

    const proj = this.getProyectoById(item.proyecto_id);
    if (!proj) return { exito: false, materialesAgregados: 0 };

    let materialesAgregados = 0;

    if (!item.materiales_inyectados && item.materiales_requeridos.length > 0) {
      item.materiales_requeridos.forEach((m) => {
        const cant = Number(m.cantidad) || 1;
        const pu = Number(m.precio_unitario) || 0;
        this.createMaterialProyecto({
          proyecto_id: proj.id,
          nombre: `${m.nombre} (Adicional Cambio)`,
          categoria: 'Solicitud de Cambio',
          cantidad: cant,
          unidad: m.unidad || 'unidad',
          precio_unitario: pu,
          subtotal: roundLine(cant, pu),
          comprado: false,
        });
        materialesAgregados++;
      });
    }

    let nuevoMonto = proj.monto_cotizado || 0;
    const debeAjustarMonto = opciones?.ajustarPresupuesto !== false && item.impacto_monto > 0 && !item.materiales_inyectados;
    if (debeAjustarMonto) {
      nuevoMonto = nuevoMonto + item.impacto_monto;
    }

    let nuevaFechaTermino = proj.fecha_termino_estimada;
    const debeAjustarPlazo = opciones?.ajustarPlazo !== false && item.impacto_dias > 0 && !item.materiales_inyectados;
    if (debeAjustarPlazo && proj.fecha_termino_estimada) {
      const f = new Date(proj.fecha_termino_estimada);
      f.setDate(f.getDate() + item.impacto_dias);
      nuevaFechaTermino = f.toISOString().split('T')[0];
    }

    if (debeAjustarMonto || debeAjustarPlazo) {
      this.updateProyecto(proj.id, {
        monto_cotizado: nuevoMonto,
        fecha_termino_estimada: nuevaFechaTermino,
      });
    }

    this.updateReclamoCambio(id, {
      estado: 'aprobado',
      materiales_inyectados: true,
      resolucion_notas:
        opciones?.resolucionNotas ||
        item.resolucion_notas ||
        `Aprobado e incorporado a la obra (${materialesAgregados} insumos cargados).`,
    });

    const active = this.getActiveUser();
    this.createBitacoraEntrada({
      proyecto_id: proj.id,
      usuario_id: active?.id || 'u-1',
      autor_nombre: active?.nombre || 'Administración Obra',
      titulo: `Cambio Aprobado: ${item.titulo}`,
      nota: `${item.descripcion}. Impacto: +$${item.impacto_monto.toLocaleString('es-CL')} CLP, +${item.impacto_dias} días. Materiales inyectados: ${materialesAgregados}.`,
      tipo: 'avance',
      fecha: new Date().toISOString().split('T')[0],
    });

    this.scheduleCloudSync();
    return {
      exito: true,
      materialesAgregados,
      nuevoMontoCotizado: nuevoMonto,
    };
  }

  // --- REPOSITORIO DOCUMENTAL POR OBRA ---
  getDocumentosObra(proyectoId?: string, categoria?: CategoriaDocumentoObra): DocumentoObra[] {
    let list = this.getItem<DocumentoObra[]>(this.getTenantKey(KEYS.DOCUMENTOS_OBRA), []);
    if (proyectoId) {
      list = list.filter((d) => d.proyecto_id === proyectoId);
    }
    if (categoria) {
      list = list.filter((d) => d.categoria === categoria);
    }
    return list;
  }

  createDocumentoObra(data: Omit<DocumentoObra, 'id' | 'created_at'>): DocumentoObra {
    const active = this.getActiveUser();
    const list = this.getDocumentosObra();
    const newDoc: DocumentoObra = {
      ...data,
      id: 'doc-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      empresa_id: data.empresa_id || active?.empresa_id || DEMO_EMPRESA_ID,
      subido_por_id: data.subido_por_id || active?.id,
      subido_por_nombre: data.subido_por_nombre || active?.nombre || 'Administrador',
      fecha_documento: data.fecha_documento || new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString(),
    };
    list.unshift(newDoc);
    this.setItem(this.getTenantKey(KEYS.DOCUMENTOS_OBRA), list);
    this.scheduleCloudSync();
    return newDoc;
  }

  updateDocumentoObra(id: string, data: Partial<DocumentoObra>): DocumentoObra | null {
    const list = this.getDocumentosObra();
    const idx = list.findIndex((d) => d.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...data };
    this.setItem(this.getTenantKey(KEYS.DOCUMENTOS_OBRA), list);
    this.scheduleCloudSync();
    return list[idx];
  }

  deleteDocumentoObra(id: string): boolean {
    const list = this.getDocumentosObra();
    const filtered = list.filter((d) => d.id !== id);
    this.setItem(this.getTenantKey(KEYS.DOCUMENTOS_OBRA), filtered);
    this.scheduleCloudSync();
    return true;
  }

  async uploadArchivoObra(
    file: File,
    proyectoId: string,
    bucket: 'documentos-obra' | 'bitacora-fotos' = 'documentos-obra'
  ): Promise<{ publicUrl: string; fileName: string; fileSize: number; mimeType: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('proyectoId', proyectoId);
    formData.append('bucket', bucket);

    const {data,error}=await supabase.auth.getSession();
    if(error||!data.session?.access_token) throw new Error('Inicia sesión para subir archivos.');
    const res = await fetch('/api/supabase/upload', {
      method: 'POST',
      headers: {Authorization:`Bearer ${data.session.access_token}`},
      body: formData,
    });

    const json = await res.json();
    if (!res.ok || !json.publicUrl) {
      throw new Error(json.error || 'No se pudo subir el archivo a Supabase Storage.');
    }

    return {
      publicUrl: json.publicUrl,
      fileName: json.fileName,
      fileSize: json.fileSize,
      mimeType: json.mimeType,
    };
  }

  // --- CONTROL DE ASISTENCIA DE OBREROS ---
  calcularHorasTrabajadas(horaEntrada?: string, horaSalida?: string): number {
    if (!horaEntrada || !horaSalida) return 0;
    const partsIn = horaEntrada.split(':').map(Number);
    const partsOut = horaSalida.split(':').map(Number);
    if (partsIn.length < 2 || partsOut.length < 2) return 0;
    const minsIn = partsIn[0] * 60 + partsIn[1];
    const minsOut = partsOut[0] * 60 + partsOut[1];
    if (minsOut <= minsIn) return 0;
    // Descontar 1 hora de colación si la jornada supera 6 horas
    const rawHours = (minsOut - minsIn) / 60;
    const netHours = rawHours >= 6.5 ? rawHours - 1 : rawHours;
    return Math.round(netHours * 10) / 10;
  }

  getAsistencias(proyectoId?: string, fecha?: string): AsistenciaObrero[] {
    let list = this.getItem<AsistenciaObrero[]>(this.getTenantKey(KEYS.ASISTENCIAS_OBRA), []);
    if (proyectoId) {
      list = list.filter((a) => a.proyecto_id === proyectoId);
    }
    if (fecha) {
      list = list.filter((a) => a.fecha === fecha);
    }
    return list;
  }

  upsertAsistenciaObrero(
    data: Omit<AsistenciaObrero, 'id' | 'created_at'> & { id?: string }
  ): AsistenciaObrero {
    const active = this.getActiveUser();
    const list = this.getAsistencias();

    const horas =
      data.estado === 'presente' || data.estado === 'atraso'
        ? data.horas_trabajadas ??
          this.calcularHorasTrabajadas(data.hora_entrada || '08:00', data.hora_salida || '18:00')
        : 0;

    const existingIdx = list.findIndex(
      (a) =>
        (data.id && a.id === data.id) ||
        (a.proyecto_id === data.proyecto_id &&
          a.fecha === data.fecha &&
          ((data.usuario_id && a.usuario_id === data.usuario_id) ||
            a.trabajador_nombre.toLowerCase().trim() === data.trabajador_nombre.toLowerCase().trim()))
    );

    if (existingIdx !== -1) {
      list[existingIdx] = {
        ...list[existingIdx],
        ...data,
        horas_trabajadas: horas,
      };
      this.setItem(this.getTenantKey(KEYS.ASISTENCIAS_OBRA), list);
      this.scheduleCloudSync();
      return list[existingIdx];
    }

    const nuevo: AsistenciaObrero = {
      ...data,
      id: data.id || 'asis-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      empresa_id: data.empresa_id || active?.empresa_id || DEMO_EMPRESA_ID,
      horas_trabajadas: horas,
      registrado_por: data.registrado_por || active?.nombre || 'Supervisor',
      created_at: new Date().toISOString(),
    };

    list.unshift(nuevo);
    this.setItem(this.getTenantKey(KEYS.ASISTENCIAS_OBRA), list);
    this.scheduleCloudSync();
    return nuevo;
  }

  marcarCuadrillaPresente(
    proyectoId: string,
    fecha: string,
    horaEntrada = '08:00',
    horaSalida = '18:00'
  ): AsistenciaObrero[] {
    const proj = this.getProyectoById(proyectoId);
    const todosUsuarios = this.getUsuarios();
    let cuadrilla = todosUsuarios.filter((u) => proj?.trabajadores_ids?.includes(u.id));
    if (cuadrilla.length === 0) {
      cuadrilla = todosUsuarios.filter((u) => u.rol === 'terreno' || u.rol === 'supervisor');
    }

    const resultados: AsistenciaObrero[] = [];
    cuadrilla.forEach((trabajador) => {
      const reg = this.upsertAsistenciaObrero({
        proyecto_id: proyectoId,
        usuario_id: trabajador.id,
        trabajador_nombre: trabajador.nombre,
        trabajador_rol: trabajador.rol,
        fecha,
        estado: 'presente',
        hora_entrada: horaEntrada,
        hora_salida: horaSalida,
        origen: 'web',
      });
      resultados.push(reg);
    });

    return resultados;
  }

  deleteAsistencia(id: string): boolean {
    const list = this.getAsistencias();
    const filtered = list.filter((a) => a.id !== id);
    this.setItem(this.getTenantKey(KEYS.ASISTENCIAS_OBRA), filtered);
    this.scheduleCloudSync();
    return true;
  }

  // --- COTIZACIONES Y ESTIMACIONES IA ---
  getCotizaciones(): CotizacionEstimacion[] {
    const defaultCots = this.isDemoTenant() ? INITIAL_COTIZACIONES : [];
    return this.getItem<CotizacionEstimacion[]>(this.getTenantKey(KEYS.COTIZACIONES), defaultCots);
  }

  getCotizacionById(id: string): CotizacionEstimacion | null {
    const cots = this.getCotizaciones();
    return cots.find((c) => c.id === id) || null;
  }

  saveCotizacion(cot: CotizacionEstimacion): CotizacionEstimacion {
    const defaultCots = this.isDemoTenant() ? INITIAL_COTIZACIONES : [];
    const cots = this.getItem<CotizacionEstimacion[]>(this.getTenantKey(KEYS.COTIZACIONES), defaultCots);
    const idx = cots.findIndex((c) => c.id === cot.id);
    if (idx >= 0) {
      cots[idx] = cot;
    } else {
      cots.unshift(cot);
    }
    this.setItem(this.getTenantKey(KEYS.COTIZACIONES), cots);
    return cot;
  }

  deleteCotizacion(id: string): boolean {
    const defaultCots = this.isDemoTenant() ? INITIAL_COTIZACIONES : [];
    const cots = this.getItem<CotizacionEstimacion[]>(this.getTenantKey(KEYS.COTIZACIONES), defaultCots);
    const filtered = cots.filter((c) => c.id !== id);
    this.setItem(this.getTenantKey(KEYS.COTIZACIONES), filtered);
    return true;
  }

  getCatalogoMateriales() {
    return CATALOGO_MATERIALES_CHILE;
  }

  crearProyectoDesdeCotizacion(cotizacion: CotizacionEstimacion & Record<string, any>, clienteId?: string): Proyecto {
    const active = this.getActiveUser();
    const nombre = cotizacion.titulo_proyecto || (cotizacion as any).tituloObra || 'Obra Nueva';
    const monto =
      cotizacion.estructura_financiera?.precio_total_con_iva ||
      cotizacion.estructura_financiera?.precio_sugerido_neto ||
      (cotizacion as any).totalVentaSugerido ||
      (cotizacion as any).costoTotalEstimado ||
      0;
    const duracionDias =
      cotizacion.duracion_dias_estimada ||
      ((cotizacion as any).duracionSemanasEstimada ? (cotizacion as any).duracionSemanasEstimada * 7 : 30);

    const fechaInicio = new Date().toISOString().split('T')[0];
    const fechaFinDate = new Date();
    fechaFinDate.setDate(fechaFinDate.getDate() + duracionDias);
    const fechaTermino = fechaFinDate.toISOString().split('T')[0];

    const rawActs = cotizacion.actividades_gantt || (cotizacion as any).partidas || [];
    const acts = rawActs.map((p: any) => ({
      nombre: p.nombre,
      dias: p.dias || Math.max(3, Math.round(duracionDias / Math.max(1, rawActs.length))),
    }));

    const nuevoProyecto = this.createProyecto(
      {
        nombre,
        descripcion: `Generado a partir de cotización con IA. ${cotizacion.resumen_ejecutivo || (cotizacion as any).descripcionRequerimiento || ''}`.trim(),
        comuna: cotizacion.comuna_region || (cotizacion as any).comuna || 'Santiago',
        monto_cotizado: monto,
        fecha_inicio: fechaInicio,
        fecha_termino_estimada: fechaTermino,
        estado: 'activo',
        cliente_id: clienteId,
        empresa_id: active?.empresa_id || DEMO_EMPRESA_ID,
      },
      acts
    );

    if (cotizacion.materiales && Array.isArray(cotizacion.materiales)) {
      cotizacion.materiales.forEach((m) => {
        this.createMaterialProyecto({
          proyecto_id: nuevoProyecto.id,
          nombre: m.nombre,
          cantidad: m.cantidad,
          unidad: m.unidad,
          precio_unitario: m.precio_unitario_estimado || (m as any).precioUnitarioReferencial || 0,
          subtotal: m.subtotal || 0,
          categoria: m.categoria || 'General',
          comprado: false,
        });
      });
    }

    return nuevoProyecto;
  }

  // --- AGENDA DE VISITAS / EVENTOS ---
  getEventosAgenda(): EventoAgenda[] {
    return this.getItem<EventoAgenda[]>(this.getTenantKey(KEYS.AGENDA), []);
  }

  saveEventoAgenda(
    evento: Omit<EventoAgenda, 'id' | 'created_at'> & { id?: string; created_at?: string }
  ): EventoAgenda {
    const active = this.getActiveUser();
    const agenda = this.getEventosAgenda();
    const id = evento.id || 'evt-' + crypto.randomUUID();
    const fullEvento: EventoAgenda = {
      ...evento,
      id,
      empresa_id: evento.empresa_id || active?.empresa_id || DEMO_EMPRESA_ID,
      created_at: new Date().toISOString(),
    };

    const idx = agenda.findIndex((e) => e.id === id);
    if (idx >= 0) {
      agenda[idx] = fullEvento;
    } else {
      agenda.push(fullEvento);
    }
    this.setItem(this.getTenantKey(KEYS.AGENDA), agenda);
    if (!this.aiLocalOnly) { supabaseService.saveEventoAgenda(fullEvento).catch(() => {}); }
    return fullEvento;
  }

  deleteEventoAgenda(id: string): boolean {
    const agenda = this.getEventosAgenda();
    const filtered = agenda.filter((e) => e.id !== id);
    this.setItem(this.getTenantKey(KEYS.AGENDA), filtered);
    if (!this.aiLocalOnly) { supabaseService.deleteEventoAgenda(id).catch(() => {}); }
    return true;
  }

  toggleEventoAgenda(id: string): EventoAgenda | null {
    const agenda = this.getEventosAgenda();
    const idx = agenda.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    agenda[idx].completado = !agenda[idx].completado;
    this.setItem(this.getTenantKey(KEYS.AGENDA), agenda);
    if (!this.aiLocalOnly) { supabaseService.saveEventoAgenda(agenda[idx]).catch(() => {}); }
    return agenda[idx];
  }

  // --- MÉTODOS DE INTEGRACIÓN CON IA ---
  crearProyectoDesdeIA(datos: {
    nombre: string;
    fecha_inicio?: string;
    descripcion?: string;
    comuna?: string;
    direccion?: string;
    monto_cotizado?: number;
    monto?: number;
    dias_estimados?: number;
    dias?: number;
    partidas?: Array<{ nombre: string; dias?: number; porcentaje_avance?: number }>;
    materiales?: Array<{ nombre: string; cantidad: number; unidad?: string; precio_unitario: number; categoria?: string }>;
    trabajadores_nombres?: string[];
    cliente_id?: string;
    cliente_nombre?: string;
    cliente_telefono?: string;
    cliente_email?: string;
    cliente_rut?: string;
    imprevistos?: Array<{ descripcion: string; monto: number }>;
    bitacora?: Array<{ titulo: string; nota: string; tipo?: string }>;
  }): Proyecto {
    let finalClienteId = datos.cliente_id;
    if (!finalClienteId && datos.cliente_nombre) {
      const existente = this.buscarClientePorRutONombre(datos.cliente_nombre);
      if (existente) {
        finalClienteId = existente.id;
      } else {
        const nuevoCli = this.createCliente({
          nombre: datos.cliente_nombre,
          telefono: datos.cliente_telefono || '',
          email: datos.cliente_email || '',
          rut: datos.cliente_rut,
          comuna: datos.comuna || '',
          direccion: datos.direccion || '',
        });
        finalClienteId = nuevoCli.id;
      }
    }

    const fechaInicio = datos.fecha_inicio || new Date().toISOString().split('T')[0];
    const dias = datos.dias_estimados ?? datos.dias ?? 30;
    const fechaFinDate = new Date(fechaInicio + 'T12:00:00Z');
    fechaFinDate.setUTCDate(fechaFinDate.getUTCDate() + dias);
    const fechaTermino = fechaFinDate.toISOString().split('T')[0];
    const monto = datos.monto_cotizado ?? datos.monto ?? 0;

    const partidasFormateadas = (datos.partidas || []).map((p) => ({
      nombre: p.nombre,
      dias: Number(p.dias) || 5,
    }));

    const nuevoProyecto = this.createProyecto(
      {
        nombre: datos.nombre,
        descripcion: datos.descripcion || 'Creado automáticamente mediante copiloto de IA.',
        comuna: datos.comuna || '',
        direccion: datos.direccion || '',
        monto_cotizado: monto,
        fecha_inicio: fechaInicio,
        fecha_termino_estimada: fechaTermino,
        estado: 'activo',
        cliente_id: finalClienteId,
        empresa_id: this.getActiveUser()?.empresa_id || DEMO_EMPRESA_ID,
      },
      partidasFormateadas.length > 0 ? partidasFormateadas : undefined
    );

    // Crear materiales vinculados al proyecto
    if (Array.isArray(datos.materiales) && datos.materiales.length > 0) {
      datos.materiales.forEach((m) => {
        const cant = Number(m.cantidad) || 1;
        const pu = Number(m.precio_unitario) || 0;
        this.createMaterialProyecto({
          proyecto_id: nuevoProyecto.id,
          nombre: m.nombre || 'Material',
          cantidad: cant,
          unidad: m.unidad || 'unidad',
          precio_unitario: pu,
          subtotal: roundLine(cant, pu),
          categoria: m.categoria || 'General',
          comprado: false,
        });
      });
    }

    // Asignar cuadrilla de trabajadores a la obra
    if (Array.isArray(datos.trabajadores_nombres) && datos.trabajadores_nombres.length > 0) {
      datos.trabajadores_nombres.forEach((tNom) => {
        this.asignarTrabajadorAProyecto(tNom, nuevoProyecto.id);
      });
    }

    // Registrar imprevistos iniciales
    if (Array.isArray(datos.imprevistos) && datos.imprevistos.length > 0) {
      datos.imprevistos.forEach((imp) => {
        this.createImprevisto({
          proyecto_id: nuevoProyecto.id,
          descripcion: imp.descripcion || 'Imprevisto inicial',
          monto: Number(imp.monto) || 0,
          estado: 'pendiente',
          origen: 'whatsapp_ia',
          fecha: fechaInicio,
        });
      });
    }

    // Registrar notas de bitácora iniciales
    if (Array.isArray(datos.bitacora) && datos.bitacora.length > 0) {
      const active = this.getActiveUser();
      datos.bitacora.forEach((b) => {
        this.createBitacoraEntrada({
          proyecto_id: nuevoProyecto.id,
          usuario_id: active?.id || 'u-1',
          autor_nombre: active?.nombre || 'Inspector de Obra',
          titulo: b.titulo || 'Inicio de Faena',
          nota: b.nota || 'Apertura de obra e instalación de faena.',
          tipo: (['avance', 'incidente', 'clima', 'entrega_material'].includes(b.tipo || '')
            ? b.tipo
            : 'avance') as 'avance' | 'incidente' | 'clima' | 'entrega_material',
          fecha: fechaInicio,
        });
      });
    }

    return nuevoProyecto;
  }

  agregarTrabajadorDesdeIA(datos: {
    nombre: string;
    rol?: UserRole;
    telefono?: string;
    telefono_whatsapp?: string;
    email?: string;
    rut?: string;
  }): Usuario {
    return this.createUsuario({
      nombre: datos.nombre,
      rol: datos.rol || 'terreno',
      email: datos.email || '',
      telefono_whatsapp: datos.telefono || datos.telefono_whatsapp || '',
      rut: datos.rut || undefined,
      empresa_id: this.getActiveUser()?.empresa_id || DEMO_EMPRESA_ID,
    });
  }

  asignarTrabajadorAProyecto(trabajadorIdent: string, proyectoIdent: string): boolean {
    const proyectos = this.getProyectos();
    const proyecto = resolveEntity(proyectos, proyectoIdent);
    const usuarios = this.getUsuarios();
    const nombre = trabajadorIdent.trim().toLowerCase();
    let trabajador = usuarios.find(u => u.id === trabajadorIdent) || usuarios.find(u => u.nombre.toLowerCase() === nombre);
    if (!trabajador) {
      const candidatos = usuarios.filter(u => u.nombre.toLowerCase().includes(nombre));
      if (candidatos.length > 1) throw new Error('Indica el nombre completo del trabajador.');
      trabajador = candidatos[0];
    }

    // Si el trabajador mencionado no existe en el equipo, crearlo automáticamente
    if (!trabajador && trabajadorIdent.trim().length > 0) {
      trabajador = this.agregarTrabajadorDesdeIA({
        nombre: trabajadorIdent.trim(),
        rol: 'terreno',
      });
    }

    if (!trabajador) return false;
    const trabajadorId = trabajador.id;

    const current = proyecto.trabajadores_ids || [];
    if (current.includes(trabajadorId)) return true;
    this.updateProyecto(proyecto.id, {
      trabajadores_ids: [...current, trabajadorId],
    });
    return true;
  }

  /**
   * Motor Universal de Ejecución de Acciones de IA sobre toda la plataforma
   */
  ejecutarAccionGlobalIA(accion: any, contextProyectoId?: string): AccionAsistenteIA | null {
    if (!accion || !accion.tipo) return null;

    // Helper para resolver id de proyecto por id o por nombre
    const resolverProyecto = (ident?: string): Proyecto => resolveEntity(this.getProyectos(), ident, contextProyectoId);

    switch (accion.tipo) {
      case 'crear_proyecto':
      case 'crear_proyecto_completo': {
        const nuevo = this.crearProyectoDesdeIA(accion);
        const mats = accion.materiales || [];
        const parts = accion.partidas || [];
        const totalMats = mats.reduce(
          (s: number, m: any) => s + Number(m.cantidad || 1) * Number(m.precio_unitario || 0),
          0
        );
        return {
          tipo: 'crear_proyecto',
          titulo: `Obra Creada: ${nuevo.nombre}`,
          detalles: nuevo,
          resultado_texto: `Presupuesto: $${nuevo.monto_cotizado.toLocaleString('es-CL')} CLP • ${parts.length} partidas en Gantt • ${mats.length} materiales presupuestados ($${totalMats.toLocaleString('es-CL')}) • Comuna: ${nuevo.comuna || 'Chile'}`,
          link_destino: `/proyectos/${nuevo.id}/gantt`,
          link_texto: 'Ver Obra & Carta Gantt ➔',
        };
      }

      case 'actualizar_proyecto': {
        const proj = resolverProyecto(accion.proyecto_id || accion.proyecto_nombre || accion.nombre);
        if (!proj) return null;
        const updates: Partial<Proyecto> = {};
        if (accion.estado) updates.estado = accion.estado;
        if (accion.monto !== undefined || accion.monto_cotizado !== undefined) updates.monto_cotizado = Number(accion.monto_cotizado ?? accion.monto);
        if (accion.fecha_termino_estimada) updates.fecha_termino_estimada = accion.fecha_termino_estimada;
        if (accion.descripcion) updates.descripcion = accion.descripcion;
        const updated = this.updateProyecto(proj.id, updates);
        return {
          tipo: 'actualizar_proyecto',
          titulo: `Obra Actualizada: ${proj.nombre}`,
          detalles: updated || proj,
          resultado_texto: `Estado: ${(updated?.estado || proj.estado).toUpperCase()} • Monto: $${(updated?.monto_cotizado || proj.monto_cotizado).toLocaleString('es-CL')} CLP`,
          link_destino: `/proyectos/${proj.id}/gantt`,
          link_texto: 'Ver Obra ➔',
        };
      }

      case 'eliminar_proyecto': {
        const proj = resolverProyecto(accion.proyecto_id || accion.proyecto_nombre || accion.nombre);
        if (!proj) return null;
        this.deleteProyecto(proj.id);
        return {
          tipo: 'eliminar_proyecto',
          titulo: `Obra Eliminada`,
          detalles: { id: proj.id, nombre: proj.nombre },
          resultado_texto: `La obra "${proj.nombre}" ha sido eliminada del sistema.`,
          link_destino: `/proyectos`,
          link_texto: 'Ver Listado de Obras ➔',
        };
      }

      case 'crear_cliente': {
        const nuevoCli = this.createCliente({
          nombre: accion.nombre || 'Nuevo Cliente',
          telefono: accion.telefono || '',
          email: accion.email || '',
          rut: accion.rut,
          comuna: accion.comuna || 'Santiago',
          direccion: accion.direccion || '',
        });
        return {
          tipo: 'crear_cliente',
          titulo: `Cliente Registrado: ${nuevoCli.nombre}`,
          detalles: nuevoCli,
          resultado_texto: `Teléfono: ${nuevoCli.telefono} • Email: ${nuevoCli.email} • Comuna: ${nuevoCli.comuna}`,
          link_destino: `/clientes`,
          link_texto: 'Ver Directorio de Clientes ➔',
        };
      }

      case 'actualizar_cliente': {
        const clis = this.getClientes();
        const cli = resolveEntity(clis, accion.cliente_id || accion.nombre);
        const updated = this.updateCliente(cli.id, {
          telefono: accion.telefono ?? cli.telefono,
          email: accion.email ?? cli.email,
          comuna: accion.comuna ?? cli.comuna,
          direccion: accion.direccion ?? cli.direccion,
        });
        return {
          tipo: 'actualizar_cliente',
          titulo: `Cliente Actualizado: ${cli.nombre}`,
          detalles: updated || cli,
          resultado_texto: `Contacto actualizado: ${updated?.telefono || cli.telefono}`,
          link_destino: `/clientes`,
          link_texto: 'Ver Clientes ➔',
        };
      }

      case 'agregar_trabajador':
      case 'agregar_trabajadores': {
        const lista = Array.isArray(accion.trabajadores)
          ? accion.trabajadores
          : [
              {
                nombre: accion.nombre || 'Nuevo Trabajador',
                rol: accion.rol || 'terreno',
                telefono: accion.telefono || accion.telefono_whatsapp,
                email: accion.email,
                rut: accion.rut,
              },
            ];

        const creados: any[] = [];
        lista.forEach((t: any) => {
          if (!t.nombre) return;
          const u = this.agregarTrabajadorDesdeIA({
            nombre: t.nombre,
            rol: t.rol || 'terreno',
            telefono: t.telefono || t.telefono_whatsapp,
            email: t.email,
            rut: t.rut,
          });
          creados.push(u);
        });

        return {
          tipo: 'agregar_trabajador',
          titulo: `${creados.length} Trabajador(es) Incorporado(s): ${creados.map((u) => u.nombre).join(', ')}`,
          detalles: { trabajadores: creados },
          resultado_texto: `${creados.map((u) => `${u.nombre} (${(u.rol || 'faena').toUpperCase()})`).join(', ')} incorporados al equipo.`,
          link_destino: `/equipo`,
          link_texto: 'Ver Equipo ➔',
        };
      }

      case 'asignar_trabajador':
      case 'asignar_trabajadores': {
        const proj = resolverProyecto(accion.proyecto_id || accion.proyecto_nombre);
        const nombres: string[] = Array.isArray(accion.trabajadores_nombres)
          ? accion.trabajadores_nombres
          : Array.isArray(accion.trabajadores)
          ? accion.trabajadores.map((t: any) => (typeof t === 'string' ? t : t.nombre))
          : accion.trabajador_nombre
          ? [accion.trabajador_nombre]
          : [];

        let asignadosCount = 0;
        if (proj) {
          nombres.forEach((nombre) => {
            if (this.asignarTrabajadorAProyecto(nombre, proj.id)) {
              asignadosCount++;
            }
          });
        }

        return {
          tipo: 'asignar_trabajador',
          titulo: `${nombres.length} Miembro(s) de Cuadrilla Asignado(s)`,
          detalles: { nombres, proyecto: proj?.nombre },
          resultado_texto: proj
            ? `${nombres.join(', ')} fueron incorporados a la faena "${proj.nombre}".`
            : `Trabajadores coordinados en el equipo.`,
          link_destino: proj ? `/proyectos/${proj.id}/gantt` : `/equipo`,
          link_texto: 'Ver Faena ➔',
        };
      }

      case 'desasignar_trabajador': {
        const proj = resolverProyecto(accion.proyecto_id || accion.proyecto_nombre);
        if (proj) {
          const usuarios = this.getUsuarios();
          const u = usuarios.find(
            (user) =>
              user.id === accion.trabajador_nombre ||
              user.nombre.toLowerCase().includes((accion.trabajador_nombre || '').toLowerCase())
          );
          if (u) {
            const filtered = (proj.trabajadores_ids || []).filter((id) => id !== u.id);
            this.updateProyecto(proj.id, { trabajadores_ids: filtered });
          }
        }
        return {
          tipo: 'desasignar_trabajador',
          titulo: `Trabajador Desasignado`,
          detalles: accion,
          resultado_texto: `${accion.trabajador_nombre} fue retirado de la cuadrilla de la obra.`,
          link_destino: `/equipo`,
          link_texto: 'Ver Equipo ➔',
        };
      }

      case 'crear_actividad': {
        const proj = resolverProyecto(accion.proyecto_id || accion.proyecto_nombre);
        if (!proj) return null;

        const listaPartidas = Array.isArray(accion.partidas)
          ? accion.partidas
          : Array.isArray(accion.actividades)
          ? accion.actividades
          : [{ nombre: accion.nombre || 'Nueva Partida', dias: Number(accion.dias) || 5 }];

        const acts = this.getActividades(proj.id);
        let lastEndDate = new Date();
        const lastAct = acts[acts.length - 1];
        if (lastAct && lastAct.fecha_termino) {
          lastEndDate = new Date(lastAct.fecha_termino);
        }

        const creadas: Actividad[] = [];
        listaPartidas.forEach((p: any, idx: number) => {
          const dias = Number(p.dias) || 5;
          const start = new Date(lastEndDate);
          const end = new Date(start);
          end.setDate(end.getDate() + dias);
          lastEndDate = new Date(end);

          const nueva = this.createActividad({
            proyecto_id: proj.id,
            nombre: p.nombre || `Partida ${acts.length + idx + 1}`,
            fecha_inicio: start.toISOString().split('T')[0],
            fecha_termino: end.toISOString().split('T')[0],
            porcentaje_avance: Number(p.porcentaje_avance) || 0,
            estado: 'pendiente',
            orden: acts.length + idx + 1,
          });
          creadas.push(nueva);
        });

        return {
          tipo: 'crear_actividad',
          titulo: `${creadas.length} Partida(s) Creada(s): ${creadas.map((c) => c.nombre).join(', ')}`,
          detalles: { partidas: creadas },
          resultado_texto: `Se agregaron ${creadas.length} partidas a la Carta Gantt de "${proj.nombre}".`,
          link_destino: `/proyectos/${proj.id}/gantt`,
          link_texto: 'Ver en Carta Gantt ➔',
        };
      }

      case 'actualizar_avance': {
        const proj = resolverProyecto(accion.proyecto_id || accion.proyecto_nombre);
        if (!proj) return null;
        const acts = this.getActividades(proj.id);
        const match = resolveEntity(acts, accion.actividad_id || accion.nombre);
        if (match) {
          const avance = Math.min(100, Math.max(0, Number(accion.porcentaje_avance) || 0));
          const estado = avance === 100 ? 'terminada' : avance > 0 ? 'en_curso' : 'pendiente';
          const updated = this.updateActividad(match.id, { porcentaje_avance: avance, estado });
          return {
            tipo: 'actualizar_avance',
            titulo: `Avance Actualizado`,
            detalles: updated || match,
            resultado_texto: `Partida "${match.nombre}" actualizada al ${avance}% (${estado}).`,
            link_destino: `/proyectos/${proj.id}/gantt`,
            link_texto: 'Ver Carta Gantt ➔',
          };
        }
        return null;
      }

      case 'agregar_material':
      case 'agregar_materiales': {
        const proj = resolverProyecto(accion.proyecto_id || accion.proyecto_nombre);
        if (!proj) return null;

        const lista = Array.isArray(accion.materiales)
          ? accion.materiales
          : [
              {
                nombre: accion.nombre || 'Material de faena',
                cantidad: Number(accion.cantidad) || 1,
                unidad: accion.unidad || 'unidad',
                precio_unitario: Number(accion.precio_unitario) || 0,
                categoria: accion.categoria || 'General',
              },
            ];

        let totalGasto = 0;
        lista.forEach((m: any) => {
          const cant = Number(m.cantidad) || 1;
          const pu = Number(m.precio_unitario) || 0;
          totalGasto += cant * pu;
          this.createMaterialProyecto({
            proyecto_id: proj.id,
            nombre: m.nombre || 'Material',
            cantidad: cant,
            unidad: m.unidad || 'unidad',
            precio_unitario: pu,
            subtotal: roundLine(cant, pu),
            categoria: m.categoria || 'General',
            comprado: false,
          });
        });

        return {
          tipo: 'agregar_material',
          titulo: `${lista.length} Material(es) Presupuestado(s)`,
          detalles: { materiales: lista, total: totalGasto },
          resultado_texto: `${lista.map((m: any) => `${m.nombre} (${m.cantidad} ${m.unidad || 'u'})`).join(', ')} • Total: $${totalGasto.toLocaleString('es-CL')} CLP`,
          link_destino: `/proyectos/${proj.id}/finanzas`,
          link_texto: 'Ver Finanzas y materiales ➔',
        };
      }

      case 'registrar_imprevisto': {
        const proj = resolverProyecto(accion.proyecto_id || accion.proyecto_nombre);
        if (!proj) return null;
        const monto = Number(accion.monto) || 0;
        const imp = this.createImprevisto({
          proyecto_id: proj.id,
          descripcion: accion.descripcion || 'Imprevisto detectado en faena',
          monto,
          estado: 'pendiente',
          origen: 'whatsapp_ia',
          fecha: new Date().toISOString().split('T')[0],
        });
        return {
          tipo: 'registrar_imprevisto',
          titulo: `Imprevisto Registrado`,
          detalles: imp,
          resultado_texto: `"${imp.descripcion}" • Monto: $${monto.toLocaleString('es-CL')} CLP`,
          link_destino: `/proyectos/${proj.id}/finanzas`,
          link_texto: 'Ver Finanzas ➔',
        };
      }

      case 'registrar_pago': {
        const proj = resolverProyecto(accion.proyecto_id || accion.proyecto_nombre);
        if (!proj) return null;
        const monto = Number(accion.monto) || 0;
        const pago = this.createPago({
          proyecto_id: proj.id,
          monto,
          fecha: accion.fecha || new Date().toISOString().split('T')[0],
          nota: accion.nota || '',
          metodo: (['transferencia', 'efectivo', 'debito'].includes(accion.metodo || '')
            ? accion.metodo
            : 'transferencia') as PaymentMethod,
          estado: 'completado',
          comprobante_url: '',
        });
        return {
          tipo: 'registrar_pago',
          titulo: `Abono/Pago Recibido`,
          detalles: pago,
          resultado_texto: `Monto recibido: $${monto.toLocaleString('es-CL')} CLP para la obra "${proj.nombre}".`,
          link_destino: `/proyectos/${proj.id}/finanzas`,
          link_texto: 'Ver Finanzas ➔',
        };
      }

      case 'crear_bitacora': {
        const proj = resolverProyecto(accion.proyecto_id || accion.proyecto_nombre);
        if (!proj) return null;
        const active = this.getActiveUser();
        const bit = this.createBitacoraEntrada({
          proyecto_id: proj.id,
          usuario_id: active?.id || 'u-1',
          autor_nombre: active?.nombre || 'Inspector de Obra',
          titulo: accion.titulo || 'Registro de terreno',
          nota: accion.nota || accion.descripcion || 'Sin observaciones.',
          foto_url: accion.foto_url || undefined,
          tipo: (['avance', 'incidente', 'clima', 'entrega_material'].includes(accion.subtipo || accion.tipo_bitacora || '')
            ? (accion.subtipo || accion.tipo_bitacora)
            : 'avance') as 'avance' | 'incidente' | 'clima' | 'entrega_material',
          fecha: new Date().toISOString().split('T')[0],
        });
        return {
          tipo: 'crear_bitacora',
          titulo: `Entrada en Bitácora Guardada`,
          detalles: bit,
          resultado_texto: `"${bit.titulo}": ${bit.nota.slice(0, 80)}...`,
          link_destino: `/proyectos/${proj.id}/gantt`,
          link_texto: 'Ver Bitácora ➔',
        };
      }

      case 'generar_reporte': {
        const proj = resolverProyecto(accion.proyecto_id || accion.proyecto_nombre);
        const rep = this.createReporte({
          proyecto_id: proj?.id,
          mensaje_original: accion.resumen || accion.contenido || `Reporte de Avance para ${proj?.nombre || 'General'}`,
          transcripcion: accion.titulo || `Informe de Avance: ${proj?.nombre || 'Faena'}`,
          extraccion_ia: {
            actividad_detectada: accion.actividad || 'Seguimiento general',
            avance_porcentaje: proj?.porcentaje_avance_ponderado ?? 50,
            tiene_imprevisto: false,
          },
          estado: 'aprobado',
          fecha: new Date().toISOString().split('T')[0],
        });
        return {
          tipo: 'generar_reporte',
          titulo: `Reporte Generado: ${proj?.nombre || 'Obra'}`,
          detalles: rep,
          resultado_texto: `Reporte oficial generado para "${proj?.nombre || 'General'}". Disponible en la sección de Reportes.`,
          link_destino: `/reportes`,
          link_texto: 'Ver Reportes ➔',
        };
      }

      case 'agendar_visita':
      case 'agendar_evento': {
        const nuevoEvt = this.saveEventoAgenda({
          titulo: accion.titulo || 'Visita a Terreno',
          tipo: accion.tipo_evento || 'visita_terreno',
          fecha: accion.fecha || new Date(Date.now() + 86400000).toISOString().split('T')[0],
          hora: accion.hora || '10:00',
          comuna_lugar: accion.comuna_lugar || 'Santiago, Chile',
          descripcion: accion.descripcion || 'Visita de inspección coordinada por IA.',
          cliente_nombre: accion.cliente_nombre || '',
          proyecto_id: accion.proyecto_id,
          completado: false,
          origen: 'asistente_ia',
        });
        return {
          tipo: 'agendar_visita',
          titulo: `Compromiso Agendado: ${nuevoEvt.titulo}`,
          detalles: nuevoEvt,
          resultado_texto: `Fecha: ${nuevoEvt.fecha} a las ${nuevoEvt.hora} hrs • ${nuevoEvt.comuna_lugar}`,
        };
      }

      case 'generar_mensaje_whatsapp': {
        const tel = (accion.telefono || '').replace(/[^0-9]/g, '');
        const waLink = tel
          ? `https://wa.me/${tel}?text=${encodeURIComponent(accion.mensaje || '')}`
          : undefined;
        return {
          tipo: 'generar_mensaje_whatsapp',
          titulo: `Mensaje de WhatsApp Preparado`,
          detalles: accion,
          resultado_texto: `Mensaje: "${(accion.mensaje || '').slice(0, 100)}..."`,
          enlace_whatsapp: waLink,
          link_texto: waLink ? 'Enviar por WhatsApp Ahora ➔' : undefined,
        };
      }

      case 'crear_solicitud_cambio': {
        const proj = resolverProyecto(accion.proyecto_id || accion.proyecto_nombre);
        if (!proj) return null;
        const mats = Array.isArray(accion.materiales)
          ? accion.materiales.map((m: any) => ({
              nombre: m.nombre || 'Material',
              cantidad: Number(m.cantidad) || 1,
              unidad: m.unidad || 'unidad',
              precio_unitario: Number(m.precio_unitario) || 0,
              subtotal: (Number(m.cantidad) || 1) * (Number(m.precio_unitario) || 0),
            }))
          : [];
        const rc = this.createReclamoCambio({
          proyecto_id: proj.id,
          tipo: (['solicitud_cambio', 'reclamo', 'incidente', 'accidente'].includes(accion.subtipo || '')
            ? accion.subtipo
            : 'solicitud_cambio') as any,
          prioridad: (['baja', 'media', 'alta', 'critica'].includes(accion.prioridad || '')
            ? accion.prioridad
            : 'media') as any,
          estado: 'pendiente',
          titulo: accion.titulo || 'Solicitud de cambio registrada por IA',
          descripcion: accion.descripcion || accion.nota || 'Requerimiento registrado por Copiloto IA',
          solicitado_por: accion.solicitado_por || 'Mandante / Terreno',
          impacto_monto: Number(accion.monto || accion.impacto_monto) || 0,
          impacto_dias: Number(accion.dias || accion.impacto_dias) || 0,
          materiales_requeridos: mats,
          origen: 'web',
          fecha: new Date().toISOString().split('T')[0],
        });
        return {
          tipo: 'crear_solicitud_cambio',
          titulo: `Registrado en Reclamos & Cambios: ${rc.titulo}`,
          detalles: rc,
          resultado_texto: `Tipo: ${rc.tipo} • Impacto: $${rc.impacto_monto.toLocaleString('es-CL')} CLP (${mats.length} materiales propuestos).`,
          link_destino: `/proyectos/${proj.id}/cambios`,
          link_texto: 'Ver Reclamos & Cambios ➔',
        };
      }

      case 'registrar_asistencia': {
        const proj = resolverProyecto(accion.proyecto_id || accion.proyecto_nombre);
        if (!proj) return null;
        const fecha = accion.fecha || new Date().toISOString().split('T')[0];
        if (accion.todos_presentes) {
          const regs = this.marcarCuadrillaPresente(
            proj.id,
            fecha,
            accion.hora_entrada || '08:00',
            accion.hora_salida || '18:00'
          );
          return {
            tipo: 'registrar_asistencia',
            titulo: `Asistencia de Cuadrilla Registrada (${regs.length})`,
            detalles: { registros: regs },
            resultado_texto: `${regs.length} trabajadores marcados presentes en "${proj.nombre}" (${fecha}).`,
            link_destino: `/proyectos/${proj.id}/asistencia`,
            link_texto: 'Ver Asistencia ➔',
          };
        }
        const reg = this.upsertAsistenciaObrero({
          proyecto_id: proj.id,
          trabajador_nombre: accion.trabajador_nombre || accion.nombre || 'Trabajador de Obra',
          trabajador_rol: accion.rol || 'terreno',
          fecha,
          estado: (['presente', 'atraso', 'ausente', 'licencia', 'permiso'].includes(accion.estado || '')
            ? accion.estado
            : 'presente') as EstadoAsistencia,
          hora_entrada: accion.hora_entrada || '08:00',
          hora_salida: accion.hora_salida || '18:00',
          observacion: accion.observacion || '',
          origen: 'web',
        });
        return {
          tipo: 'registrar_asistencia',
          titulo: `Asistencia Registrada: ${reg.trabajador_nombre}`,
          detalles: reg,
          resultado_texto: `${reg.trabajador_nombre} marcado como ${reg.estado.toUpperCase()} en "${proj.nombre}" (${fecha}).`,
          link_destino: `/proyectos/${proj.id}/asistencia`,
          link_texto: 'Ver Asistencia ➔',
        };
      }

      case 'registrar_documento': {
        const proj = resolverProyecto(accion.proyecto_id || accion.proyecto_nombre);
        if (!proj) return null;
        const doc = this.createDocumentoObra({
          proyecto_id: proj.id,
          categoria: (['contrato', 'plano', 'factura_boleta', 'correo', 'permiso_normativa', 'otro'].includes(
            accion.categoria || ''
          )
            ? accion.categoria
            : 'otro') as CategoriaDocumentoObra,
          nombre: accion.nombre || accion.titulo || 'Documento registrado por IA',
          descripcion: accion.descripcion || '',
          numero_documento: accion.numero_documento || '',
          proveedor_entidad: accion.proveedor || '',
          monto_documento: accion.monto ? Number(accion.monto) : undefined,
          correo_remitente: accion.correo_remitente || '',
          correo_destinatario: accion.correo_destinatario || '',
          correo_asunto: accion.correo_asunto || '',
          correo_cuerpo: accion.correo_cuerpo || '',
          fecha_documento: accion.fecha || new Date().toISOString().split('T')[0],
        });
        return {
          tipo: 'registrar_documento',
          titulo: `Documento Registrado: ${doc.nombre}`,
          detalles: doc,
          resultado_texto: `Categoría: ${doc.categoria.toUpperCase()} en "${proj.nombre}".`,
          link_destino: `/proyectos/${proj.id}/documentos`,
          link_texto: 'Ver Repositorio Documental ➔',
        };
      }

      case 'lote_acciones': {
        const lista = Array.isArray(accion.acciones) ? accion.acciones : [];
        const resultados: AccionAsistenteIA[] = [];
        for (const sub of lista) {
          const res = this.ejecutarAccionGlobalIA(sub, contextProyectoId);
          if (!res) throw new Error('No se pudo ejecutar una acción del lote.');
          if (res) {
            if (res.tipo === 'lote_acciones' && res.detalles?.acciones) {
              resultados.push(...res.detalles.acciones);
            } else {
              resultados.push(res);
            }
          }
        }
        return {
          tipo: 'lote_acciones',
          titulo: `¡${resultados.length} Acciones Ejecutadas de una Sola Vez!`,
          detalles: { acciones: resultados },
          resultado_texto: resultados.map((r, i) => `${i + 1}. ${r.titulo}: ${r.resultado_texto}`).join(' • '),
          link_destino: resultados[0]?.link_destino || '/proyectos',
          link_texto: 'Ver Cambios en la Plataforma ➔',
        };
      }

      default:
        return null;
    }
  }

  // --- CHAT DE AGENTE POR PROYECTO (HISTORIAL PERSISTENTE) ---
  getProyectoChatHistorial(proyectoId: string): MensajeChatProyecto[] {
    const key = this.getTenantKey(`${KEYS.CHAT_PROYECTOS}_${proyectoId}`);
    return this.getItem<MensajeChatProyecto[]>(key, []);
  }

  saveProyectoMensajeChat(
    mensaje: Omit<MensajeChatProyecto, 'id' | 'created_at'> & { id?: string; created_at?: string }
  ): MensajeChatProyecto {
    const key = this.getTenantKey(`${KEYS.CHAT_PROYECTOS}_${mensaje.proyecto_id}`);
    const historial = this.getItem<MensajeChatProyecto[]>(key, []);
    const fullMsg: MensajeChatProyecto = {
      ...mensaje,
      id: mensaje.id || 'msg-p-' + Date.now(),
      created_at: mensaje.created_at || new Date().toISOString(),
    };
    historial.push(fullMsg);
    this.setItem(key, historial);

    // Sincronizar en segundo plano con Supabase
    if (!this.aiLocalOnly) { supabaseService.saveProyectoMensajeChat(fullMsg).catch((err) =>
      console.warn('Sync chat proyecto en Supabase:', err)
    ); }

    return fullMsg;
  }

  clearProyectoChatHistorial(proyectoId: string): void {
    const key = this.getTenantKey(`${KEYS.CHAT_PROYECTOS}_${proyectoId}`);
    this.setItem(key, []);
    if (!this.aiLocalOnly) { supabaseService.clearProyectoChatHistorial(proyectoId).catch((err) =>
      console.warn('Clear chat proyecto en Supabase:', err)
    ); }
  }

  async loadProyectoChatFromSupabase(proyectoId: string): Promise<MensajeChatProyecto[]> {
    try {
      const active = this.getActiveUser();
      const msgs = await supabaseService.getProyectoChatHistorial(proyectoId, active?.empresa_id);
      if (msgs && msgs.length > 0) {
        const key = this.getTenantKey(`${KEYS.CHAT_PROYECTOS}_${proyectoId}`);
        this.setItem(key, msgs);
        return msgs;
      }
    } catch (e) {
      console.warn('Error cargando chat de proyecto desde Supabase:', e);
    }
    return this.getProyectoChatHistorial(proyectoId);
  }

  ejecutarAccionAgenteProyecto(proyectoId: string, accion: any): { exito: boolean; mensaje: string; datos?: any } {
    const res = this.ejecutarAccionGlobalIA(accion, proyectoId);
    if (res) {
      return {
        exito: true,
        mensaje: res.resultado_texto,
        datos: res.detalles,
      };
    }
    return { exito: false, mensaje: 'No se pudo ejecutar la acción solicitada.' };
  }

  // --- SINCRONIZACIÓN Y CARGA DESDE SUPABASE ---
  async loadTenantDataFromSupabase(empresaId?: string): Promise<{ success: boolean; message: string }> {
    if(empresaId && empresaId!==this.getActiveUser()?.empresa_id) return {success:false,message:'La empresa no corresponde a tu sesión.'};
    return this.pullFromCloudServer();
  }

  private cloudSyncTimeout: ReturnType<typeof setTimeout> | null = null;

  public scheduleCloudSync(): void {
    if (!this.isBrowser() || this.aiLocalOnly) return;
    if (this.cloudSyncTimeout) {
      clearTimeout(this.cloudSyncTimeout);
    }
    this.cloudSyncTimeout = setTimeout(() => {
      this.pushToCloudServer().catch((err) => console.warn('Auto Cloud Sync:', err));
    }, 900);
  }

  async pushToCloudServer(): Promise<{ success: boolean; message: string }> {
    if (!this.isBrowser()) return { success: false, message: 'No browser' };
    try {
      const active = this.getActiveUser();
      const empresaId = active?.empresa_id || DEMO_EMPRESA_ID;

      if(!active?.empresa_id) return {success:false,message:'Inicia sesión para sincronizar.'};
      const pending=this.getItem<Record<string,Record<string,any>>>(this.dirtyKey(),{});
      const captured=JSON.parse(JSON.stringify(pending));
      const cambios=Object.fromEntries(Object.entries(captured).map(([key,rows])=>[key,Object.values(rows as object)]).filter(([,rows])=>(rows as any[]).length));
      if(!Object.keys(cambios).length) return {success:true,message:'No hay cambios pendientes.'};
      const {data,error}=await supabase.auth.getSession();
      if(error||!data.session?.access_token) return {success:false,message:'Inicia sesión para sincronizar.'};
      const res = await fetch('/api/supabase/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',Authorization:`Bearer ${data.session.access_token}` },
        body: JSON.stringify({cambios}),
      });

      if (!res.ok) {
        return { success: false, message: 'Error enviando sincronización a Supabase.' };
      }
      const remaining=this.getItem<Record<string,Record<string,any>>>(this.dirtyKey(),{});
      for(const [key,rows] of Object.entries(captured) as [string,Record<string,any>][]) for(const [id,row] of Object.entries(rows)) {
        if(JSON.stringify(remaining[key]?.[id])===JSON.stringify(row)) delete remaining[key][id];
      }
      localStorage.setItem(this.dirtyKey(),JSON.stringify(remaining));
      return { success: true, message: 'Sincronizado en vivo con Supabase Cloud.' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Error de red con Supabase.' };
    }
  }

  /**
   * Carga datos actuales sin reenviar la caché. Conserva únicamente las filas con ediciones pendientes.
   */
  async pullFromCloudServer(): Promise<{ success: boolean; message: string; updated?: boolean }> {
    if (!this.isBrowser()) return { success: false, message: 'No browser' };
    try {
      const active = this.getActiveUser();
      const empresaId = active?.empresa_id || DEMO_EMPRESA_ID;

      const {data,error}=await supabase.auth.getSession();
      if(error||!data.session?.access_token) return {success:false,message:'Inicia sesión para sincronizar.'};
      const res = await fetch(`/api/supabase/sync?empresaId=${encodeURIComponent(empresaId)}`, {
        cache: 'no-store',
        headers:{Authorization:`Bearer ${data.session.access_token}`},
      });
      if (!res.ok) {
        return { success: false, message: 'No se pudo consultar Supabase.' };
      }

      const cloud = await res.json();
      const localProjs = this.getProyectos();

      const pending=this.getItem<Record<string,Record<string,any>>>(this.dirtyKey(),{});
      const mergeById = <T extends {id:string}>(localArr:T[],cloudArr:T[],name:string):T[] => {
        const table=pending[name];
        const rows=new Map(cloudArr.map(row=>[row.id,row]));
        for(const row of localArr) if(table?.[row.id]) rows.set(row.id,row);
        return Array.from(rows.values());
      };

      this.isPullingCloud = true;
      try {
        if (['gratis','pro','pro_ia'].includes(cloud.plan_id)) this.setItem(this.getTenantKey(KEYS.PLAN),cloud.plan_id);
        if (Array.isArray(cloud.agenda)) this.setItem(this.getTenantKey(KEYS.AGENDA),cloud.agenda);
        if (Array.isArray(cloud.proyectos)) {
          this.setItem(this.getTenantKey(KEYS.PROYECTOS), mergeById(localProjs, cloud.proyectos, 'proyectos'));
        }
        if (Array.isArray(cloud.clientes)) {
          this.setItem(this.getTenantKey(KEYS.CLIENTES), mergeById(this.getClientes(), cloud.clientes, 'clientes'));
        }
        if (Array.isArray(cloud.usuarios)) {
          this.setItem(this.getTenantKey(KEYS.USUARIOS), mergeById(this.getUsuarios(), cloud.usuarios, 'usuarios'));
        }
        if (Array.isArray(cloud.actividades)) {
          this.setItem(this.getTenantKey(KEYS.ACTIVIDADES), mergeById(this.getActividades(), cloud.actividades, 'actividades'));
        }
        if (Array.isArray(cloud.pagos)) {
          this.setItem(this.getTenantKey(KEYS.PAGOS), mergeById(this.getPagos(), cloud.pagos, 'pagos'));
        }
        if (Array.isArray(cloud.materiales)) {
          this.setItem(
            this.getTenantKey(KEYS.MATERIALES_PROYECTO),
            mergeById(this.getMaterialesProyecto(), cloud.materiales, 'materiales')
          );
        }
        if (Array.isArray(cloud.bitacora)) {
          this.setItem(this.getTenantKey(KEYS.BITACORA), mergeById(this.getBitacora(), cloud.bitacora, 'bitacora'));
        }
        if (Array.isArray(cloud.imprevistos)) {
          this.setItem(this.getTenantKey(KEYS.IMPREVISTOS), mergeById(this.getImprevistos(), cloud.imprevistos, 'imprevistos'));
        }
        if (Array.isArray(cloud.reclamos_cambios)) {
          this.setItem(
            this.getTenantKey(KEYS.RECLAMOS_CAMBIOS),
            mergeById(this.getReclamosCambios(), cloud.reclamos_cambios, 'reclamos_cambios')
          );
        }
        if (Array.isArray(cloud.documentos)) {
          this.setItem(
            this.getTenantKey(KEYS.DOCUMENTOS_OBRA),
            mergeById(this.getDocumentosObra(), cloud.documentos, 'documentos')
          );
        }
        if (Array.isArray(cloud.asistencias)) {
          this.setItem(
            this.getTenantKey(KEYS.ASISTENCIAS_OBRA),
            mergeById(this.getAsistencias(), cloud.asistencias, 'asistencias')
          );
        }
        if (Array.isArray(cloud.reportes_whatsapp)) {
          this.setItem(
            this.getTenantKey(KEYS.REPORTES),
            mergeById(this.getReportes(), cloud.reportes_whatsapp, 'reportes_whatsapp')
          );
        }
      } finally {
        this.isPullingCloud = false;
      }

      if (['gratis','pro','pro_ia'].includes(cloud.plan_id)) window.dispatchEvent(new CustomEvent('obratrack_plan_changed',{detail:cloud.plan_id}));
      window.dispatchEvent(new Event('obratrack_cloud_synced'));
      return { success: true, message: 'Datos actualizados desde Supabase Cloud.', updated: true };
    } catch (err: any) {
      return { success: false, message: err.message || 'Error consultando Supabase.' };
    }
  }

  async syncWithSupabase(): Promise<{ success: boolean; count?: number; message: string }> {
    const res = await this.pushToCloudServer();
    return {
      success: res.success,
      count: this.getProyectos().length,
      message: res.message,
    };
  }

  async pullFromSupabase(): Promise<{ success: boolean; message: string }> {
    return this.pullFromCloudServer();
  }

}

export const dataService = new DataService();
