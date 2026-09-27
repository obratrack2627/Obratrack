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
import { isDeveloperUser, isDeveloperEmail } from './auth-utils';

// Claves base de almacenamiento local para persistencia
const KEYS = {
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
};

const DEMO_EMPRESA_ID = 'e1111111-1111-4111-a111-111111111111';

class DataService {
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
    if (!this.isBrowser()) return defaultValue;
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  private setItem<T>(key: string, value: T): void {
    if (!this.isBrowser()) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
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
      id: 'u-' + Date.now(),
      empresa_id: usuario.empresa_id || active?.empresa_id || DEMO_EMPRESA_ID,
      created_at: new Date().toISOString(),
    };
    usuarios.push(newUsuario);
    this.setItem(this.getTenantKey(KEYS.USUARIOS), usuarios);
    supabaseService.saveUsuario(newUsuario).catch((err) => console.warn('Sync supabase usuario:', err));
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
    supabaseService.saveUsuario(usuarios[index]).catch((err) => console.warn('Sync supabase usuario:', err));

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
    supabaseService.deleteUsuario(id).catch((err) => console.warn('Delete supabase usuario:', err));
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

  setActiveUserRole(rol: UserRole): Usuario {
    const usuarios = this.getUsuarios();
    const current = this.getActiveUser();
    const user = { ...(current || usuarios[0]), rol };
    this.setActiveUser(user);
    return user;
  }

  // --- PLANES DE SUSCRIPCIÓN (MODO DESARROLLADOR VS USUARIO REGULAR) ---
  getActivePlan(): SubscriptionPlanId {
    const active = this.getActiveUser();
    const isDev = isDeveloperUser(active);
    const defaultPlan: SubscriptionPlanId = isDev ? 'pro_ia' : 'gratis';
    const plan = this.getItem<SubscriptionPlanId>(this.getTenantKey(KEYS.PLAN), defaultPlan);
    return isDev ? plan : (plan === 'pro_ia' || plan === 'pro' ? plan : 'gratis');
  }

