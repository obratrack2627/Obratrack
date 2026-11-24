'use client';
import { chileToday } from '@/lib/ai/project-deadlines';
import { addCalendarDays, calendarDays as diffCalendarDays } from '@/lib/work-calendar';

import MoneyAmount from "@/components/MoneyAmount";
import MaskedMoneyAmount from '@/components/MaskedMoneyAmount';
import CompactSummary from '@/components/CompactSummary';
import { projectStatuses, projectStatusLabel } from '@/lib/project-status';
import { ProjectStatusBadge } from '@/components/ProjectStatus';
import ActionMenu from '@/components/ActionMenu';
import WorkCalendarEditor from '@/components/WorkCalendarEditor';
import ModalOverlay from '@/components/ModalOverlay';
import { toast } from '@/components/ToastProvider';
import { PROJECT_TEMPLATES, shiftActivityDates } from '@/lib/project-templates';
import { downloadPortfolioExcel } from '@/lib/excel-export';
import ClientWhatsAppSummaryModal from '@/components/ClientWhatsAppSummaryModal';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Building2,
  Plus,
  TrendingUp,
  DollarSign,
  Clock,
  CheckCircle2,
  Calendar,
  User,
  ArrowUpRight,
  GanttChartSquare,
  Wallet,
  AlertCircle,
  X,
  Trash2,
  AlertTriangle,
  Edit3,
  HardHat,
  FolderPlus,
  Sparkles,
  Users,
  ShieldCheck,
  Search,
  Filter,
  MapPin,
  Navigation,
  Compass,
  Globe,
  Camera,
  Upload,
  Image as ImageIcon,
  Zap,
  FolderOpen,
  ClipboardCheck,
  LayoutGrid,
  List,
  Copy,
  FileSpreadsheet,
  ArrowUpDown,
  MessageCircle,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import PresupuestosPanel from '@/components/PresupuestosPanel';
import { dataService } from '@/lib/data-service';
import { canonicalPhone } from '@/lib/phone';
import { isValidEmail, sanitizeEmail } from '@/lib/auth/registration-validation';
import { Proyecto, Cliente, Usuario, SubscriptionPlanId, ProjectStatus } from '@/types/database';
import { formatDate, formatThousands, parseThousands } from '@/lib/utils';
import { getCoordenadasComuna } from '@/lib/chile-locations';
import PlanSwitcherModal from '@/components/PlanSwitcherModal';
import GoogleMapsLocationPicker from '@/components/GoogleMapsLocationPicker';
import GoogleMapsProjectViewer from '@/components/GoogleMapsProjectViewer';