  setActivePlan(plan: SubscriptionPlanId): SubscriptionPlanId {
    const active = this.getActiveUser();
    // Solo desarrolladores tienen la facultad de cambiar de plan a voluntad
    if (!isDeveloperUser(active)) {
      console.warn('Solo los desarrolladores autorizados pueden alternar planes de suscripción.');
      return this.getActivePlan();
    }

    this.setItem(this.getTenantKey(KEYS.PLAN), plan);
    if (active?.empresa_id) {
      supabaseService.updateEmpresaPlan(active.empresa_id, plan).catch(() => {});
    }
    if (this.isBrowser()) {
      window.dispatchEvent(new CustomEvent('obratrack_plan_changed', { detail: plan }));
    }
    return plan;
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
      id: 'c-' + Date.now(),
      empresa_id: cliente.empresa_id || active?.empresa_id || DEMO_EMPRESA_ID,
      created_at: new Date().toISOString(),
    };
    clientes.push(newCliente);
    this.setItem(this.getTenantKey(KEYS.CLIENTES), clientes);
    supabaseService.saveCliente(newCliente).catch((err) => console.warn('Sync supabase cliente:', err));
    return newCliente;
  }

  updateCliente(id: string, data: Partial<Cliente>): Cliente | null {
    const clientes = this.getClientes();
    const index = clientes.findIndex((c) => c.id === id);
    if (index === -1) return null;
    clientes[index] = { ...clientes[index], ...data };
    this.setItem(this.getTenantKey(KEYS.CLIENTES), clientes);
    supabaseService.saveCliente(clientes[index]).catch((err) => console.warn('Sync supabase cliente:', err));
    return clientes[index];
  }

  deleteCliente(id: string): boolean {
    const clientes = this.getClientes();
    const filtered = clientes.filter((c) => c.id !== id);
    this.setItem(this.getTenantKey(KEYS.CLIENTES), filtered);
    supabaseService.deleteCliente(id).catch((err) => console.warn('Delete supabase cliente:', err));
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
    const isDev = isDeveloperUser(activeUser);
    const plan = this.getActivePlan();

    // Verificación de límite del Plan Gratis (máx 1 obra activa)
    if (plan === 'gratis' && !isDev) {
      const activeProjects = this.getProyectos().filter((p) => p.estado === 'activo');
      if (activeProjects.length >= 1) {
        throw new Error(
          'Límite del Plan Gratis alcanzado: solo puedes mantener 1 obra activa simultáneamente. Actualiza a Plan Pro para gestionar obras ilimitadas.'
        );
      }
    }

    const defaultProjs = this.isDemoTenant() ? INITIAL_PROYECTOS : [];
    const proyectos = this.getItem<Proyecto[]>(this.getTenantKey(KEYS.PROYECTOS), defaultProjs);
    const newProjId = 'p-' + Date.now();
    const newProyecto: Proyecto = {
      ...data,
      id: newProjId,
      empresa_id: data.empresa_id || activeUser?.empresa_id || DEMO_EMPRESA_ID,
      created_at: new Date().toISOString(),
    };
    proyectos.unshift(newProyecto);
    this.setItem(this.getTenantKey(KEYS.PROYECTOS), proyectos);

    supabaseService.saveProyecto(newProyecto).catch((err) => console.warn('Sync supabase proyecto:', err));

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

    supabaseService.deleteProyecto(id).catch((err) => console.warn('Delete supabase proyecto:', err));
    return true;
  }

  updateProyecto(id: string, data: Partial<Proyecto>): Proyecto | null {
    const defaultProjs = this.isDemoTenant() ? INITIAL_PROYECTOS : [];
    const proyectos = this.getItem<Proyecto[]>(this.getTenantKey(KEYS.PROYECTOS), defaultProjs);
    const index = proyectos.findIndex((p) => p.id === id);
    if (index === -1) return null;

    proyectos[index] = { ...proyectos[index], ...data };
    this.setItem(this.getTenantKey(KEYS.PROYECTOS), proyectos);
    supabaseService.saveProyecto(proyectos[index]).catch((err) => console.warn('Update supabase proyecto:', err));
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
      id: 'mat-' + Date.now(),
      created_at: new Date().toISOString(),
    };
    all.push(newMat);
    this.setItem(this.getTenantKey(KEYS.MATERIALES_PROYECTO), all);
    supabaseService.saveMaterial(newMat).catch((err) => console.warn('Sync supabase material:', err));
    return newMat;
  }

  deleteMaterialProyecto(id: string): boolean {
    const all = this.getItem<MaterialProyecto[]>(this.getTenantKey(KEYS.MATERIALES_PROYECTO), []);
    this.setItem(this.getTenantKey(KEYS.MATERIALES_PROYECTO), all.filter((m) => m.id !== id));
    supabaseService.deleteMaterial(id).catch((err) => console.warn('Delete supabase material:', err));
    return true;
  }

  updateMaterialProyecto(id: string, data: Partial<MaterialProyecto>): MaterialProyecto | null {
    const all = this.getItem<MaterialProyecto[]>(this.getTenantKey(KEYS.MATERIALES_PROYECTO), []);
    const index = all.findIndex((m) => m.id === id);
    if (index === -1) return null;
    all[index] = { ...all[index], ...data };
    this.setItem(this.getTenantKey(KEYS.MATERIALES_PROYECTO), all);
    supabaseService.saveMaterial(all[index]).catch((err) => console.warn('Sync supabase material:', err));
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
      id: 'bit-' + Date.now(),
      created_at: new Date().toISOString(),
    };
    all.unshift(newEntry);
    this.setItem(this.getTenantKey(KEYS.BITACORA), all);
    supabaseService.saveBitacora(newEntry).catch((err) => console.warn('Sync supabase bitacora:', err));
    return newEntry;
  }

  updateBitacoraEntrada(id: string, data: Partial<BitacoraEntrada>): BitacoraEntrada | null {
    const all = this.getItem<BitacoraEntrada[]>(this.getTenantKey(KEYS.BITACORA), []);
    const index = all.findIndex((b) => b.id === id);
    if (index === -1) return null;
    all[index] = { ...all[index], ...data };
    this.setItem(this.getTenantKey(KEYS.BITACORA), all);
    supabaseService.saveBitacora(all[index]).catch((err) => console.warn('Sync supabase bitacora:', err));
    return all[index];
  }

  deleteBitacoraEntrada(id: string): boolean {
    const all = this.getItem<BitacoraEntrada[]>(this.getTenantKey(KEYS.BITACORA), []);
    this.setItem(this.getTenantKey(KEYS.BITACORA), all.filter((b) => b.id !== id));
    supabaseService.deleteBitacora(id).catch((err) => console.warn('Delete supabase bitacora:', err));
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
      id: 'act-' + Date.now(),
      created_at: new Date().toISOString(),
    };
    actividades.push(newActividad);
    this.setItem(this.getTenantKey(KEYS.ACTIVIDADES), actividades);
    supabaseService.saveActividad(newActividad).catch((err) => console.warn('Sync supabase actividad:', err));
    return newActividad;
  }

  updateActividad(id: string, data: Partial<Actividad>): Actividad | null {
    const defaultActs = this.isDemoTenant() ? INITIAL_ACTIVIDADES : [];
    const actividades = this.getItem<Actividad[]>(this.getTenantKey(KEYS.ACTIVIDADES), defaultActs);
    const index = actividades.findIndex((a) => a.id === id);
    if (index === -1) return null;

    actividades[index] = { ...actividades[index], ...data };
    this.setItem(this.getTenantKey(KEYS.ACTIVIDADES), actividades);
    supabaseService.saveActividad(actividades[index]).catch((err) => console.warn('Sync supabase actividad:', err));
    return actividades[index];
  }

  deleteActividad(id: string): boolean {
    const defaultActs = this.isDemoTenant() ? INITIAL_ACTIVIDADES : [];
    const actividades = this.getItem<Actividad[]>(this.getTenantKey(KEYS.ACTIVIDADES), defaultActs);
    const filtered = actividades.filter((a) => a.id !== id);
    this.setItem(this.getTenantKey(KEYS.ACTIVIDADES), filtered);
    supabaseService.deleteActividad(id).catch((err) => console.warn('Delete supabase actividad:', err));
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
      id: 'pay-' + Date.now(),
      created_at: new Date().toISOString(),
    };
    pagos.push(newPago);
    this.setItem(this.getTenantKey(KEYS.PAGOS), pagos);
    supabaseService.savePago(newPago).catch((err) => console.warn('Sync supabase pago:', err));
    return newPago;
  }

  updatePago(id: string, data: Partial<Pago>): Pago | null {
    const defaultPagos = this.isDemoTenant() ? INITIAL_PAGOS : [];
    const pagos = this.getItem<Pago[]>(this.getTenantKey(KEYS.PAGOS), defaultPagos);
    const index = pagos.findIndex((p) => p.id === id);
    if (index === -1) return null;

    pagos[index] = { ...pagos[index], ...data };
    this.setItem(this.getTenantKey(KEYS.PAGOS), pagos);
    supabaseService.savePago(pagos[index]).catch((err) => console.warn('Sync supabase pago:', err));
    return pagos[index];
  }

  deletePago(id: string): boolean {
    const defaultPagos = this.isDemoTenant() ? INITIAL_PAGOS : [];
    const pagos = this.getItem<Pago[]>(this.getTenantKey(KEYS.PAGOS), defaultPagos);
    const filtered = pagos.filter((p) => p.id !== id);
    this.setItem(this.getTenantKey(KEYS.PAGOS), filtered);
    supabaseService.deletePago(id).catch((err) => console.warn('Delete supabase pago:', err));
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
      id: 'imp-' + Date.now(),
      created_at: new Date().toISOString(),
    };
    imprevistos.push(newImprevisto);
    this.setItem(this.getTenantKey(KEYS.IMPREVISTOS), imprevistos);
    supabaseService.saveImprevisto(newImprevisto).catch((err) => console.warn('Sync supabase imprevisto:', err));
    return newImprevisto;
  }

  updateImprevisto(id: string, data: Partial<Imprevisto>): Imprevisto | null {
    const defaultImps = this.isDemoTenant() ? INITIAL_IMPREVISTOS : [];
    const imprevistos = this.getItem<Imprevisto[]>(this.getTenantKey(KEYS.IMPREVISTOS), defaultImps);
    const index = imprevistos.findIndex((i) => i.id === id);
    if (index === -1) return null;

    imprevistos[index] = { ...imprevistos[index], ...data };
    this.setItem(this.getTenantKey(KEYS.IMPREVISTOS), imprevistos);
    supabaseService.saveImprevisto(imprevistos[index]).catch((err) => console.warn('Sync supabase imprevisto:', err));
    return imprevistos[index];
  }

  deleteImprevisto(id: string): boolean {
    const defaultImps = this.isDemoTenant() ? INITIAL_IMPREVISTOS : [];
    const imprevistos = this.getItem<Imprevisto[]>(this.getTenantKey(KEYS.IMPREVISTOS), defaultImps);
    const filtered = imprevistos.filter((i) => i.id !== id);
    this.setItem(this.getTenantKey(KEYS.IMPREVISTOS), filtered);
    supabaseService.deleteImprevisto(id).catch((err) => console.warn('Delete supabase imprevisto:', err));
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
      id: 'rep-' + Date.now(),
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
    const id = evento.id || 'evt-' + Date.now();
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
    supabaseService.saveEventoAgenda(fullEvento).catch(() => {});
    return fullEvento;
  }

  deleteEventoAgenda(id: string): boolean {
    const agenda = this.getEventosAgenda();
    const filtered = agenda.filter((e) => e.id !== id);
    this.setItem(this.getTenantKey(KEYS.AGENDA), filtered);
    supabaseService.deleteEventoAgenda(id).catch(() => {});
    return true;
  }

  toggleEventoAgenda(id: string): EventoAgenda | null {
    const agenda = this.getEventosAgenda();
    const idx = agenda.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    agenda[idx].completado = !agenda[idx].completado;
    this.setItem(this.getTenantKey(KEYS.AGENDA), agenda);
    supabaseService.saveEventoAgenda(agenda[idx]).catch(() => {});
    return agenda[idx];
  }

  // --- MÉTODOS DE INTEGRACIÓN CON IA ---
  crearProyectoDesdeIA(datos: {
    nombre: string;
    descripcion?: string;
    comuna?: string;
    direccion?: string;
    monto_cotizado?: number;
    monto?: number;
    dias_estimados?: number;
    dias?: number;
    partidas?: Array<{ nombre: string; dias: number }>;
    cliente_id?: string;
    cliente_nombre?: string;
    cliente_telefono?: string;
  }): Proyecto {
    let finalClienteId = datos.cliente_id;
    if (!finalClienteId && datos.cliente_nombre) {
      const existente = this.buscarClientePorRutONombre(datos.cliente_nombre);
      if (existente) {
        finalClienteId = existente.id;
      } else {
        const nuevoCli = this.createCliente({
          nombre: datos.cliente_nombre,
          telefono: datos.cliente_telefono || '+56900000000',
          email: `${datos.cliente_nombre.toLowerCase().replace(/\s+/g, '.')}@cliente.cl`,
          comuna: datos.comuna || 'Santiago',
          direccion: datos.direccion || '',
        });
        finalClienteId = nuevoCli.id;
      }
    }

    const fechaInicio = new Date().toISOString().split('T')[0];
    const dias = datos.dias_estimados ?? datos.dias ?? 30;
    const fechaFinDate = new Date();
    fechaFinDate.setDate(fechaFinDate.getDate() + dias);
    const fechaTermino = fechaFinDate.toISOString().split('T')[0];
    const monto = datos.monto_cotizado ?? datos.monto ?? 0;

    return this.createProyecto(
      {
        nombre: datos.nombre,
        descripcion: datos.descripcion || 'Creado automáticamente mediante copiloto de IA.',
        comuna: datos.comuna || 'Santiago',
        direccion: datos.direccion || '',
        monto_cotizado: monto,
        fecha_inicio: fechaInicio,
        fecha_termino_estimada: fechaTermino,
        estado: 'activo',
        cliente_id: finalClienteId,
        empresa_id: this.getActiveUser()?.empresa_id || DEMO_EMPRESA_ID,
      },
      datos.partidas
    );
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
      email: datos.email || `${datos.nombre.toLowerCase().replace(/\s+/g, '.')}@faena.cl`,
      telefono_whatsapp: datos.telefono || datos.telefono_whatsapp || '+56900000000',
      rut: datos.rut || '11.111.111-1',
      empresa_id: this.getActiveUser()?.empresa_id || DEMO_EMPRESA_ID,
    });
  }

  asignarTrabajadorAProyecto(trabajadorIdent: string, proyectoIdent: string): boolean {
    const proyectos = this.getProyectos();
    const proyecto =
      proyectos.find((p) => p.id === proyectoIdent) ||
      proyectos.find((p) => p.nombre.toLowerCase().includes(proyectoIdent.toLowerCase()));
    if (!proyecto) return false;

    const usuarios = this.getUsuarios();
    const trabajador =
      usuarios.find((u) => u.id === trabajadorIdent) ||
      usuarios.find((u) => u.nombre.toLowerCase().includes(trabajadorIdent.toLowerCase()));
    const trabajadorId = trabajador ? trabajador.id : trabajadorIdent;

    const current = proyecto.trabajadores_ids || [];
    if (current.includes(trabajadorId)) return true;
    this.updateProyecto(proyecto.id, {
      trabajadores_ids: [...current, trabajadorId],
    });
    return true;
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
    supabaseService.saveProyectoMensajeChat(fullMsg).catch((err) =>
      console.warn('Sync chat proyecto en Supabase:', err)
    );

    return fullMsg;
  }

  clearProyectoChatHistorial(proyectoId: string): void {
    const key = this.getTenantKey(`${KEYS.CHAT_PROYECTOS}_${proyectoId}`);
    this.setItem(key, []);
    supabaseService.clearProyectoChatHistorial(proyectoId).catch((err) =>
      console.warn('Clear chat proyecto en Supabase:', err)
    );
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
    const proyecto = this.getProyectoById(proyectoId);
    if (!proyecto) return { exito: false, mensaje: 'Proyecto no encontrado' };

    switch (accion.tipo) {
      case 'crear_actividad': {
        const dias = Number(accion.dias) || 5;
        const acts = this.getActividades(proyectoId);
        const lastAct = acts[acts.length - 1];
        let startDate = new Date();
        if (lastAct && lastAct.fecha_termino) {
          startDate = new Date(lastAct.fecha_termino);
        }
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + dias);

        const nueva = this.createActividad({
          proyecto_id: proyectoId,
          nombre: accion.nombre || 'Nueva Partida',
          fecha_inicio: startDate.toISOString().split('T')[0],
          fecha_termino: endDate.toISOString().split('T')[0],
          porcentaje_avance: 0,
          estado: 'pendiente',
          orden: acts.length + 1,
        });
        return { exito: true, mensaje: `Partida "${nueva.nombre}" agregada a la Carta Gantt.`, datos: nueva };
      }

      case 'actualizar_avance': {
        const acts = this.getActividades(proyectoId);
        const match = acts.find(
          (a) =>
            a.id === accion.actividad_id ||
            (accion.nombre && a.nombre.toLowerCase().includes(accion.nombre.toLowerCase()))
        );
        if (match) {
          const avance = Math.min(100, Math.max(0, Number(accion.porcentaje_avance) || 0));
          const estado = avance === 100 ? 'terminada' : avance > 0 ? 'en_curso' : 'pendiente';
          const updated = this.updateActividad(match.id, { porcentaje_avance: avance, estado });
          return { exito: true, mensaje: `Partida "${match.nombre}" actualizada al ${avance}%.`, datos: updated };
        }
        return { exito: false, mensaje: 'No se encontró la partida especificada para actualizar.' };
      }

      case 'registrar_imprevisto': {
        const monto = Number(accion.monto) || 0;
        const imp = this.createImprevisto({
          proyecto_id: proyectoId,
          descripcion: accion.descripcion || 'Imprevisto detectado en faena',
          monto,
          estado: 'pendiente',
          origen: 'whatsapp_ia',
          fecha: new Date().toISOString().split('T')[0],
        });
        return { exito: true, mensaje: `Imprevisto de $${monto.toLocaleString('es-CL')} CLP registrado.`, datos: imp };
      }

      case 'agregar_material': {
        const cant = Number(accion.cantidad) || 1;
        const pu = Number(accion.precio_unitario) || 0;
        const mat = this.createMaterialProyecto({
          proyecto_id: proyectoId,
          nombre: accion.nombre || 'Material de faena',
          cantidad: cant,
          unidad: accion.unidad || 'unidad',
          precio_unitario: pu,
          subtotal: cant * pu,
          categoria: accion.categoria || 'General',
          comprado: false,
        });
        return { exito: true, mensaje: `Material "${mat.nombre}" agregado al presupuesto.`, datos: mat };
      }

      case 'crear_bitacora': {
        const active = this.getActiveUser();
        const bit = this.createBitacoraEntrada({
          proyecto_id: proyectoId,
          usuario_id: active?.id || 'u-1',
          autor_nombre: active?.nombre || 'Inspector de Obra',
          titulo: accion.titulo || 'Registro de avance diario',
          nota: accion.nota || accion.descripcion || 'Sin observaciones.',
          tipo: accion.subtipo || 'avance',
          fecha: new Date().toISOString().split('T')[0],
        });
        return { exito: true, mensaje: `Entrada de bitácora "${bit.titulo}" guardada.`, datos: bit };
      }

      default:
        return { exito: true, mensaje: 'Acción informativa procesada.' };
    }
  }

  // --- SINCRONIZACIÓN Y CARGA DESDE SUPABASE ---
  async loadTenantDataFromSupabase(empresaId?: string): Promise<{ success: boolean; message: string }> {
    try {
      const active = this.getActiveUser();
      const targetEmpresaId = empresaId || active?.empresa_id || DEMO_EMPRESA_ID;

      const data = await supabaseService.loadTenantData(targetEmpresaId);

      this.setItem(this.getTenantKey(KEYS.PROYECTOS), data.proyectos);
      this.setItem(this.getTenantKey(KEYS.CLIENTES), data.clientes);
      this.setItem(
        this.getTenantKey(KEYS.USUARIOS),
        data.usuarios.length > 0 ? data.usuarios : active ? [active] : []
      );
      this.setItem(this.getTenantKey(KEYS.ACTIVIDADES), data.actividades);
      this.setItem(this.getTenantKey(KEYS.PAGOS), data.pagos);
      this.setItem(this.getTenantKey(KEYS.MATERIALES_PROYECTO), data.materiales);
      this.setItem(this.getTenantKey(KEYS.BITACORA), data.bitacora);
      this.setItem(this.getTenantKey(KEYS.IMPREVISTOS), data.imprevistos);
      this.setItem(this.getTenantKey(KEYS.AGENDA), data.agenda);

      if (data.empresa?.plan_id) {
        this.setItem(this.getTenantKey(KEYS.PLAN), data.empresa.plan_id);
      }

      return {
        success: true,
        message: `Datos sincronizados con Supabase (${data.proyectos.length} obras).`,
      };
    } catch (err: any) {
      console.warn('Error cargando tenant desde Supabase:', err);
      return { success: false, message: err.message || 'Error cargando datos desde Supabase.' };
    }
  }

  async syncWithSupabase(): Promise<{ success: boolean; count?: number; message: string }> {
    try {
      const proyectos = this.getProyectos();
      const actividades = this.getActividades();
      const pagos = this.getPagos();
      const imprevistos = this.getImprevistos();
      const materiales = this.getMaterialesProyecto();
      const bitacora = this.getBitacora();
      const clientes = this.getClientes();
      const usuarios = this.getUsuarios();

      let count = 0;
      for (const p of proyectos) {
        await supabaseService.saveProyecto(p);
        count++;
      }
      for (const c of clientes) {
        await supabaseService.saveCliente(c);
        count++;
      }
      for (const u of usuarios) {
        await supabaseService.saveUsuario(u);
        count++;
      }
      for (const a of actividades) {
        await supabaseService.saveActividad(a);
        count++;
      }
      for (const pay of pagos) {
        await supabaseService.savePago(pay);
        count++;
      }
      for (const m of materiales) {
        await supabaseService.saveMaterial(m);
        count++;
      }
      for (const b of bitacora) {
        await supabaseService.saveBitacora(b);
        count++;
      }
      for (const imp of imprevistos) {
        await supabaseService.saveImprevisto(imp);
        count++;
      }

      return {
        success: true,
        count,
        message: `Sincronización exitosa con Supabase (${count} registros).`,
      };
    } catch (err: any) {
      return { success: false, message: err.message || 'Error sincronizando con Supabase.' };
    }
  }

  async pullFromSupabase(): Promise<{ success: boolean; message: string }> {
    return this.loadTenantDataFromSupabase();
  }

}

export const dataService = new DataService();