export default function ProyectosPage() {
  const [tab,setTab]=useState<'obras'|'presupuestos'>('obras');
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [activeUser, setActiveUser] = useState<Usuario | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [activePlan, setActivePlan] = useState<SubscriptionPlanId>('pro_ia');
  const [projectToDelete, setProjectToDelete] = useState<Proyecto | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [viewingMapsProject, setViewingMapsProject] = useState<Proyecto | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [sortBy, setSortBy] = useState<'default' | 'entrega' | 'avance_asc' | 'monto_desc' | 'nombre'>('default');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [duplicatingProject, setDuplicatingProject] = useState<Proyecto | null>(null);
  const [dupNombre, setDupNombre] = useState('');
  const [dupClienteId, setDupClienteId] = useState('');
  const [dupFechaInicio, setDupFechaInicio] = useState(chileToday());
  const [dupCopyTasks, setDupCopyTasks] = useState(true);
  const [dupCopyCalendar, setDupCopyCalendar] = useState(true);
  const [dupCopyMaterials, setDupCopyMaterials] = useState(true);
  const [dupCopyCrew, setDupCopyCrew] = useState(true);
  const [duplicatingBusy, setDuplicatingBusy] = useState(false);
  const [summaryProject, setSummaryProject] = useState<Proyecto | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'presupuestos') setTab('presupuestos');
    if (params.get('nueva') === '1') {
      const plan = dataService.getActivePlan();
      const activeCount = dataService.getProyectos().filter((p) => p.estado === 'activo').length;
      if (plan === 'gratis' && activeCount >= 1) {
        setIsPlanModalOpen(true);
      } else {
        setIsModalOpen(true);
      }
    }
  }, []);

  // Modal para que el Maestro suba Avances y Fotos
  const [isAvanceModalOpen, setIsAvanceModalOpen] = useState(false);
  const [selectedProjectForAvance, setSelectedProjectForAvance] = useState<Proyecto | null>(null);
  const [avanceTitulo, setAvanceTitulo] = useState('');
  const [avanceNota, setAvanceNota] = useState('');
  const [avanceFoto, setAvanceFoto] = useState('');
  const [subiendoFoto,setSubiendoFoto]=useState(false);
  const [avanceTipo, setAvanceTipo] = useState<'avance' | 'incidente' | 'clima' | 'entrega_material'>('avance');

  // Filtros de búsqueda y estado
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | ProjectStatus>('activo');
  const [clientFilter, setClientFilter] = useState<string>('todos');

  // Formulario nuevo proyecto
  const [nombre, setNombre] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [nuevoCliente, setNuevoCliente] = useState(false);
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteTelefono, setClienteTelefono] = useState('');
  const [clienteEmail, setClienteEmail] = useState('');
  const [montoCotizado, setMontoCotizado] = useState('');
  const [fechaInicio, setFechaInicio] = useState(chileToday());
  const [fechaTermino, setFechaTermino] = useState(
    new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [calendarDays,setCalendarDays]=useState([1,2,3,4,5]);
  const [calendarExcluded,setCalendarExcluded]=useState<string[]>([]);
  const [editDays,setEditDays]=useState([1,2,3,4,5]);
  const [editExcluded,setEditExcluded]=useState<string[]>([]);
  const [descripcion, setDescripcion] = useState('');
  const [direccion, setDireccion] = useState('');
  const [comuna, setComuna] = useState('Las Condes');
  const [region, setRegion] = useState('Región Metropolitana de Santiago');
  const [latitud, setLatitud] = useState<number>(-33.4116);
  const [longitud, setLongitud] = useState<number>(-70.5794);
  const [lugarReferencia, setLugarReferencia] = useState('');
  const [selectedTrabajadores, setSelectedTrabajadores] = useState<string[]>([]);
  const [actividadesTexto, setActividadesTexto] = useState(
    ''
  );

  // Formulario editar proyecto
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');
  const [editingProject, setEditingProject] = useState<Proyecto | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editClienteId, setEditClienteId] = useState('');
  const [editMontoCotizado, setEditMontoCotizado] = useState('');
  const [editFechaInicio, setEditFechaInicio] = useState('');
  const [editFechaTermino, setEditFechaTermino] = useState('');
  const [editDescripcion, setEditDescripcion] = useState('');
  const [editDireccion, setEditDireccion] = useState('');
  const [editComuna, setEditComuna] = useState('Las Condes');
  const [editRegion, setEditRegion] = useState('Región Metropolitana de Santiago');
  const [editLatitud, setEditLatitud] = useState<number>(-33.4116);
  const [editLongitud, setEditLongitud] = useState<number>(-70.5794);
  const [editReferencia, setEditReferencia] = useState('');
  const [editEstado, setEditEstado] = useState<ProjectStatus>('activo');
  const [editTrabajadores, setEditTrabajadores] = useState<string[]>([]);

  const loadData = () => {
    const user = dataService.getActiveUser();
    setActiveUser(user);
    const projs = dataService.getProyectos();
    const cls = dataService.getClientes();
    const usrs = dataService.getUsuarios();
    const plan = dataService.getActivePlan();
    setProyectos(projs);
    setClientes(cls);
    setUsuarios(usrs);
    setActivePlan(plan);
  };

  useEffect(() => {
    loadData();
    const handler = (e: any) => {
      if (e.detail) setActivePlan(e.detail);
    };
    window.addEventListener('obratrack_plan_changed', handler);
    window.addEventListener('obratrack_cloud_synced', loadData);
    return () => {window.removeEventListener('obratrack_plan_changed', handler);window.removeEventListener('obratrack_cloud_synced', loadData);};
  }, []);

  // Métricas globales
  const proyectosActivos = proyectos.filter((p) => p.estado === 'activo');
  const cotizadoTotal = proyectosActivos.reduce((sum, p) => sum + (Number(p.monto_cotizado) || 0), 0);
  const totalCobrado = proyectosActivos.reduce((sum, p) => sum + (Number(p.total_pagado) || 0), 0);
  const porCobrar = Math.max(0, cotizadoTotal - totalCobrado);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    if (fechaInicio && fechaTermino && fechaTermino < fechaInicio) {
      setCreateError('La fecha de término estimada no puede ser anterior a la fecha de inicio.');
      return;
    }

    // Procesar actividades iniciales
    const initialActivities = actividadesTexto
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const daysMatch = line.match(/\((\d+)(?:\s*d[ií]as?)?\)/i);
        const dias = daysMatch ? Math.max(1, parseInt(daysMatch[1], 10)) : 7;
        const cleanName = line.replace(/\(\d+(?:\s*d[ií]as?)?\)/i, '').trim();
        return { nombre: cleanName || line, dias };
      });

    const activeUser = dataService.getActiveUser();

    try {
      setCreateError(null);
      if (!activeUser?.empresa_id) throw new Error('Inicia sesión antes de crear una obra.');
      let assignedClientId = clienteId;
      if (nuevoCliente) {
        const phone = canonicalPhone(clienteTelefono);
        const email = sanitizeEmail(clienteEmail).toLowerCase();
        if (!clienteNombre.trim() || !phone || !isValidEmail(email)) {
          throw new Error('Completa el nombre, un teléfono válido y el correo del nuevo cliente.');
        }
        const existing = dataService.getClientes().find(c =>
          canonicalPhone(c.telefono || '') === phone || (c.email || '').toLowerCase() === email);
        if (existing) throw new Error(`El teléfono o correo ya pertenece a ${existing.nombre}. Selecciona ese cliente existente.`);
        if (dataService.getActivePlan() === 'gratis' && dataService.getProyectos().some(p => p.estado === 'activo')) {
          throw new Error('El Plan Gratis permite una obra activa. Actualiza tu plan para crear otra.');
        }
        assignedClientId = dataService.createCliente({
          empresa_id: activeUser.empresa_id, nombre: clienteNombre.trim(), telefono: `+${phone}`, email,
        }).id;
        // Conservar la ficha si un paso posterior falla: el reintento usa el mismo cliente.
        setClienteId(assignedClientId);
        setNuevoCliente(false);
      }
      dataService.createProyecto(
        {
          empresa_id: activeUser.empresa_id,
          cliente_id: assignedClientId || undefined,
          nombre: nombre.trim(),
          descripcion: descripcion.trim(),
          direccion: direccion.trim(),
          comuna: comuna.trim(),
          region: region.trim(),
          latitud,
          longitud,
          lugar_referencia: lugarReferencia.trim(),
          dias_laborales: calendarDays,
          fechas_no_laborales: calendarExcluded,
          fecha_inicio: fechaInicio,
          fecha_termino_estimada: fechaTermino,
          estado: 'activo',
          monto_cotizado: parseThousands(montoCotizado),
          trabajadores_ids: selectedTrabajadores,
        },
        initialActivities
      );

      const createdName = nombre.trim();
      setIsModalOpen(false);
      setNombre('');
      setClienteId('');
      setClienteNombre('');
      setClienteTelefono('');
      setClienteEmail('');
      setDescripcion('');
      setDireccion('');
      setLugarReferencia('');
      setMontoCotizado('');
      setSelectedTrabajadores([]);
      loadData();
      try {
        await dataService.confirmarCambios();
        toast(`Obra "${createdName}" creada con ubicación geográfica exitosamente.`, 'success');
      } catch (syncErr) {
        toast(
          syncErr instanceof Error
            ? syncErr.message
            : `Obra "${createdName}" creada localmente; pendiente de sincronización.`,
          'info',
        );
      } finally {
        loadData();
      }
    } catch (err: any) {
      setCreateError(err.message || 'Error al crear la obra.');
    }
  };

  const handleOpenEdit = (proj: Proyecto) => {
    const coords = {
      lat: proj.latitud ?? getCoordenadasComuna(proj.comuna).lat,
      lng: proj.longitud ?? getCoordenadasComuna(proj.comuna).lng,
    };
    setEditingProject(proj);
    setEditNombre(proj.nombre);
    setEditClienteId(proj.cliente_id || '');
    setEditError('');
    setEditMontoCotizado(formatThousands(proj.monto_cotizado || ''));
    setEditDays(proj.dias_laborales || [1,2,3,4,5]);
    setEditExcluded(proj.fechas_no_laborales || []);
    setEditFechaInicio(proj.fecha_inicio);
    setEditFechaTermino(proj.fecha_termino_estimada);
    setEditDescripcion(proj.descripcion || '');
    setEditDireccion(proj.direccion || '');
    setEditComuna(proj.comuna || 'Las Condes');
    setEditRegion(proj.region || 'Región Metropolitana de Santiago');
    setEditLatitud(coords.lat);
    setEditLongitud(coords.lng);
    setEditReferencia(proj.lugar_referencia || '');
    setEditEstado(proj.estado);
    setEditTrabajadores(proj.trabajadores_ids || []);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject || !editNombre.trim() || savingEdit) return;
    if (editFechaInicio && editFechaTermino && editFechaTermino < editFechaInicio) {
      setEditError('La fecha de término estimada no puede ser anterior a la fecha de inicio.');
      return;
    }
    setSavingEdit(true);
    setEditError('');
    try {

    await dataService.guardarEdicionProyecto(editingProject.id, {
      nombre: editNombre.trim(),
      cliente_id: editClienteId || undefined,
      monto_cotizado: parseThousands(editMontoCotizado),
      dias_laborales: editDays,
      fechas_no_laborales: editExcluded,
      fecha_inicio: editFechaInicio,
      fecha_termino_estimada: editFechaTermino,
      descripcion: editDescripcion.trim(),
      direccion: editDireccion.trim(),
      comuna: editComuna.trim(),
      region: editRegion.trim(),
      latitud: editLatitud,
      longitud: editLongitud,
      lugar_referencia: editReferencia.trim(),
      estado: editEstado,
      trabajadores_ids: editTrabajadores,
    });

    setEditingProject(null);
    toast(`Obra "${editNombre.trim()}" actualizada exitosamente.`, 'success');
    loadData();
    } catch (error) { setEditError(error instanceof Error ? error.message : 'No se pudo guardar la obra.'); }
    finally { setSavingEdit(false); }
  };

  const isTerreno = activeUser?.rol === 'terreno';

  const handleCrearAvanceTerreno = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectForAvance || !avanceTitulo.trim() || subiendoFoto) return;

    const autor = activeUser?.nombre || 'Maestro de Faena';

    // 1. Guardar en Bitácora de la Obra
    dataService.createBitacoraEntrada({
      proyecto_id: selectedProjectForAvance.id,
      titulo: avanceTitulo.trim(),
      nota: avanceNota.trim(),
      foto_url: avanceFoto.trim() || undefined,
      tipo: avanceTipo,
      fecha: chileToday(),
      autor_nombre: autor,
    });

    // 2. Crear Reporte para el Dueño
    dataService.createReporte({
      proyecto_id: selectedProjectForAvance.id,
      usuario_id: activeUser?.id,
      mensaje_original: `[Reporte de Faena Web] ${avanceTitulo.trim()}: ${avanceNota.trim()}`,
      transcripcion: avanceNota.trim(),
      fecha: chileToday(),
      extraccion_ia: {
        actividad_detectada: avanceTitulo.trim(),
        avance_porcentaje: avanceTipo === 'avance' ? 100 : null,
        tiene_imprevisto: avanceTipo === 'incidente',
        imprevisto_descripcion: avanceTipo === 'incidente' ? avanceNota.trim() : null,
      },
      estado: 'aprobado',
    });

    toast(`Avance y foto registrados con éxito en la obra "${selectedProjectForAvance.nombre}".`, 'success');
    setIsAvanceModalOpen(false);
    setSelectedProjectForAvance(null);
    setAvanceTitulo('');
    setAvanceNota('');
    setAvanceFoto('');
    setAvanceTipo('avance');
    loadData();
  };

  const confirmDelete = async () => {
    if (!projectToDelete) return;
    const deletedName = projectToDelete.nombre;
    dataService.deleteProyecto(projectToDelete.id);
    setProjectToDelete(null);
    loadData();
    try {
      await dataService.confirmarCambios();
      toast(`Obra "${deletedName}" eliminada exitosamente.`, 'success');
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : `Eliminación de "${deletedName}" pendiente de sincronización.`,
        'info',
      );
    } finally {
      loadData();
    }
  };

  const handleOpenDuplicate = (proj: Proyecto) => {
    setDuplicatingProject(proj);
    setDupNombre(`${proj.nombre} (Copia)`);
    setDupClienteId(proj.cliente_id || '');
    setDupFechaInicio(chileToday());
    setDupCopyTasks(true);
    setDupCopyCalendar(true);
    setDupCopyMaterials(true);
    setDupCopyCrew(true);
  };

  const handleDuplicateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!duplicatingProject || !dupNombre.trim() || duplicatingBusy) return;
    if (activePlan === 'gratis' && proyectosActivos.length >= 1) {
      setDuplicatingProject(null);
      setIsPlanModalOpen(true);
      return;
    }

    setDuplicatingBusy(true);
    try {
      const startIso = dupFechaInicio || chileToday();
      let endIso = addCalendarDays(startIso, 30);
      if (duplicatingProject.fecha_inicio && duplicatingProject.fecha_termino_estimada) {
        try {
          const span = Math.max(
            1,
            diffCalendarDays(duplicatingProject.fecha_inicio, duplicatingProject.fecha_termino_estimada),
          );
          endIso = addCalendarDays(startIso, span);
        } catch {
          endIso = addCalendarDays(startIso, 30);
        }
      }

      const created = dataService.createProyecto(
        {
          empresa_id: activeUser?.empresa_id || duplicatingProject.empresa_id,
          cliente_id: dupClienteId || undefined,
          nombre: dupNombre.trim(),
          descripcion: duplicatingProject.descripcion || '',
          direccion: duplicatingProject.direccion || '',
          comuna: duplicatingProject.comuna || '',
          region: duplicatingProject.region || '',
          latitud: duplicatingProject.latitud,
          longitud: duplicatingProject.longitud,
          lugar_referencia: duplicatingProject.lugar_referencia || '',
          dias_laborales: dupCopyCalendar
            ? duplicatingProject.dias_laborales || [1, 2, 3, 4, 5]
            : [1, 2, 3, 4, 5],
          fechas_no_laborales: dupCopyCalendar
            ? duplicatingProject.fechas_no_laborales || []
            : [],
          fecha_inicio: startIso,
          fecha_termino_estimada: endIso,
          estado: 'activo',
          monto_cotizado: Number(duplicatingProject.monto_cotizado) || 0,
          trabajadores_ids: dupCopyCrew ? duplicatingProject.trabajadores_ids || [] : [],
        },
        [],
      );

      if (dupCopyTasks) {
        const sourceTasks = dataService.getActividades(duplicatingProject.id);
        const shifted = shiftActivityDates(
          sourceTasks,
          duplicatingProject.fecha_inicio || startIso,
          startIso,
        );
        shifted.forEach((act, idx) => {
          dataService.createActividad({
            proyecto_id: created.id,
            nombre: act.nombre,
            fecha_inicio: act.fecha_inicio,
            fecha_termino: act.fecha_termino,
            porcentaje_avance: 0,
            estado: 'pendiente',
            monto_contratado: act.monto_contratado,
            orden: act.orden ?? idx + 1,
            responsable_id: dupCopyCrew ? act.responsable_id : undefined,
          });
        });
      }

      if (dupCopyMaterials) {
        const sourceMaterials = dataService.getMaterialesProyecto(duplicatingProject.id);
        sourceMaterials.forEach((mat) => {
          dataService.createMaterialProyecto({
            proyecto_id: created.id,
            nombre: mat.nombre,
            cantidad: mat.cantidad,
            unidad: mat.unidad,
            precio_unitario: mat.precio_unitario,
            subtotal: mat.subtotal,
            categoria: mat.categoria,
            proveedor: mat.proveedor,
            actividad_id: null,
            comprado: false,
          });
        });
      }

      setDuplicatingProject(null);
      loadData();
      try {
        await dataService.confirmarCambios();
        toast(`Obra "${created.nombre}" duplicada exitosamente.`, 'success');
      } catch (syncError) {
        toast(
          syncError instanceof Error
            ? syncError.message
            : `Obra "${created.nombre}" duplicada localmente; pendiente de sincronización.`,
          'info',
        );
      } finally {
        loadData();
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : 'No se pudo duplicar la obra.', 'error');
    } finally {
      setDuplicatingBusy(false);
    }
  };

  const handleQuickChangeStatus = async (proj: Proyecto, nextStatus: ProjectStatus) => {
    if (proj.estado === nextStatus) return;
    try {
      await dataService.guardarEdicionProyecto(proj.id, { estado: nextStatus });
      loadData();
      toast(`Estado de "${proj.nombre}" actualizado a ${projectStatusLabel(nextStatus)}.`, 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'No se pudo actualizar el estado.', 'error');
    }
  };

  const handleExportPortfolioExcel = async () => {
    try {
      await downloadPortfolioExcel({
        empresaNombre: dataService.getEmpresa()?.nombre,
        proyectos,
        clientes,
        materiales: dataService.getMaterialesProyecto(),
        imprevistos: dataService.getImprevistos(),
        pagos: dataService.getPagos(),
        reclamos: dataService.getReclamosCambios(),
      });
      toast('Cartera de obras exportada en Excel (.xlsx).', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'No se pudo exportar la cartera.', 'error');
    }
  };

  const toggleTrabajadorSelection = (userId: string, isEditing: boolean = false) => {
    if (isEditing) {
      setEditTrabajadores((prev) =>
        prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
      );
    } else {
      setSelectedTrabajadores((prev) =>
        prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
      );
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <PlanSwitcherModal
        isOpen={isPlanModalOpen}
        onClose={() => setIsPlanModalOpen(false)}
      />

      <Navbar
        title={isTerreno ? 'Obras Asignadas' : 'Obras y proyectos'}
        subtitle={
          isTerreno
            ? 'Vista de faena para reporte de avances, fotos y ubicación en mapas'
            : 'Tus obras y presupuestos.'
        }
        action={
          isTerreno || tab === 'presupuestos' ? null : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportPortfolioExcel}
                className="px-3 py-2.5 bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] hover:border-[#FF6A00] text-navy-900 dark:text-white text-xs sm:text-sm font-semibold rounded-xl shadow-sm flex items-center gap-1.5 transition-all font-heading"
                title="Descargar cartera completa en Excel"
              >
                <FileSpreadsheet className="w-4 h-4 text-[#6B8F72]" />
                <span className="hidden sm:inline">Cartera (.xlsx)</span>
              </button>

              <button
                onClick={() => {
                  if (activePlan === 'gratis' && proyectosActivos.length >= 1) {
                    setIsPlanModalOpen(true);
                  } else {
                    setIsModalOpen(true);
                  }
                }}
                className="px-4 py-2.5 bg-obra-orange hover:bg-obra-orange-hover text-white text-sm font-semibold rounded-xl shadow-sm flex items-center gap-2 transition-all font-heading"
              >
                <Plus className="w-4 h-4" />
                <span>Nueva obra</span>
              </button>
            </div>
          )
        }
      />

      <div className="p-6 max-w-7xl w-full mx-auto space-y-6">
        
        {!isTerreno && (
          <div
            role="tablist"
            aria-label="Proyectos y obras"
            className="flex sm:inline-flex min-w-0 gap-1 rounded-xl border border-kraft-200 dark:border-[#263040] bg-kraft-100 dark:bg-[#0B0F14] p-1"
          >
            <button
              role="tab"
              aria-selected={tab === 'obras'}
              onClick={() => setTab('obras')}
              className={`flex-1 sm:flex-none rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                tab === 'obras'
                  ? 'bg-white dark:bg-[#1E2530] text-obra-orange shadow-sm'
                  : 'text-gray-500 hover:text-navy-900 dark:hover:text-gray-200'
              }`}
            >
              Obras
            </button>
            <button
              role="tab"
              aria-selected={tab === 'presupuestos'}
              onClick={() => setTab('presupuestos')}
              className={`flex-1 sm:flex-none rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                tab === 'presupuestos'
                  ? 'bg-white dark:bg-[#1E2530] text-obra-orange shadow-sm'
                  : 'text-gray-500 hover:text-navy-900 dark:hover:text-gray-200'
              }`}
            >
              Presupuestos
            </button>
          </div>
        )}
        {tab==='presupuestos'&&!isTerreno ? <PresupuestosPanel/> : <>
        {/* Banner Informativo si está en Plan Gratis y llegó al límite */}
        {activePlan === 'gratis' && proyectosActivos.length >= 1 && (
          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-800/50 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <p className="text-xs font-bold font-heading">
                  Límite del Plan Gratis alcanzado ({proyectosActivos.length}/1 obra en curso)
                </p>
                <p className="text-[11px] text-amber-800 dark:text-amber-300/90 font-sans">
                  Para gestionar obras ilimitadas, desbloquear el Cotizador con IA y el comparador de precios, activa el <strong>Plan Pro</strong>.
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsPlanModalOpen(true)}
              className="px-3.5 py-1.5 bg-[#FF6A00] hover:bg-[#E55F00] text-white text-xs font-bold rounded-xl shadow-sm transition-colors whitespace-nowrap"
            >
              Ver planes
            </button>
          </div>
        )}
        
        {/* Tarjetas de Resumen KPI */}
        <CompactSummary><div className="workspace-metrics grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Obras en curso */}
          <div className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-xs font-mono font-semibold uppercase text-gray-500 dark:text-gray-400 tracking-wider">
                Obras en curso
              </p>
              <div className="w-8 h-8 rounded-lg bg-navy-800 text-obra-orange flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold font-heading text-navy-900 dark:text-white">
              {proyectosActivos.length}
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-sans mt-1">
              {proyectos.length} proyectos en total
            </p>
          </div>

          {/* Cotizado Total */}
          <div className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-xs font-mono font-semibold uppercase text-gray-500 dark:text-gray-400 tracking-wider">
                Cotizado Total
              </p>
              <div className="w-8 h-8 rounded-lg bg-obra-orange-light dark:bg-obra-orange/15 text-obra-orange flex items-center justify-center shrink-0">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-navy-900 dark:text-white">
              <MaskedMoneyAmount value={cotizadoTotal} label="Cotizado Total" />
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-sans mt-1">
              En obras en ejecución
            </p>
          </div>

          {/* Total Cobrado */}
          <div className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-xs font-mono font-semibold uppercase text-gray-500 dark:text-gray-400 tracking-wider">
                Total Cobrado
              </p>
              <div className="w-8 h-8 rounded-lg bg-obra-green-light dark:bg-obra-green/15 text-obra-green flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-obra-green">
              <MaskedMoneyAmount value={totalCobrado} label="Total Cobrado" />
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-sans mt-1">
              {cotizadoTotal > 0 ? Math.round((totalCobrado / cotizadoTotal) * 100) : 0}% recaudado
            </p>
          </div>

          {/* Por Cobrar */}
          <div className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-xs font-mono font-semibold uppercase text-gray-500 dark:text-gray-400 tracking-wider">
                Saldo Por Cobrar
              </p>
              <div className="w-8 h-8 rounded-lg bg-obra-red-light dark:bg-obra-red/15 text-obra-red flex items-center justify-center shrink-0">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-obra-red">
              <MaskedMoneyAmount value={porCobrar} label="Saldo Por Cobrar" />
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-sans mt-1">
              Estados de pago pendientes
            </p>
          </div>

        </div></CompactSummary>

        {/* Grid de Proyectos */}
        <div className="space-y-4">
          {/* Barra de Búsqueda y Filtros de Proyectos */}
          <div className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl p-3.5 sm:p-4 shadow-sm space-y-3">
            {/* Fila Superior: Buscador expandido + Selector de Cliente */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Buscar por obra, cliente, comuna o descripción..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-10 pl-10 pr-8 bg-kraft-50 dark:bg-[#0F141C] border border-kraft-200 dark:border-[#263040] rounded-xl text-xs text-navy-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:border-obra-orange focus:bg-white dark:focus:bg-[#141A23] transition-colors font-sans"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    aria-label="Limpiar búsqueda"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full hover:bg-kraft-200 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex items-center justify-center text-xs transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>

              {clientes.length > 0 && (
                <div className="relative w-full sm:w-56 shrink-0">
                  <User className="w-3.5 h-3.5 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    aria-label="Filtrar por cliente"
                    value={clientFilter}
                    onChange={(e) => setClientFilter(e.target.value)}
                    className="w-full h-10 pl-9 pr-8 bg-kraft-50 dark:bg-[#0F141C] border border-kraft-200 dark:border-[#263040] rounded-xl text-xs font-medium text-navy-900 dark:text-gray-100 font-sans focus:outline-none focus:border-obra-orange focus:bg-white dark:focus:bg-[#141A23] transition-colors truncate"
                  >
                    <option value="todos">Todos los clientes ({clientes.length})</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
                <div className="relative flex-1 sm:flex-none sm:w-44">
                  <ArrowUpDown className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    aria-label="Ordenar obras"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                    className="w-full h-10 pl-8 pr-3 bg-kraft-50 dark:bg-[#0F141C] border border-kraft-200 dark:border-[#263040] rounded-xl text-xs font-medium text-navy-900 dark:text-gray-100 font-sans focus:outline-none focus:border-obra-orange transition-colors"
                  >
                    <option value="default">Orden: Activas primero</option>
                    <option value="entrega">Entrega más próxima</option>
                    <option value="avance_asc">Menor avance primero</option>
                    <option value="monto_desc">Mayor monto cotizado</option>
                    <option value="nombre">Nombre A–Z</option>
                  </select>
                </div>

                {!isTerreno && (
                  <div
                    role="group"
                    aria-label="Modo de vista de obras"
                    className="inline-flex items-center rounded-xl border border-kraft-200 dark:border-[#263040] bg-kraft-50 dark:bg-[#0F141C] p-1 gap-0.5"
                  >
                    <button
                      type="button"
                      onClick={() => setViewMode('grid')}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-heading font-semibold inline-flex items-center gap-1 transition-all ${
                        viewMode === 'grid'
                          ? 'bg-white dark:bg-[#141A23] text-navy-900 dark:text-white shadow-sm'
                          : 'text-gray-500 hover:text-navy-900 dark:text-gray-400 dark:hover:text-white'
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Tarjetas</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('table')}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-heading font-semibold inline-flex items-center gap-1 transition-all ${
                        viewMode === 'table'
                          ? 'bg-white dark:bg-[#141A23] text-navy-900 dark:text-white shadow-sm'
                          : 'text-gray-500 hover:text-navy-900 dark:text-gray-400 dark:hover:text-white'
                      }`}
                    >
                      <List className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Tabla</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Fila Inferior: Pestañas de Estado con scroll táctil en móvil */}
            <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-kraft-100 dark:border-[#1E2530]">
              <div
                role="tablist"
                aria-label="Filtrar obras por estado"
                className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 sm:pb-0 -mx-1 px-1"
              >
                {(
                  [
                    {
                      value: 'todos',
                      label: 'Todas',
                      count: proyectos.length,
                      dot: 'bg-gray-400',
                      activeClass: 'bg-navy-900 text-white border-navy-900 dark:bg-white dark:text-navy-900 dark:border-white shadow-sm',
                    },
                    {
                      value: 'activo',
                      label: 'En curso',
                      count: proyectos.filter((p) => p.estado === 'activo').length,
                      dot: 'bg-obra-green',
                      activeClass: 'bg-obra-green text-white border-obra-green shadow-sm',
                    },
                    {
                      value: 'pendiente',
                      label: 'Pendientes',
                      count: proyectos.filter((p) => p.estado === 'pendiente').length,
                      dot: 'bg-amber-500',
                      activeClass: 'bg-amber-500 text-white border-amber-500 shadow-sm',
                    },
                    {
                      value: 'pausado',
                      label: 'Pausadas',
                      count: proyectos.filter((p) => p.estado === 'pausado').length,
                      dot: 'bg-slate-400',
                      activeClass: 'bg-slate-700 text-white border-slate-700 shadow-sm',
                    },
                    {
                      value: 'terminado',
                      label: 'Terminadas',
                      count: proyectos.filter((p) => p.estado === 'terminado').length,
                      dot: 'bg-blue-500',
                      activeClass: 'bg-blue-600 text-white border-blue-600 shadow-sm',
                    },
                    {
                      value: 'cancelada',
                      label: 'Canceladas',
                      count: proyectos.filter((p) => p.estado === 'cancelada').length,
                      dot: 'bg-red-500',
                      activeClass: 'bg-red-600 text-white border-red-600 shadow-sm',
                    },
                  ] as const
                ).map((tab) => {
                  const isActive = statusFilter === tab.value;
                  return (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      key={tab.value}
                      onClick={() => setStatusFilter(tab.value)}
                      className={`h-8 px-3 rounded-xl text-xs font-heading font-semibold inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap border transition-all ${
                        isActive
                          ? tab.activeClass
                          : 'bg-kraft-50 dark:bg-[#0F141C] text-gray-600 dark:text-gray-300 border-kraft-200 dark:border-[#263040] hover:bg-kraft-100 dark:hover:bg-[#1E2530]'
                      }`}
                    >
                      {tab.value !== 'todos' && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            isActive ? 'bg-white dark:bg-current' : tab.dot
                          }`}
                        />
                      )}
                      <span>{tab.label}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                          isActive
                            ? 'bg-white/20 text-current'
                            : 'bg-kraft-200/70 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {(searchTerm || statusFilter !== 'todos' || clientFilter !== 'todos') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('todos');
                    setClientFilter('todos');
                  }}
                  className="text-xs font-heading font-bold text-obra-orange hover:underline shrink-0 pl-2 whitespace-nowrap"
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>

          {/* Listado */}
          {(() => {
            const filteredProyectos = proyectos.filter((p) => {
              const matchStatus = statusFilter === 'todos' || p.estado === statusFilter;
              const matchClient = clientFilter === 'todos' || p.cliente_id === clientFilter;
              const term = searchTerm.toLowerCase();
              const matchSearch =
                p.nombre.toLowerCase().includes(term) ||
                (p.descripcion && p.descripcion.toLowerCase().includes(term)) ||
                (p.comuna && p.comuna.toLowerCase().includes(term)) ||
                (p.direccion && p.direccion.toLowerCase().includes(term)) ||
                (p.cliente?.nombre && p.cliente.nombre.toLowerCase().includes(term));
              return matchStatus && matchClient && matchSearch;
            }).sort((a, b) => {
              if (sortBy === 'entrega') {
                return (a.fecha_termino_estimada || '9999-12-31').localeCompare(
                  b.fecha_termino_estimada || '9999-12-31',
                );
              }
              if (sortBy === 'avance_asc') {
                return (a.porcentaje_avance_ponderado || 0) - (b.porcentaje_avance_ponderado || 0);
              }
              if (sortBy === 'monto_desc') {
                return (Number(b.monto_cotizado) || 0) - (Number(a.monto_cotizado) || 0);
              }
              if (sortBy === 'nombre') {
                return a.nombre.localeCompare(b.nombre, 'es');
              }
              return Number(b.estado === 'activo') - Number(a.estado === 'activo');
            });

            if (filteredProyectos.length === 0) {
              return (
                <div className="bg-white dark:bg-[#141A23] border-2 border-dashed border-[#E5DFC9] dark:border-[#263040] rounded-3xl p-10 text-center max-w-xl mx-auto space-y-4">
                  <div className="w-16 h-16 rounded-3xl bg-[#FAF8F5] dark:bg-[#0F141C] border border-[#E5DFC9] dark:border-[#263040] flex items-center justify-center mx-auto text-[#FF6A00]">
                    <HardHat className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="font-heading font-black text-xl text-[#1E1E1E] dark:text-white">
                      {searchTerm || statusFilter !== 'todos' || clientFilter !== 'todos'
                        ? 'No se encontraron obras'
                        : 'Aún no has registrado ninguna obra'}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-sans mt-1.5 max-w-md mx-auto leading-relaxed">
                      {searchTerm || statusFilter !== 'todos' || clientFilter !== 'todos'
                        ? 'Prueba modificando tus filtros o el término de búsqueda.'
                        : 'Comienza agregando tu primer proyecto con su monto en CLP, cliente y trabajadores asignados.'}
                    </p>
                  </div>
                  {searchTerm || statusFilter !== 'todos' || clientFilter !== 'todos' ? (
                    <button
                      onClick={() => {
                        setSearchTerm('');
                        setStatusFilter('todos');
                        setClientFilter('todos');
                      }}
                      className="px-4 py-2 bg-kraft-100 hover:bg-kraft-200 dark:bg-[#1E2530] dark:hover:bg-[#263040] text-navy-900 dark:text-white text-xs font-bold rounded-xl transition-all font-heading"
                    >
                      Limpiar filtros
                    </button>
                  ) : (
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                      <button
                        onClick={() => setIsModalOpen(true)}
                        className="w-full sm:w-auto px-5 py-2.5 bg-[#FF6A00] hover:bg-[#E55F00] text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 font-heading"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Crear Primera Obra</span>
                      </button>
                      <Link
                        href="/cotizador"
                        className="w-full sm:w-auto px-5 py-2.5 bg-white dark:bg-[#0F141C] border border-[#E5DFC9] dark:border-[#263040] hover:bg-[#FAF8F5] dark:hover:bg-[#1A222D] text-[#1E1E1E] dark:text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 font-heading"
                      >
                        <Sparkles className="w-4 h-4 text-[#FF6A00]" />
                        <span>Ir al Cotizador IA</span>
                      </Link>
                    </div>
                  )}
                </div>
              );
            }

            if (!isTerreno && viewMode === 'table') {
              return (
                <div className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-[#FAF8F5] dark:bg-[#1A222D] border-b border-kraft-200 dark:border-[#263040] text-[11px] font-mono uppercase text-gray-500 dark:text-gray-400">
                          <th className="py-3 px-4">Obra</th>
                          <th className="py-3 px-4">Mandante</th>
                          <th className="py-3 px-4">Comuna</th>
                          <th className="py-3 px-4">Estado</th>
                          <th className="py-3 px-4">Avance</th>
                          <th className="py-3 px-4">Término</th>
                          <th className="py-3 px-4 text-right">Cotizado</th>
                          <th className="py-3 px-4 text-right">Recaudado</th>
                          <th className="py-3 px-4 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-kraft-100 dark:divide-[#1E2530]">
                        {filteredProyectos.map((proj) => {
                          const cotizado = proj.monto_cotizado || 0;
                          const pagado = proj.total_pagado || 0;
                          const avance = proj.porcentaje_avance_ponderado || 0;
                          return (
                            <tr
                              key={proj.id}
                              data-project-id={proj.id}
                              className="hover:bg-kraft-50/50 dark:hover:bg-[#1A222D]/50 transition-colors"
                            >
                              <td className="py-3 px-4 font-heading font-bold text-navy-900 dark:text-white max-w-[220px]">
                                <Link
                                  href={`/proyectos/${proj.id}/gantt`}
                                  className="hover:text-obra-orange hover:underline line-clamp-1"
                                >
                                  {proj.nombre}
                                </Link>
                              </td>
                              <td className="py-3 px-4 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                                {proj.cliente?.nombre || 'Particular'}
                              </td>
                              <td className="py-3 px-4 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                {proj.comuna || 'Chile'}
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap">
                                <ProjectStatusBadge estado={proj.estado} />
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap">
                                <div className="flex items-center gap-2 min-w-[90px]">
                                  <div className="flex-1 h-1.5 bg-kraft-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-obra-orange rounded-full"
                                      style={{ width: `${avance}%` }}
                                    />
                                  </div>
                                  <span className="font-mono font-bold text-[11px] text-navy-900 dark:text-gray-200">
                                    {avance}%
                                  </span>
                                </div>
                              </td>
                              <td className="py-3 px-4 font-mono text-[11px] text-gray-600 dark:text-gray-300 whitespace-nowrap">
                                {formatDate(proj.fecha_termino_estimada)}
                              </td>
                              <td className="py-3 px-4 text-right font-mono font-bold text-navy-900 dark:text-white whitespace-nowrap">
                                <MaskedMoneyAmount value={cotizado} label={`Cotizado de ${proj.nombre}`} compact />
                              </td>
                              <td className="py-3 px-4 text-right font-mono font-bold text-[#6B8F72] whitespace-nowrap">
                                <MaskedMoneyAmount value={pagado} label={`Pagado de ${proj.nombre}`} compact />
                              </td>
                              <td className="py-3 px-4 text-right whitespace-nowrap">
                                <div className="inline-flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setSummaryProject(proj)}
                                    title="Resumen mandante"
                                    className="p-1.5 rounded-lg border border-kraft-200 dark:border-[#263040] text-[#25D366] hover:border-[#25D366] transition-colors"
                                  >
                                    <MessageCircle className="w-3.5 h-3.5" />
                                  </button>
                                  <Link
                                    href={`/proyectos/${proj.id}/gantt`}
                                    className="px-2.5 py-1.5 rounded-lg bg-navy-900 dark:bg-obra-orange text-white text-[11px] font-heading font-semibold hover:opacity-90"
                                  >
                                    Abrir
                                  </Link>
                                  <ActionMenu label={`Acciones de ${proj.nombre}`}>
                                    <button type="button" onClick={() => setSummaryProject(proj)}>Resumen mandante</button>
                                    <button type="button" onClick={() => handleOpenDuplicate(proj)}>Duplicar obra</button>
                                    <button type="button" onClick={() => handleOpenEdit(proj)}>Editar obra</button>
                                    <button type="button" onClick={() => setViewingMapsProject(proj)}>Ver ubicación</button>
                                    <button type="button" className="text-red-600" onClick={() => setProjectToDelete(proj)}>Eliminar obra</button>
                                  </ActionMenu>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredProyectos.map((proj) => {
                const pagado = proj.total_pagado || 0;
                const cotizado = proj.monto_cotizado || 0;
                const percentPago = cotizado > 0 ? Math.min(100, Math.round((pagado / cotizado) * 100)) : 0;
                const avance = proj.porcentaje_avance_ponderado || 0;
                const workers = proj.trabajadores || [];

                return (
                  <div
                    key={proj.id}
                    data-project-id={proj.id}
                    className="bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      {/* Header Obra */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="overflow-hidden">
                          <h3 className="font-heading font-bold text-base text-navy-900 dark:text-white leading-snug line-clamp-2">
                            <Link href={`/proyectos/${proj.id}/gantt`} className="hover:text-obra-orange hover:underline focus-visible:underline">{proj.nombre}</Link>
                          </h3>
                          <div className="flex flex-col gap-0.5 mt-0.5">
                            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 truncate">
                              <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              <span>{proj.cliente?.nombre || 'Cliente Particular'}</span>
                            </p>
                            {/* Botón rápido para abrir en Google Maps */}
                            <button
                              type="button"
                              onClick={() => setViewingMapsProject(proj)}
                              className="text-xs text-gray-500 dark:text-gray-400 hover:text-[#FF6A00] flex items-center gap-1 truncate transition-colors text-left group"
                              title="Ver ubicación en Google Maps"
                            >
                              <MapPin className="w-3.5 h-3.5 text-[#FF6A00] shrink-0 group-hover:scale-110 transition-transform" />
                              <span className="font-semibold truncate">
                                {proj.direccion
                                  ? proj.comuna &&
                                    !proj.direccion
                                      .toLowerCase()
                                      .includes(proj.comuna.toLowerCase())
                                    ? `${proj.direccion}, ${proj.comuna}`
                                    : proj.direccion
                                  : `📍 ${proj.comuna || 'Chile'}`}
                              </span>
                            </button>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1 shrink-0">
                          <ProjectStatusBadge estado={proj.estado} />
                          
                          <ActionMenu label={`Acciones de ${proj.nombre}`}>
                            {!isTerreno && (
                              <button type="button" onClick={() => setSummaryProject(proj)}>Resumen mandante</button>
                            )}
                            {!isTerreno && (
                              <button type="button" onClick={() => handleOpenDuplicate(proj)}>Duplicar obra</button>
                            )}
                            <button type="button" onClick={() => handleOpenEdit(proj)}>Editar obra</button>
                            <button type="button" onClick={() => setViewingMapsProject(proj)}>Ver ubicación</button>
                            <button type="button" className="text-red-600" onClick={() => setProjectToDelete(proj)}>Eliminar obra</button>
                          </ActionMenu>
                        </div>
                      </div>

                      {/* Descripción breve */}
                      {proj.descripcion && (
                        <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2 mb-3 font-sans leading-relaxed">
                          {proj.descripcion}
                        </p>
                      )}

                      {/* Trabajadores asignados */}
                      {workers.length > 0 && (
                        <div className="mb-3 flex items-center gap-1.5 overflow-hidden">
                          <span className="text-[11px] font-mono text-gray-400 flex items-center gap-1">
                            <Users className="w-3 h-3 text-[#FF6A00]" />
                            <span>Equipo:</span>
                          </span>
                          <div className="flex items-center -space-x-1.5 overflow-hidden">
                            {workers.slice(0, 4).map((w) => (
                              <div
                                key={w.id}
                                title={`${w.nombre} (${w.rol})`}
                                className="w-6 h-6 rounded-full bg-[#1E1E1E] text-white border-2 border-white dark:border-[#141A23] flex items-center justify-center text-[9px] font-bold uppercase shrink-0"
                              >
                                {w.nombre.charAt(0)}
                              </div>
                            ))}
                            {workers.length > 4 && (
                              <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-[#263040] text-gray-700 dark:text-gray-200 border-2 border-white dark:border-[#141A23] flex items-center justify-center text-[9px] font-bold shrink-0">
                                +{workers.length - 4}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Barra de Avance Ponderado */}
                      <div className="space-y-1.5 mb-4">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-gray-600 dark:text-gray-300">Avance General</span>
                          <span className="font-mono text-obra-orange">{avance}%</span>
                        </div>
                        <div className="w-full h-2 bg-kraft-100 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-obra-orange rounded-full transition-all duration-500"
                            style={{ width: `${avance}%` }}
                          />
                        </div>
                      </div>

                      {/* Estado de Pago vs Info de Terreno */}
                      {isTerreno ? (
                        <div className="bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 rounded-xl p-3 mb-4">
                          <p className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 mb-1">
                            <HardHat className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>Faena Asignada a tu Cuadrilla</span>
                          </p>
                          <p className="text-[10px] text-gray-500 font-sans leading-tight">
                            Usa el botón de abajo para registrar el avance del día y adjuntar fotografías.
                          </p>
                        </div>
                      ) : (
                        <div className="bg-kraft-50 dark:bg-[#0F141C] border border-kraft-200/60 dark:border-[#263040] rounded-lg p-3 space-y-1.5 mb-4">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="text-gray-500 dark:text-gray-400 font-mono">Cotizado:</span>
                            <span className="font-mono font-bold text-navy-900 dark:text-white">
                              <MaskedMoneyAmount value={cotizado} label={`Cotizado de ${proj.nombre}`} compact />
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="text-gray-500 dark:text-gray-400 font-mono">Pagado ({percentPago}%):</span>
                            <span className="font-mono font-bold text-obra-green">
                              <MaskedMoneyAmount value={pagado} label={`Pagado de ${proj.nombre}`} compact />
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 text-xs pt-1 border-t border-kraft-200/60 dark:border-[#263040]">
                            <span className="text-gray-500 dark:text-gray-400 font-mono">Saldo:</span>
                            <span className="font-mono font-semibold text-obra-red">
                              <MaskedMoneyAmount value={proj.saldo_pendiente ?? 0} label={`Saldo de ${proj.nombre}`} compact />
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Fechas de Obra */}
                      <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 font-mono mb-4">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          {formatDate(proj.fecha_inicio)}
                        </span>
                        <span>→</span>
                        <span>{formatDate(proj.fecha_termino_estimada)}</span>
                      </div>
                    </div>

                    {/* Acciones directas */}
                    {isTerreno ? (
                      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-kraft-200 dark:border-[#263040]">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedProjectForAvance(proj);
                            setIsAvanceModalOpen(true);
                          }}
                          className="col-span-2 py-2 px-2 bg-[#FF6A00] hover:bg-[#E55F00] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all font-heading shadow-md shadow-[#FF6A00]/20 truncate"
                        >
                          <Camera className="w-4 h-4 shrink-0" />
                          <span className="truncate">Subir Fotos / Avance</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setViewingMapsProject(proj)}
                          className="py-2 px-1.5 bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] hover:border-[#FF6A00] text-gray-800 dark:text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all font-heading shadow-sm truncate"
                          title="Ver ubicación en Google Maps"
                        >
                          <MapPin className="w-3.5 h-3.5 text-[#FF6A00] shrink-0" />
                          <span className="truncate">Maps</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 pt-3 border-t border-kraft-200 dark:border-[#263040]">
                        <Link href={`/proyectos/${proj.id}/gantt`} className="flex-1 inline-flex justify-center items-center gap-2 rounded-xl bg-navy-900 dark:bg-obra-orange px-3 py-2.5 text-sm font-semibold text-white hover:bg-navy-800 dark:hover:bg-obra-orange-hover transition-colors">Abrir obra</Link>
                        <Link href={`/proyectos/${proj.id}/ia`} aria-label={`ObraBot de ${proj.nombre}`} className="inline-flex items-center justify-center rounded-xl border border-kraft-200 dark:border-[#263040] p-2.5 text-obra-orange hover:border-obra-orange"><Sparkles size={18} aria-hidden="true" /></Link>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
        </div>

        </>}
      </div>

      {/* Modal: + Nueva obra */}
      {isModalOpen && (
        <ModalOverlay onClose={() => setIsModalOpen(false)} className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg my-auto bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl sm:rounded-3xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-kraft-200 dark:border-[#263040]">
              <h3 className="font-heading font-bold text-lg text-navy-900 dark:text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-obra-orange" />
                <span>Crear obra</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createError && (
              <div className="mb-4 p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-900 dark:text-amber-200 text-xs space-y-2 animate-in fade-in">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="font-medium">{createError}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setIsPlanModalOpen(true);
                  }}
                  className="w-full py-1.5 bg-[#FF6A00] hover:bg-[#E55F00] text-white rounded-lg font-bold font-heading text-[11px] transition-all flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Ver Planes para Obras Ilimitadas</span>
                </button>
              </div>
            )}

            <form onSubmit={handleCreateProject} className="space-y-4">
              {/* Plantillas rápidas chilenas */}
              <div className="rounded-xl bg-kraft-50 dark:bg-[#0F141C] border border-kraft-200 dark:border-[#263040] p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-obra-orange" />
                    <span>Plantilla rápida de partidas (opcional)</span>
                  </span>
                  {selectedTemplateId && (
                    <span className="text-[10px] font-mono font-bold text-[#6B8F72]">
                      Plantilla cargada
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PROJECT_TEMPLATES.map((tpl) => {
                    const active = selectedTemplateId === tpl.id;
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => {
                          setSelectedTemplateId(tpl.id);
                          setActividadesTexto(
                            tpl.partidas.map((p) => `${p.nombre} (${p.dias} días)`).join('\n'),
                          );
                          if (!descripcion.trim()) setDescripcion(tpl.descripcion);
                          setFechaTermino(
                            addCalendarDays(fechaInicio || chileToday(), tpl.duracionTotalDias),
                          );
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-heading font-semibold border transition-all ${
                          active
                            ? 'bg-obra-orange text-white border-obra-orange shadow-sm'
                            : 'bg-white dark:bg-[#141A23] text-navy-900 dark:text-gray-200 border-kraft-200 dark:border-[#263040] hover:border-obra-orange'
                        }`}
                      >
                        {tpl.nombre}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label htmlFor="create-project-name" className="block text-xs font-mono font-semibold text-gray-700 dark:text-gray-300 uppercase mb-1">
                  Nombre de la Obra *
                </label>
                <input
                  type="text"
                  required
                  id="create-project-name" placeholder="Ej: Ampliación de terraza"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm focus:outline-none focus:border-obra-orange"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Cliente
                  </label>
                  <select
                    aria-label="Cliente de la nueva obra"
                    value={nuevoCliente ? '__nuevo__' : clienteId}
                    onChange={(e) => { setNuevoCliente(e.target.value === '__nuevo__'); setClienteId(e.target.value === '__nuevo__' ? '' : e.target.value); }}
                    className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm focus:outline-none focus:border-obra-orange"
                  >
                    <option value="">Cliente Particular / Sin registrar</option>
                    <option value="__nuevo__">+ Crear nuevo cliente</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                  {nuevoCliente && (
                    <div className="mt-3 space-y-3 rounded-xl border border-kraft-200 dark:border-[#263040] p-3">
                      <label className="block text-xs">Nombre del cliente *
                        <input required value={clienteNombre} onChange={e => setClienteNombre(e.target.value)} className="mt-1 w-full rounded-lg border border-kraft-200 bg-kraft-50 dark:bg-[#0F141C] px-3 py-2" />
                      </label>
                      <label className="block text-xs">Teléfono del cliente *
                        <input required type="tel" placeholder="+56 9 1234 5678" value={clienteTelefono} onChange={e => setClienteTelefono(e.target.value)} className="mt-1 w-full rounded-lg border border-kraft-200 bg-kraft-50 dark:bg-[#0F141C] px-3 py-2" />
                      </label>
                      <label className="block text-xs">Correo del cliente *
                        <input required type="email" value={clienteEmail} onChange={e => setClienteEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-kraft-200 bg-kraft-50 dark:bg-[#0F141C] px-3 py-2" />
                      </label>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Monto Cotizado (CLP) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-sm">
                      $
                    </span>
                    <input
                      type="text"
                      placeholder="8.000.000"
                      value={montoCotizado}
                      onChange={(e) => setMontoCotizado(formatThousands(e.target.value))}
                      className="w-full pl-8 pr-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm font-mono focus:outline-none focus:border-obra-orange font-bold text-navy-900"
                    />
                  </div>
                </div>
              </div>

              {/* Asignar Trabajadores */}
              {usuarios.length > 0 && (
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 dark:text-gray-300 uppercase mb-1.5">
                    Asignar Trabajadores / Responsables de Obra
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-kraft-50 dark:bg-[#0F141C] rounded-xl border border-kraft-200 dark:border-[#263040] max-h-36 overflow-y-auto">
                    {usuarios.map((u) => {
                      const isChecked = selectedTrabajadores.includes(u.id);
                      return (
                        <label
                          key={u.id}
                          className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer text-xs transition-colors select-none ${
                            isChecked
                              ? 'bg-white dark:bg-[#141A23] border border-[#FF6A00] shadow-sm'
                              : 'hover:bg-white/70 dark:hover:bg-[#141A23]/60'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleTrabajadorSelection(u.id, false)}
                            className="rounded text-[#FF6A00] focus:ring-0"
                          />
                          <div className="overflow-hidden">
                            <p className="font-bold text-navy-900 dark:text-white truncate">{u.nombre}</p>
                            <p className="text-[10px] text-gray-400 font-mono capitalize">{u.rol}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Fecha de Inicio
                  </label>
                  <input
                    type="date"
                    required
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                    className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm font-mono focus:outline-none focus:border-obra-orange"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Fecha Término Estimada
                  </label>
                  <input
                    type="date"
                    required
                    value={fechaTermino}
                    onChange={(e) => setFechaTermino(e.target.value)}
                    className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm font-mono focus:outline-none focus:border-obra-orange"
                  />
                </div>
              </div>

              <WorkCalendarEditor days={calendarDays} excluded={calendarExcluded} onChange={(days,excluded)=>{setCalendarDays(days);setCalendarExcluded(excluded);}}/>
              {/* Selector Interactivo de Ubicación en Google Maps */}
              <details className="rounded-xl border border-kraft-200 p-3 dark:border-[#263040]"><summary className="cursor-pointer text-sm font-semibold">Ubicación y referencias</summary><div className="mt-3"><GoogleMapsLocationPicker
                direccion={direccion}
                comuna={comuna}
                region={region}
                latitud={latitud}
                longitud={longitud}
                lugarReferencia={lugarReferencia}
                onChange={(loc) => {
                  setDireccion(loc.direccion);
                  setComuna(loc.comuna);
                  setRegion(loc.region);
                  setLatitud(loc.latitud);
                  setLongitud(loc.longitud);
                  setLugarReferencia(loc.lugarReferencia);
                }}
              /></div></details>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Descripción / Alcance
                </label>
                <textarea
                  rows={2}
                  placeholder="Detalles de los trabajos a ejecutar..."
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm focus:outline-none focus:border-obra-orange"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase">
                    Actividades Iniciales (para la Carta Gantt)
                  </label>
                  <span className="text-[11px] font-mono font-bold text-obra-orange">
                    {actividadesTexto.split('\n').filter((l) => l.trim().length > 0).length} partidas
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={actividadesTexto}
                  onChange={(e) => setActividadesTexto(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-xs font-mono focus:outline-none focus:border-obra-orange"
                />
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  {[
                    'Preparación de terreno (2 días)',
                    'Obra gruesa / Estructura (5 días)',
                    'Instalaciones (3 días)',
                    'Terminaciones y entrega (3 días)',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() =>
                        setActividadesTexto((prev) =>
                          prev.trim() ? `${prev.trim()}\n${preset}` : preset,
                        )
                      }
                      className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-kraft-100 hover:bg-kraft-200 text-navy-900 transition-colors"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] text-gray-400 font-mono mt-1 block">
                  Escribe una actividad por línea con su duración estimada en días entre paréntesis.
                </span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-kraft-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-obra-orange hover:bg-obra-orange-hover text-white text-sm font-semibold rounded-lg shadow-sm font-heading"
                >
                  Crear Proyecto
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}

      {/* Modal: Editar Proyecto */}
      {editingProject && (
        <ModalOverlay className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg my-auto bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl sm:rounded-3xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-kraft-200">
              <h3 className="font-heading font-bold text-lg text-navy-900 flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-obra-orange" />
                <span>Editar Obra</span>
              </h3>
              <button
                onClick={() => setEditingProject(null)}
                className="p-1 text-gray-400 hover:text-gray-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label htmlFor="edit-project-name" className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Nombre de la Obra *
                </label>
                <input
                  id="edit-project-name" type="text"
                  required
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm focus:outline-none focus:border-obra-orange"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Cliente
                  </label>
                  <select
                    value={editClienteId}
                    onChange={(e) => setEditClienteId(e.target.value)}
                    className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm focus:outline-none focus:border-obra-orange"
                  >
                    <option value="">Cliente Particular / Sin registrar</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Estado de la Obra
                  </label>
                  <select
                    value={editEstado}
                    onChange={(e) => setEditEstado(e.target.value as ProjectStatus)}
                    className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm focus:outline-none focus:border-obra-orange"
                  >
                    {projectStatuses.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Monto Cotizado (CLP) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-sm">
                    $
                  </span>
                  <input
                    type="text"
                    value={editMontoCotizado}
                    onChange={(e) => setEditMontoCotizado(formatThousands(e.target.value))}
                    className="w-full pl-8 pr-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm font-mono focus:outline-none focus:border-obra-orange font-bold text-navy-900"
                  />
                </div>
              </div>

              {/* Asignar Trabajadores en Edición */}
              {usuarios.length > 0 && (
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 dark:text-gray-300 uppercase mb-1.5">
                    Trabajadores Asignados a la Obra
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-kraft-50 dark:bg-[#0F141C] rounded-xl border border-kraft-200 dark:border-[#263040] max-h-36 overflow-y-auto">
                    {usuarios.map((u) => {
                      const isChecked = editTrabajadores.includes(u.id);
                      return (
                        <label
                          key={u.id}
                          className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer text-xs transition-colors select-none ${
                            isChecked
                              ? 'bg-white dark:bg-[#141A23] border border-[#FF6A00] shadow-sm'
                              : 'hover:bg-white/70 dark:hover:bg-[#141A23]/60'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleTrabajadorSelection(u.id, true)}
                            className="rounded text-[#FF6A00] focus:ring-0"
                          />
                          <div className="overflow-hidden">
                            <p className="font-bold text-navy-900 dark:text-white truncate">{u.nombre}</p>
                            <p className="text-[10px] text-gray-400 font-mono capitalize">{u.rol}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Fecha de Inicio
                  </label>
                  <input
                    type="date"
                    required
                    value={editFechaInicio}
                    onChange={(e) => setEditFechaInicio(e.target.value)}
                    className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm font-mono focus:outline-none focus:border-obra-orange"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                    Fecha Término Estimada
                  </label>
                  <input
                    type="date"
                    required
                    value={editFechaTermino}
                    onChange={(e) => setEditFechaTermino(e.target.value)}
                    className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm font-mono focus:outline-none focus:border-obra-orange"
                  />
                </div>
              </div>

              <WorkCalendarEditor days={editDays} excluded={editExcluded} onChange={(days,excluded)=>{setEditDays(days);setEditExcluded(excluded);}}/>
              {/* Selector Interactivo de Ubicación en Google Maps (Edición) */}
              <details className="rounded-xl border border-kraft-200 p-3 dark:border-[#263040]"><summary className="cursor-pointer text-sm font-semibold">Ubicación y referencias</summary><div className="mt-3"><GoogleMapsLocationPicker
                direccion={editDireccion}
                comuna={editComuna}
                region={editRegion}
                latitud={editLatitud}
                longitud={editLongitud}
                lugarReferencia={editReferencia}
                onChange={(loc) => {
                  setEditDireccion(loc.direccion);
                  setEditComuna(loc.comuna);
                  setEditRegion(loc.region);
                  setEditLatitud(loc.latitud);
                  setEditLongitud(loc.longitud);
                  setEditReferencia(loc.lugarReferencia);
                }}
              /></div></details>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
                  Descripción / Alcance
                </label>
                <textarea
                  rows={2}
                  value={editDescripcion}
                  onChange={(e) => setEditDescripcion(e.target.value)}
                  className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-lg text-sm focus:outline-none focus:border-obra-orange"
                />
              </div>

              {editError && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{editError}</p>}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-kraft-200">
                <button
                  type="button"
                  onClick={() => setEditingProject(null)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit" disabled={savingEdit}
                  className="px-5 py-2 bg-obra-orange hover:bg-obra-orange-hover text-white text-sm font-semibold rounded-lg shadow-sm font-heading"
                >
                  {savingEdit ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}

      {/* Modal de Confirmación: Eliminar Proyecto */}
      {projectToDelete && (
        <ModalOverlay className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md my-auto bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl animate-in zoom-in-95 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="font-heading font-black text-xl text-[#1E1E1E]">
                ¿Eliminar esta obra?
              </h3>
              <p className="text-sm font-bold text-[#FF6A00]">
                &quot;{projectToDelete.nombre}&quot;
              </p>
              <p className="text-xs text-gray-500 font-sans mt-2 leading-relaxed">
                Esta acción eliminará de forma permanente el proyecto, sus trabajadores asignados, su Carta Gantt, sus materiales, estados de pago e imprevistos.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setProjectToDelete(null)}
                className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-heading font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-heading font-bold transition-colors shadow-md flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Sí, Eliminar</span>
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Modal: Subir Fotos y Reporte de Avance (Vista Maestro / Terreno) */}
      {isAvanceModalOpen && selectedProjectForAvance && (
        <ModalOverlay className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg my-auto bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl sm:rounded-3xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#FF6A00]/10 text-[#FF6A00] flex items-center justify-center">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-sm text-gray-900 dark:text-white">
                    Subir Avance / Fotos de Faena
                  </h3>
                  <p className="text-[11px] text-[#FF6A00] font-mono truncate max-w-[240px]">
                    {selectedProjectForAvance.nombre}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAvanceModalOpen(false)}
                className="text-gray-400 hover:text-gray-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCrearAvanceTerreno} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-mono font-semibold text-gray-700 dark:text-gray-300 uppercase mb-1">
                  Título del Avance / Tarea Realizada *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Hormigonado de radier sector poniente completado"
                  value={avanceTitulo}
                  onChange={(e) => setAvanceTitulo(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] dark:bg-[#0F141C] border border-[#E5DFC9] dark:border-[#263040] rounded-xl text-xs text-gray-900 dark:text-white focus:outline-none focus:border-[#FF6A00] font-sans"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-mono font-semibold text-gray-700 dark:text-gray-300 uppercase mb-1">
                    Tipo de Reporte
                  </label>
                  <select
                    value={avanceTipo}
                    onChange={(e) => setAvanceTipo(e.target.value as any)}
                    className="w-full px-3 py-2 bg-[#FAF8F5] dark:bg-[#0F141C] border border-[#E5DFC9] dark:border-[#263040] rounded-xl text-xs text-gray-900 dark:text-white focus:outline-none focus:border-[#FF6A00] font-mono"
                  >
                    <option value="avance">✅ Avance de Partida</option>
                    <option value="incidente">⚠️ Imprevisto / Incidente</option>
                    <option value="entrega_material">📦 Llegada de Materiales</option>
                    <option value="clima">🌧️ Condición Climática</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-mono font-semibold text-gray-700 dark:text-gray-300 uppercase mb-1">
                    Autor
                  </label>
                  <input
                    type="text"
                    disabled
                    value={activeUser?.nombre || 'Maestro Terreno'}
                    className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-600 dark:text-gray-400 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono font-semibold text-gray-700 dark:text-gray-300 uppercase mb-1">
                  Fotografía de Faena (Archivo o Link)
                </label>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="url"
                      placeholder="https://..."
                      value={avanceFoto}
                      onChange={(e) => setAvanceFoto(e.target.value)}
                      className="flex-1 px-3 py-2 bg-[#FAF8F5] dark:bg-[#0F141C] border border-[#E5DFC9] dark:border-[#263040] rounded-xl text-xs text-gray-900 dark:text-white font-mono focus:outline-none focus:border-[#FF6A00]"
                    />
                  </div>

                  <input aria-label="Subir foto de avance" type="file" accept="image/jpeg,image/png,image/webp" disabled={subiendoFoto} onChange={async e=>{
                    const file=e.target.files?.[0];if(!file||!selectedProjectForAvance)return;
                    setSubiendoFoto(true);try{const uploaded=await dataService.uploadArchivoObra(file,selectedProjectForAvance.id,'bitacora-fotos');setAvanceFoto(uploaded.publicUrl);}catch(error){toast((error as Error).message, 'error');}finally{setSubiendoFoto(false);}
                  }} className="text-sm w-full"/>
                  {subiendoFoto&&<p role="status" className="text-xs">Subiendo foto…</p>}

                  {avanceFoto && (
                    <div className="relative w-full h-36 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-black">
                      <img src={avanceFoto} alt="Preview Faena" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setAvanceFoto('')}
                        className="absolute top-2 right-2 p-1 bg-black/70 hover:bg-red-600 text-white rounded-full transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono font-semibold text-gray-700 dark:text-gray-300 uppercase mb-1">
                  Observaciones / Detalle para el Jefe *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe el avance del día, materiales utilizados o cualquier necesidad para mañana..."
                  value={avanceNota}
                  onChange={(e) => setAvanceNota(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] dark:bg-[#0F141C] border border-[#E5DFC9] dark:border-[#263040] rounded-xl text-xs text-gray-900 dark:text-white focus:outline-none focus:border-[#FF6A00] font-sans"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsAvanceModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!avanceTitulo.trim() || !avanceNota.trim()}
                  className="px-5 py-2.5 bg-[#FF6A00] hover:bg-[#E55F00] text-white text-xs font-bold rounded-xl shadow-md font-heading transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  <span>Enviar Avance a Bitácora</span>
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}

      {/* Modal: Visor Completo de Google Maps de la Obra */}
      <GoogleMapsProjectViewer
        proyecto={viewingMapsProject}
        isOpen={!!viewingMapsProject}
        onClose={() => setViewingMapsProject(null)}
      />

      {/* Modal: Duplicar Obra como Plantilla */}
      {duplicatingProject && (
        <ModalOverlay
          onClose={() => setDuplicatingProject(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl sm:rounded-3xl bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] p-5 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in-95"
          >
            <div className="flex items-start justify-between gap-3 border-b border-kraft-200 dark:border-[#263040] pb-3">
              <div>
                <h3 className="font-heading font-bold text-base text-navy-900 dark:text-white flex items-center gap-2">
                  <Copy className="w-4 h-4 text-obra-orange shrink-0" />
                  <span>Duplicar obra como plantilla</span>
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                  Origen: {duplicatingProject.nombre}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDuplicatingProject(null)}
                className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-white rounded-lg"
                aria-label="Cerrar modal de duplicar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDuplicateProject} className="space-y-3.5">
              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 dark:text-gray-300 uppercase mb-1">
                  Nombre de la nueva obra *
                </label>
                <input
                  type="text"
                  required
                  value={dupNombre}
                  onChange={(e) => setDupNombre(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-kraft-50 dark:bg-[#0F141C] border border-kraft-200 dark:border-[#263040] text-sm text-navy-900 dark:text-white focus:outline-none focus:border-obra-orange"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 dark:text-gray-300 uppercase mb-1">
                    Cliente
                  </label>
                  <select
                    value={dupClienteId}
                    onChange={(e) => setDupClienteId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-kraft-50 dark:bg-[#0F141C] border border-kraft-200 dark:border-[#263040] text-xs text-navy-900 dark:text-white focus:outline-none focus:border-obra-orange"
                  >
                    <option value="">Cliente Particular</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono font-semibold text-gray-700 dark:text-gray-300 uppercase mb-1">
                    Fecha de inicio *
                  </label>
                  <input
                    type="date"
                    required
                    value={dupFechaInicio}
                    onChange={(e) => setDupFechaInicio(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-kraft-50 dark:bg-[#0F141C] border border-kraft-200 dark:border-[#263040] text-xs font-mono text-navy-900 dark:text-white focus:outline-none focus:border-obra-orange"
                  />
                </div>
              </div>

              <div className="rounded-xl bg-kraft-50 dark:bg-[#0F141C] border border-kraft-200 dark:border-[#263040] p-3 space-y-2">
                <p className="text-[11px] font-mono font-semibold uppercase text-gray-500 dark:text-gray-400">
                  Contenido a copiar
                </p>
                <label className="flex items-center gap-2 text-xs text-navy-900 dark:text-gray-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dupCopyTasks}
                    onChange={(e) => setDupCopyTasks(e.target.checked)}
                    className="rounded text-obra-orange focus:ring-0"
                  />
                  <span>Partidas Gantt (con fechas recalculadas y 0% avance)</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-navy-900 dark:text-gray-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dupCopyCalendar}
                    onChange={(e) => setDupCopyCalendar(e.target.checked)}
                    className="rounded text-obra-orange focus:ring-0"
                  />
                  <span>Calendario laboral y feriados</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-navy-900 dark:text-gray-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dupCopyMaterials}
                    onChange={(e) => setDupCopyMaterials(e.target.checked)}
                    className="rounded text-obra-orange focus:ring-0"
                  />
                  <span>Materiales presupuestados (pendientes de compra)</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-navy-900 dark:text-gray-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dupCopyCrew}
                    onChange={(e) => setDupCopyCrew(e.target.checked)}
                    className="rounded text-obra-orange focus:ring-0"
                  />
                  <span>Cuadrilla asignada</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-kraft-200 dark:border-[#263040]">
                <button
                  type="button"
                  onClick={() => setDuplicatingProject(null)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-navy-900 dark:hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={duplicatingBusy || !dupNombre.trim()}
                  className="px-4 py-2 rounded-xl bg-obra-orange hover:bg-obra-orange-hover text-white text-xs font-heading font-bold shadow-sm disabled:opacity-50"
                >
                  {duplicatingBusy ? 'Duplicando...' : 'Duplicar obra'}
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}

      {/* Modal: Resumen de avance al mandante */}
      <ClientWhatsAppSummaryModal
        proyecto={summaryProject}
        cliente={
          summaryProject?.cliente_id
            ? clientes.find((c) => c.id === summaryProject.cliente_id) || summaryProject?.cliente
            : summaryProject?.cliente
        }
        isOpen={!!summaryProject}
        onClose={() => setSummaryProject(null)}
      />
    </div>
  );
}
